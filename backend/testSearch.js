const embedQuery = require("./services/embedQuery");
const similaritySearch = require("./services/similaritySearch");
const buildPrompt = require("./services/buildPrompt");
const generateAnswer = require("./services/generateAnswer");

async function test() {
    const question = "what are the MFA requirements for electronic payments";

    const queryEmbedding = await embedQuery(question);
    const chunks = await similaritySearch(queryEmbedding);
    chunks.forEach(c => console.log(c.clause, "-", c.section, "-", c.raw_text.slice(0, 80)));
    const topChunks = chunks.slice(0,3);

    const prompt = await buildPrompt(question,topChunks);

    const answer = await generateAnswer(prompt);

    console.log("ANSWER:\n", answer);
}

test();