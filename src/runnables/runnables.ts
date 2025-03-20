import * as dotenv from 'dotenv';
dotenv.config();

// utils
import { GCSService } from '../utils/gsc_utils.js';
import { Document } from 'langchain/document';
import { PineconeService } from '../utils/pinecone_utils.js';

// langchain 
import { PromptTemplate } from "@langchain/core/prompts";
import { ChatOpenAI } from "@langchain/openai";
import { RunnableSequence } from '@langchain/core/runnables';
import { StringOutputParser } from '@langchain/core/output_parsers';
import { DocumentInterface } from '@langchain/core/documents';
import { z } from 'zod';

export const docConfigSchema = z.object({
  docName: z.string(),
  companyName: z.string(),
  docType: z.string(),
  reportType: z.string(),
});
export type DocConfig = z.infer<typeof docConfigSchema>;

export const chainResultsSchema = z.object({
  original_content: z.string(),
  reformatted_content: z.string(),
});
export type chainResults = z.infer<typeof chainResultsSchema>;



// const docName = 'hood-10Q.pdf.json';
// const docType = '10-Q';
// const companyName = 'Robinhood';
// const reportType = 'Balance Sheet';



export async function reportChain(docArray: Document[], docConfig:DocConfig): Promise<chainResults> {

  const docName = docConfig.docName;
  const companyName = docConfig.companyName;
  const docType = docConfig.docType;
  const reportType = docConfig.reportType; 
  console.log("Starting document retrieval pipeline...");
  console.log("Configuration:");
  console.log(`- Document: ${docName}`);
  console.log(`- Company: ${companyName}`);
  console.log(`- Document Type: ${docType}`);
  console.log(`- Report Type: ${reportType}`);
  console.log("----------------------------------------");

  try {
    // setup retreiver 
    const searchTemplate = PromptTemplate.fromTemplate('What is {companyName}s {reportType} for their {docType} statement?');
    const pineconeService = new PineconeService();
    const pineconeStore = await pineconeService.createStore();
    const vectorStoreRetriver = pineconeStore.asRetriever(5);

    // setup output parser
    const outputParser = new StringOutputParser();

    const llm = new ChatOpenAI({
      model: "gpt-4o",
      temperature: 0
    });

    const chainInput = {
      docName: docName,
      docType: docType,
      reportType: reportType,
      companyName: companyName
    };

    // Update the ID template to use a better approach with proper formatting
    // Remove the problematic template parts with element_id and filename placeholders
    const __idImprovedTemplate = `You are responsible for identifying which document from the returned results is likely to be the {reportType} 
    from {companyName}'s {docType}.

    Below are the documents that were retrieved:

    {formattedDocs}

    Please identify which document contains the {reportType} for {companyName}'s {docType}.
    Return your answer as a JSON object with the following format:

    {{
      "element_id": "the element_id of the identified document",
      "filename": "the source/filename of the identified document"
    }}

    Return ONLY the JSON with no markdown formatting, no +""+ json blocks, and no additional text before or after the JSON.
    Make sure to include the exact element_id and source/filename from the metadata of the document you identify.`;

    const idImprovedTemplate = PromptTemplate.fromTemplate(__idImprovedTemplate);

    const __htmlFormattingTemplate = `You are a system responsible for formatting html tables, you will be passed html-like content that contains formatting issues
    your role is to assess the content provided, identify mistakes, and improve / enrich the formatting while staying as critically accurate to the underlying data
    given in the tables

    Below are is the provided table content: 

    {tableContent}

    Return your answer as a JSON object with the following format: 

    {{
      "reformatted_content": "your output improved html-formatted content" 
    }}

    Return ONLY the JSON with no markdown formatting, no +""+ json blocks, and no additional text before or after the JSON.
    Make sure to include the exact element_id and source/filename from the metadata of the document you identify.`;

    const htmlFormattingTemplate = PromptTemplate.fromTemplate(__htmlFormattingTemplate);

    // Create a version of the chain that logs intermediate steps
    const debugChain = RunnableSequence.from([
      // Step 1: Format the search query
      async (input) => {
        const formatted = await searchTemplate.format({
          companyName: input.companyName,
          reportType: input.reportType,
          docType: input.docType
        });
        console.log("\n1. Formatted Search Query:");
        console.log(formatted);
        return formatted;
      },
      
      // Step 2: Retrieve documents
      async (query) => {
        console.log("\n2. Retrieving documents with query...");
        const docs = await vectorStoreRetriver.invoke(query);
        console.log(`Retrieved ${docs.length} documents`);
        
        // Log more document details for debugging
        if (docs.length > 0) {
          console.log("\nDocument Previews:");
          docs.slice(0, 3).forEach((doc, index) => {
            console.log(`\nDocument ${index + 1}:`);
            console.log(doc);
            console.log(`- ID: ${doc.metadata?.element_id || 'unknown'}`);
            console.log(`- Source: ${doc.metadata?.source || 'unknown'}`);
            console.log(`- Content (first 150 chars): ${doc.metadata?.text_preview}...`);
          });
        }
        
        return docs;
      },
      
      // Step 3: Format documents for the template
      (docs) => {
        console.log("\n3. Formatting documents for template...");
        
        // Create a formatted string of documents for the template
        const formattedDocs = docs.map((doc: DocumentInterface<Record<string, any>>, index: number) => {
          return `Document ${index + 1}:
- Element ID: ${doc.metadata?.element_id || 'unknown'}
- Source/Filename: ${doc.metadata?.filename || 'unknown'}
- Content snippet: ${doc.metadata?.text_preview}...`;
        }).join('\n\n');
        
        // Create the context with the formatted documents
        const context = {
          formattedDocs,
          reportType,
          companyName,
          docType
        };
        
        console.log("Documents formatted for template input");
        return context;
      },
      
      // Step 4: Format ID template with the formatted documents
      async (context) => {
        console.log("\n4. Formatting ID template with formatted documents...");
        const formattedPrompt = await idImprovedTemplate.format(context);
        console.log("ID Template formatted successfully");
        console.log("Template preview (first 300 chars):");
        console.log(formattedPrompt.substring(0, 300) + "...");
        return formattedPrompt;
      },
      
      // Step 5: Call LLM with system message approach
      async (prompt) => {
        console.log("\n5. Sending to LLM with formatted prompt...");
        const response = await llm.invoke(prompt);
        console.log("Received response from LLM");
        console.log("Raw response:");
        console.log(response);
        return response;
      },
      
      // Step 6: Parse the result
      async (llmResponse) => {
        console.log("\n6. Parsing result...");
        const result = await outputParser.invoke(llmResponse);
        console.log("parsed string result:");
        console.log(result);
        const resultJSON = JSON.parse(result);
        return resultJSON;
      },
      
      // Step 7: match the output ID to doc database to source content
      async (result) => {
        console.log("\n7. Content matching output ID");
        try {
          const docMatchID = result?.element_id;
          
          const matchedDoc = docArray.find((doc, idx) => {
            if (doc.metadata.element_id == docMatchID) {
              console.log(doc);
              return doc;
            }
          });
          const tableContent = matchedDoc?.metadata?.text_as_html;
          const context = { tableContent };
          console.log(context);
          return context;
        } catch(error) {
          console.log("unable to complete ID matching process");
          throw error;
        }
      },
      
      // Step 8: format the enhance formatting prompt with fetched tabledata 
      async (context) => {
        console.log("\n8. Formatting enhancement prompt with fetched data...");
        const formattedPrompt = await htmlFormattingTemplate.format(context);
        console.log("html formatting prompt successfully formatted");
        console.log("Template preview (first 300 chars):");
        console.log(formattedPrompt.substring(0, 300) + "...");
        return formattedPrompt;
      },
      
      // Step 9: run through LLM for better formatted HTML
      async (formattedPrompt) => {
        console.log("\n9. Running through LLM for improved HTML formatting...");
        const response = await llm.invoke(formattedPrompt);
        console.log("Received response from LLM");
        return response;
      },
      
      // Step 10: parse final results 
      async (response) => {
        console.log("\n10. Parsing Final result...");
        const result = await outputParser.invoke(response);
        return result;
      }
    ]);

    // Run the debug chain with the input
    console.log("\nExecuting chain with step-by-step logging...");
    const result = await debugChain.invoke(chainInput);
    
    // Parse the result if it's JSON
      const jsonResult = JSON.parse(result);
      console.log("\n----------------------------------------");
      console.log("FINAL RESULT (Parsed JSON):");
      console.log(JSON.stringify(jsonResult, null, 2));


      return jsonResult

  } catch (error) {
    console.error("Error in document retrieval pipeline:", error);
    if (error) {
      console.error("Caused by:", error);
    }
    throw error;
  }
}

