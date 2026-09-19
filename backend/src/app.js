const express = require("express");
require("dotenv").config();

const app = express();
const ragPipeline = require("../services/ragPipeline");
const cors = require("cors");

app.use(express.json());
app.use(cors());

app.get("/", (req, res) => {
    res.json({
      message: "RAG Compliance Assistant Backend is running",
    });
})

app.post("/api/ask" ,async (req,res)=>{
    try{
        const question = req.body.question;
        console.log("Got question in app.js and calling Rag Pipeline...");
        const answer = await ragPipeline(question);

        res.json({
            answer: answer
        })
    }
    catch(e){
        console.log("Could not get response from pipeline..")
        res.json({
            error : e
        })
    }
})

const PORT = process.env.PORT || 5000;

app.listen(PORT, () => {
    console.log(`Server running on port ${PORT}`);
})