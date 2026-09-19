const axios = require("axios");
const MODEL_NAME = "qwen3-embedding:0.6b";

async function embedQuery(query){
    const response = await axios.post(
        "http://host.docker.internal:11434/api/embeddings",
        {
            model : MODEL_NAME,
            prompt : query
        }
    );

    return response.data.embedding; 
}

module.exports = embedQuery;

