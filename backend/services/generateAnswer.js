const axios = require("axios");
const MODEL_NAME = "llama3.1:8b";

async function generateAnswer(prompt) {
    const response = await axios.post(
        "http://host.docker.internal:11434/api/generate",

        {
            model: MODEL_NAME,
            prompt: prompt,
            stream: false,
            options: {
                num_ctx: 8192,
                temperature: 0
            },
            format: {
                type: "object",
                properties: {
                    status: { type: "string", enum: ["ANSWERED", "UNANSWERED"] },
                    evidence: {
                        type: "array",
                        items: {
                            type: "object",
                            properties: {
                                document_id: { type: "string" },
                                page: { type: "integer" },
                                quote: { type: "string" }
                            },
                            required: ["document_id", "page", "quote"]
                        }
                    },
                    answer: { type: ["string", "null"] },
                    abstention_reason: { type: "string" }
                },
                required: ["status", "evidence", "answer"]
            }

        }
    );

    if(response.data.prompt_eval_count){
        console.log(`[Ollama Metrics] Prompt tokens evaluated: ${response.data.prompt_eval_count}`);
    }

    return response.data.response;

}

module.exports = generateAnswer;