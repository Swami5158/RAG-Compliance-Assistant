const bm25Retrieval = require("./bm25Retrieval"); 
const denseRetrieval = require("./similaritySearch");

async function fuseResults(query , options = {}){
    // const alpha = options.alpha || 0.6; // Weight for Dense (Semantic)
    // const beta = options.beta || 0.4;   // Weight for BM25 (Keyword)
    const k = 15;
    const chunkMap = new Map();
    const [bm25Chunks , denseResults] = await Promise.all([
        bm25Retrieval(query),
        denseRetrieval(query)
    ]);

    // return bm25Chunks;
    // return denseResults;

    function processList(list , rankType){
        list.forEach((chunk,index) =>{
        const rank = index + 1;
        const rrfScore = (1 / (k + rank));

        if(!chunkMap.has(chunk.id)){
            chunkMap.set(chunk.id , {
                ...chunk,
                rrfScore : rrfScore,
                ranks:{
                    [rankType] : rank
                }
            });
        }
        else{
            const existing = chunkMap.get(chunk.id);
            existing.rrfScore += rrfScore;
            existing.ranks[rankType] = rank;
        }
    });
}
    processList(bm25Chunks, "bm25Rank");
    processList(denseResults,"denseRank");

    const finalFusedChunks = Array.from(chunkMap.values())
        .sort((a,b) => b.rrfScore - a.rrfScore)
        .slice(0,20)

    return finalFusedChunks;
}

module.exports =  fuseResults;