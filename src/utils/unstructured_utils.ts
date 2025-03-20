import axios, { AxiosResponse } from 'axios';
import { Storage } from '@google-cloud/storage';
import { Pinecone } from '@pinecone-database/pinecone';
import { Document } from 'langchain/document';

export class UnstructuredUtil {
  private apiKey: string;
  private sourceId: string;
  private destinationId: string;
  private workflowId: string;
  private gcsBucket: string;
  private gcsClient: Storage;
  private baseUrl: string = 'https://platform.unstructuredapp.io/api/v1';

  constructor(
    apiKey: string = process.env.UNSTRUCTURED_API_KEY || '',
    sourceId: string = process.env.UNSTRUCTURED_SOURCE_ID || '',
    destinationId: string = process.env.UNSTRUCTURED_DESTINATION_ID || '',
    workflowId: string = process.env.UNSTRUCTURED_WORKFLOW_ID || '',
    gcsBucket: string = process.env.GCS_BUCKET || ''
  ) {
    this.apiKey = apiKey;
    this.sourceId = sourceId;
    this.destinationId = destinationId;
    this.workflowId = workflowId;
    this.gcsBucket = gcsBucket;
    this.gcsClient = new Storage();
  }

  /**
   * Get default headers for Unstructured API requests
   */
  private getHeaders() {
    return {
      'unstructured-api-key': this.apiKey
    };
  }

  /**
   * Poll for results in GCS bucket
   * @param path Path in the GCS bucket to check for results
   * @param maxRetries Maximum number of retries before timing out
   * @param pollingInterval Time in ms between polling attempts
   * @returns Full GCS path to the result file
   */
  async pollForResult(
    path: string, 
    maxRetries: number = 10, 
    pollingInterval: number = 5000
  ): Promise<string> {
    let retries = 0;
    
    while (retries++ < maxRetries) {
      const [exists] = await this.gcsClient.bucket(this.gcsBucket).file(path).exists();
      
      if (exists) {
        return `gs://${this.gcsBucket}/${path}`;
      }
      
      await new Promise(resolve => setTimeout(resolve, pollingInterval));
    }
    
    throw new Error(`Workflow timeout after ${maxRetries} retries`);
  }

  /**
   * Get available Unstructured sources, destinations, or workflows
   * @param type Type of resources to fetch ('workflows', 'sources', or 'destinations')
   * @param filters Optional filter parameters
   * @returns API response data
   */
  async getUnstructuredResources(
    type: 'workflows' | 'sources' | 'destinations' = 'workflows',
    filters: Record<string, string> = {}
  ): Promise<any> {
    try {
      // Default filters based on class properties
      const defaultFilters = {
        source_id: this.sourceId,
        destination_id: this.destinationId,
        status: 'active'
      };

      // Merge default filters with any provided filters
      const params = { ...defaultFilters, ...filters };
      
      const response = await axios.get(`${this.baseUrl}/${type}`, {
        params,
        headers: this.getHeaders()
      });
      
      return response.data;
    } catch (error) {
      console.error(`Error fetching Unstructured ${type}:`, error);
      throw error;
    }
  }

  /**
   * Run an Unstructured workflow
   * @param workflowId Optional workflow ID (defaults to the one provided in constructor)
   * @param payload Optional payload for the workflow run
   * @returns Workflow run response
   */
  async runWorkflow(
    workflowId: string = this.workflowId,
    payload: Record<string, any> = {}
  ): Promise<AxiosResponse> {
    try {
      const response = await axios.post(
        `${this.baseUrl}/workflows/${workflowId}/run`,
        payload,
        { headers: this.getHeaders() }
      );
      
      return response;
    } catch (error) {
      console.error('Error running Unstructured workflow:', error);
      throw error;
    }
  }

  /**
   * Upload processed documents to Pinecone
   * @param documents Array of documents with embeddings in metadata
   * @param indexName Pinecone index name
   * @param batchSize Number of documents to upload in each batch
   * @returns The array of original documents
   */
  async uploadDocumentsToPinecone(
    documents: Document[],
    indexName: string,
    batchSize: number = 10
  ): Promise<Document[]> {
    try {
      const pinecone = new Pinecone();
      const index = pinecone.Index(indexName);
      
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
      let totalUploaded = 0;
      
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await index.upsert(batch);
        totalUploaded += batch.length;
        console.log(`Uploaded batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(vectors.length/batchSize)} (${totalUploaded}/${vectors.length} vectors)`);
      }

      console.log(`Successfully uploaded ${totalUploaded} vectors to Pinecone index "${indexName}"`);
      
      return documents;
    } catch (error) {
      console.error("Error uploading documents to Pinecone:", error);
      throw error;
    }
  }
  
  /**
   * Process a document through Unstructured workflow and upload results to Pinecone
   * @param workflowId Unstructured workflow ID
   * @param indexName Pinecone index name for storage
   * @param resultPath GCS path where results will be stored
   */
  async processAndIndexDocument(
    workflowId: string = this.workflowId,
    indexName: string,
    resultPath: string
  ): Promise<Document[]> {
    try {
      // Run the workflow
      const workflowResponse = await this.runWorkflow(workflowId);
      console.log('Workflow started:', workflowResponse.data);
      
      // Poll for results
      const gcsResultPath = await this.pollForResult(resultPath);
      console.log('Results available at:', gcsResultPath);
      
      // Download and process the results (implementation depends on your specific needs)
      const documents = await this.downloadAndProcessResults(gcsResultPath);
      
      // Upload to Pinecone
      return await this.uploadDocumentsToPinecone(documents, indexName);
    } catch (error) {
      console.error('Error in document processing pipeline:', error);
      throw error;
    }
  }
  
  /**
   * Download and process results from GCS
   * This is a placeholder method - implement based on your specific needs
   */
  private async downloadAndProcessResults(gcsPath: string): Promise<Document[]> {
    // Implementation depends on your specific requirements
    // This could involve downloading from GCS, parsing the results, etc.
    throw new Error('Method not implemented: downloadAndProcessResults');
  }
}