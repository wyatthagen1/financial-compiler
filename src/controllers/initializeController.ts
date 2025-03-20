import { upload } from "node_modules/@google-cloud/storage/build/esm/src/resumable-upload.js";
import { pushDocs, getDocs, uploadInit } from "../models/db.js";
import { Request, Response, NextFunction } from "express";


const docName = 'hood-10Q.pdf.json' // TODO remove later

export async function initializeController(req:Request, res:Response, next:NextFunction){
    try{
    res.render('index',{title: `Financial Compiler for ${docName}`})
    const docs = await getDocs(docName);
    pushDocs(docs);
    // uploadInit(docs);
    }catch(err){
        next(err);
    }
}