import { Request, Response, NextFunction } from "express";
import { reportChain } from "../runnables/runnables.js";
import { docConfigSchema } from "../runnables/runnables.js";
import { getDocs } from "../models/db.js";

const docName = 'hood-10Q.pdf.json' // remove later

export async function processInputController(req:Request,res:Response,next:NextFunction) {
    const docConfigRaw = req.body;

    try{
        const docConfig = docConfigSchema.parse(docConfigRaw);
        const docs = await getDocs(docName)
        const resultsRaw = await reportChain(docs, docConfig)
        const results = resultsRaw.reformatted_content
        res.render('results',{tableContent: results})

    }catch(err){
        next(err)
    }
    
}