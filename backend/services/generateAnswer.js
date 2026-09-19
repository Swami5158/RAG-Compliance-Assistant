const axios = require("axios");
const MODEL_NAME = "llama3.1:8b";

async function generateAnswer(prompt) {
    const response = await axios.post(
        "http://host.docker.internal:11434/api/generate",

        {
            model: MODEL_NAME,
            prompt: prompt,
            stream: false
        }
    );

    return response.data.response;

}

module.exports = generateAnswer;