import * as dotenv from 'dotenv';
dotenv.config();

import { Document } from 'langchain/document';
import { Pinecone } from "@pinecone-database/pinecone";
import { PineconeStore } from "@langchain/pinecone";
import { OpenAIEmbeddings } from '@langchain/openai';

/**
 * Service class for managing Pinecone vector database operations
 * Handles document uploads, store creation, and other Pinecone-related functionality
 */
export class PineconeService {
  private pinecone: Pinecone;
  private embeddingModel: OpenAIEmbeddings;
  private indexName: string
  
  /**
   * Initialize the Pinecone service
   * @param embeddingModel - Optional custom embedding model
   */
  constructor(embeddingModel?: OpenAIEmbeddings) {
    this.pinecone = new Pinecone();
    this.embeddingModel = embeddingModel || new OpenAIEmbeddings({
      model: "text-embedding-3-large"
    });
    this.indexName = process.env.PINECONE_INDEX || '';
  }
  
  /**
   * Upload unstructured documents to a Pinecone index
   * @param documents - Array of Langchain documents with embeddings in metadata
   * @param indexName - Target Pinecone index name
   * @returns The original documents
   */
  async uploadUnstructuredDocuments(
    documents: Document[],
  ): Promise<Document[]> {
    try {
      const indexName = this.indexName
      const index = this.pinecone.Index(indexName);
      
      // Prepare vectors for Pinecone
      const vectors = documents.map((doc, idx) => {
        if (!doc.metadata.embedding) {
          throw new Error(`Document at index ${idx} is missing embeddings in metadata`);
        }
        
        // Extract embedding from metadata
        const embedding = doc.metadata.embedding;
        
        // Create a copy of metadata without the embedding to avoid duplication
        const minifiedMetadata = {
          filename: doc.metadata.filename,
          filetype: doc.metadata.filetype,
          page_number: doc.metadata.page_number,
          element_id: doc.metadata.element_id || `unknown-${idx}`,
          element_type: doc.metadata.type,
          
          // Include a small preview of text rather than the full content
          text_preview: doc.pageContent.substring(0, 500) + (doc.pageContent.length > 500 ? "..." : ""),
          text_length: doc.pageContent.length
        };
  
        return {
          id: doc.metadata.element_id || `fallback-id-${idx}`,
          values: embedding,
          metadata: minifiedMetadata
        };
      });
      
      // Process in smaller batches to avoid size limits
      const batchSize = 10; // Adjust this value as needed
      let totalUploaded = 0;
      
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await index.upsert(batch);
        totalUploaded += batch.length;
        console.log(`Uploaded batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(vectors.length/batchSize)} (${totalUploaded}/${vectors.length} vectors)`);
      }
  
      console.log(`Successfully uploaded ${totalUploaded} vectors to Pinecone index "${indexName}"`);
      
      return documents;
    } catch (err) {
      console.error("Error uploading documents to Pinecone:", err);
      throw err;
    }
  }
  
  /**
   * Create a PineconeStore from an existing index
   * @param indexName - Optional index name (defaults to PINECONE_INDEX env variable)
   * @returns Initialized PineconeStore
   */
  async createStore(indexName?: string): Promise<PineconeStore> {
    const index = indexName || process.env.PINECONE_INDEX;
    
    if (!index) {
      throw new Error("No Pinecone index specified. Provide an index name or set PINECONE_INDEX environment variable.");
    }
    
    const pineconeIndex = this.pinecone.Index(index);
  
    const pineconeStore = await PineconeStore.fromExistingIndex(this.embeddingModel, {
      pineconeIndex,
      maxConcurrency: 5,
    });
  
    return pineconeStore;
  }
  
}

export async function newPinecone(){
  return new PineconeService();
}