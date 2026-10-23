const embedQuery = require("./embedQuery");
const similaritySearch = require("./similaritySearch");

async function denseRetrieval(query) {
    const embedding = await embedQuery(query);
    const chunks = await similaritySearch(embedding);

    return chunks;
}

module.exports =  denseRetrieval;