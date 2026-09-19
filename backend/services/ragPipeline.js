const embedQuery = require("./embedQuery"); // generate embedding of question
const similaritySearch = require("./similaritySearch"); // perform similarity search in pool of the generated embedding
const buildPrompt = require("./buildPrompt"); // create prompt
const generateAnswer = require("./generateAnswer"); // send the prompt to llm and get response

async function ragPipeline(question){
    console.log("Generating embedding of question..");
    const embedding = await embedQuery(question);

    console.log("Doing similarity search of embedding of question..");
    const chunks = await similaritySearch(embedding);

    const prompt = buildPrompt(question,chunks);

    console.log("Generating answer..");
    const ans = await generateAnswer(prompt);

    return ans;
}

module.exports = ragPipeline;