import { Document } from 'langchain/document';
import { GCSService } from '../utils/gsc_utils.js';
import { newPinecone } from '../utils/pinecone_utils.js';

const docArray = [];

export async function getDocs(docName:string): Promise<Document<Record<string, any>>[]> {
    const docArray = await GCSService.getDocuments(docName);
    return docArray
}

export async function pushDocs(docs: Document[]){
    docArray.push(...docs)
}

export async function uploadInit(docs: Document[]){
    const pinecone = await newPinecone();
    await pinecone.uploadUnstructuredDocuments(docs);
}