const fuseResults = require("./services/reciprocalRankFusion");
const fs = require("fs");
const reranker = require("./services/reranker")
const raw = JSON.parse(fs.readFileSync("./retrieval_eval_dataset.json", "utf-8"));

function flattenDataset(raw) {
    const items = [];

    for (const category of Object.keys(raw)) {
        if (category === "cross_document_comparative") {
            for (const pair of raw[category]) {
                items.push({ ...pair.question_a, category });
                items.push({ ...pair.question_b, category });
            }
        } 
        else {
            for (const entry of raw[category]) {
                items.push({ ...entry, category });
            }
        }
    }

    return items;
}

const dataset = flattenDataset(raw);

async function runDemo() {
    const results = new Array(dataset.length);
    let totalRecall = 0;
    let totalRR = 0;

    async function processItem(i){
        const { question, document_title: document, gold_pages, category } = dataset[i];
        const fusedResult = await fuseResults(question);
    // const reranked = await reranker(fuseResult);
    // console.log(fusedResult.length);

    const finalHitRanks = [];
        fusedResult.forEach((row, idx) => {
            if (row.document_id !== document) return;
            let p = row.page_number;
            if (gold_pages.includes(p)) finalHitRanks.push(idx + 1);
        });

    const recall = gold_pages.filter(p =>
            fusedResult.some(r => r.document_id === document && p == r.page_number)
        ).length / gold_pages.length;


    const finalBestRank = finalHitRanks.length ? Math.min(...finalHitRanks) : null;
    const reciprocal_rank = finalBestRank ? 1 / finalBestRank : 0;
    // for(const p of fusedResult){
    //     if(p.page_number == 3)
    //     console.log(p.ranks.denseRank);
    // }

    results[i] = { 
            question, 
            category,
            recall, 
            reciprocal_rank, 
            finalBestRank, 
    };

    return { recall, reciprocal_rank };

    }

    for(let i = 0 ; i < dataset.length ; i+= 5){
        const batchIndices = [];

        for(let j = i ; j < Math.min(i + 5 , dataset.length) ; j++){
            batchIndices.push(j);
        }

        const batchPromises = batchIndices.map(idx => processItem(idx));
        const batchResults = await Promise.all(batchPromises);

        for(const res of batchResults){
            totalRecall += res.recall;
            totalRR += res.reciprocal_rank; 
        }

        console.log(`Processed up to item ${Math.min(i + 5, dataset.length)} / ${dataset.length}`);
    }   


    console.log(`Recall@20 for ranked is ${totalRecall / dataset.length}`);
    console.log(`MRR is ${totalRR / dataset.length}`);

    // const question = "What kind of unusual account activity does the bank's fraud system watch out for, like sudden bursts of transactions or payments from strange locations?";
    // const fusedResult = await fuseResults(question);



    // console.log(document);
}

runDemo().catch(console.error);