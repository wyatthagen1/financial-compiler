import * as dotenv from 'dotenv';
dotenv.config();
import { Storage, Bucket, File, CreateReadStreamOptions, FileMetadata } from '@google-cloud/storage';
import { Readable } from 'stream';
import { fileURLToPath } from 'url';
import path from 'path';
import fs from 'fs';

import { Document } from 'langchain/document';

export interface GCSServiceConfig {
  bucketName: string;
  keyFilename: string;  // Path to credentials file
}

export interface UnstructuredOutput {
    type: string,
    element_id: string,
    text: string;
    metadata: {
      filename?: string;
      filetype?: string;
      page_number?: number;
      orig_elements?: string;
      [key: string]: any;  // for other metadata fields
    };
    embeddings: number[];
}

export class GCSService {
  private storage: Storage;
  private bucket: Bucket;

  constructor(config: GCSServiceConfig) {
    this.storage = new Storage({
      keyFilename: config.keyFilename
    });
    
    this.bucket = this.storage.bucket(config.bucketName);
  }

  public getFileStream(fileName: string, options?: CreateReadStreamOptions): Readable {
    try {
      const file: File = this.bucket.file(fileName);
      return file.createReadStream(options);
    } catch (error) {
      throw new Error(`Error creating stream for ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public async getFileStreamSafe(fileName: string, options?: CreateReadStreamOptions): Promise<Readable> {
    try {
      const file: File = this.bucket.file(fileName);
      
      const [exists] = await file.exists();
      if (!exists) {
        throw new Error(`File ${fileName} not found in bucket ${this.bucket.name}`);
      }

      return file.createReadStream(options);
    } catch (error) {
      throw new Error(`Error accessing ${fileName}: ${error instanceof Error ? error.message : 'Unknown error'}`);
    }
  }

  public static async getDocuments(fileName: string): Promise<Document[]> {
  
    const GCS_OUTPUT_BUCKET = process.env.GCS_OUTPUT_BUCKET || '';
    const GCS_CREDENTIALS_FILE = process.env.GCS_CREDENTIALS_FILE || '';
  
    if (!GCS_OUTPUT_BUCKET) {
      throw new Error('GCS_OUTPUT_BUCKET environment variable is required');
    }
    if (!GCS_CREDENTIALS_FILE) {
      throw new Error('GCS_CREDENTIALS_FILE environment variable is required');
    }
  
    const gcsService = createGCSService({
      bucketName: GCS_OUTPUT_BUCKET,
      keyFilename: GCS_CREDENTIALS_FILE
    });
    
    try {
      const stream = await gcsService.getFileStreamSafe(fileName);
      
      // Stream to JSON
      const data = await new Promise<string>((resolve, reject) => {
        let jsonData = '';
        
        stream.on('data', (chunk: Buffer) => {
          jsonData += chunk.toString('utf-8');
        });
        
        stream.on('end', () => resolve(jsonData));
        stream.on('error', reject);
      });
  
      // Parse JSON and convert to LangChain Documents
      const unstructuredOutput: UnstructuredOutput[] = JSON.parse(data);
      
      // Convert each element to a LangChain Document
      const documents = unstructuredOutput.map((item,index) => {
        
        return new Document({
          pageContent: item.text,
          metadata: {
            ...item.metadata,
            filename: item.metadata.filename,
            filetype: item.metadata.filetype,
            page_number: item.metadata.page_number,
            element_id: item.element_id,
            type: item.type,
            source: item.metadata.filename,
            embedding: item.embeddings
            // Add any additional metadata we want to add later
          }
        });
      });
  
  
      return documents;
  
    } catch (error) {
      console.error('Error processing Unstructured output:', error);
      throw error;
    }
  }

  public async uploadFile(fileName: string): Promise<boolean> {
    if (!fileName) {
      throw new Error('fileName is required');
    }

    try {
      const __filename = fileURLToPath(import.meta.url);
      const __dirname = path.resolve(path.dirname(__filename), '..');
      const filePath = path.resolve(__dirname, fileName);
      const baseFileName = path.basename(fileName);

      if (!fs.existsSync(filePath)) {
        throw new Error(`File not found: ${filePath}`);
      }

      await this.bucket.upload(filePath, {
        destination: baseFileName
      });
        
      return true;
    } catch (error) {
      console.error('Error uploading file:', {
        fileName,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      throw error;
    }
  }
}

export const createGCSService = (config: GCSServiceConfig): GCSService => {
  return new GCSService(config);
};




   