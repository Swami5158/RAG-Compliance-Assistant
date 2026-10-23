const fs = require("fs");
const fuseResults = require("./services/reciprocalRankFusion");
const reRanker = require("./services/reranker");

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

async function run() {
    const results = new Array(dataset.length);
    let totalRecall = 0;
    let totalRR = 0;

    const CONCURRENCY_LIMIT = 5;

    async function processItem(i){
        const { question, document_title: document, gold_pages, category } = dataset[i];

        // 1. Get raw RRF candidates
        const rawRrfRows = await fuseResults(question);

        // Find initial best rank before reranking
        const initialHitRanks = [];
        rawRrfRows.forEach((row, idx) => {
            if (row.document_id !== document) return;
            let p = row.page_number;
            // for (let p = row.page_start; p <= row.page_end; p++) {
            //     if (gold_pages.includes(p)) initialHitRanks.push(idx + 1);
            // }
            if (gold_pages.includes(p)) initialHitRanks.push(idx + 1);
        });
        const initialBestRank = initialHitRanks.length ? Math.min(...initialHitRanks) : null;

        // 2. Explicitly call the reranker and catch any invocation bugs
        let reranked;
        try {
            reranked = await reRanker(question, rawRrfRows, 20);
        } catch (err) {
            console.error(`Reranker failed for question: "${question}"`, err);
            reranked = rawRrfRows; // Fallback only if it crashes
        }

        // let reranked = rawRrfRows;

        const finalHitRanks = [];
        reranked.forEach((row, idx) => {
            if (row.document_id !== document) return;
            let p = row.page_number;
            // for (let p = row.page_start; p <= row.page_end; p++) {
            //     if (gold_pages.includes(p)) finalHitRanks.push(idx + 1);
            // }
            if (gold_pages.includes(p)) finalHitRanks.push(idx + 1);
        });

        const recall = gold_pages.filter(p =>
            // reranked.some(r => r.document_id === document && p >= r.page_start && p <= r.page_end)
            reranked.some(r => r.document_id === document && p == r.page_number)
        ).length / gold_pages.length;

        const finalBestRank = finalHitRanks.length ? Math.min(...finalHitRanks) : null;
        const reciprocal_rank = finalBestRank ? 1 / finalBestRank : 0;

        // Calculate shift (negative means rank improved, e.g., went from 4 to 1)
        const rankShift = (initialBestRank && finalBestRank) ? finalBestRank - initialBestRank : 0;

        // Optional: Log individual shifts if you want to inspect live
        if (rankShift !== 0) {
            console.log(`[${category}] "${question.substring(0, 40)}..." | RRF Rank: ${initialBestRank} -> Reranked Rank: ${finalBestRank} (${rankShift > 0 ? '+' + rankShift : rankShift})`);
        }

        results[i] = { 
            question, 
            category,
            recall, 
            reciprocal_rank, 
            initialBestRank, 
            finalBestRank, 
            rankShift 
        };

        return { recall, reciprocal_rank };
    }
        // const queryEmbedding = await embedQuery(question);

        // const { reranked } = await pool.query(
        //     `
        //     SELECT document_id, page_start, page_end,
        //            embedding <=> $1 AS distance
        //     FROM chunks
        //     ORDER BY distance ASC
        //     LIMIT 30;
        //     `,
        //     [`[${queryEmbedding.join(",")}]`]
        // );

    for(let i = 0 ; i < dataset.length ; i+= CONCURRENCY_LIMIT){
        const batchIndices = [];

        for(let j = i ; j < Math.min(i + CONCURRENCY_LIMIT , dataset.length) ; j++){
            batchIndices.push(j);
        }

        const batchPromises = batchIndices.map(idx => processItem(idx));
        const batchResults = await Promise.all(batchPromises);

        for(const res of batchResults){
            totalRecall += res.recall;
            totalRR += res.reciprocal_rank; 
        }

        console.log(`Processed up to item ${Math.min(i + CONCURRENCY_LIMIT, dataset.length)} / ${dataset.length}`);
    }   

    console.log(`Recall is ${totalRecall / dataset.length}`);
    console.log(`MRR is ${totalRR / dataset.length}`);

    fs.writeFileSync(
        "./results/retrieval_fused20_reranked_jina.json",
        JSON.stringify(results, null, 2),
        "utf-8"
    );
}

function aggregateByCategory() {
    const results = JSON.parse(
        fs.readFileSync("./results/retrieval_fused20_reranked_jina.json", "utf-8")
    );
    const groups = {};

    let improved = 0;
    let worsened = 0;
    let unchanged = 0;

    for (const r of results) {
        const cat = r.category;

        if (!groups[cat]) {
            groups[cat] = { totalRecall: 0, totalRR: 0, count: 0, hits: 0, misses: 0, hitRankSum: 0 };
        }

        groups[cat].totalRecall += r.recall;
        groups[cat].totalRR += r.reciprocal_rank;
        groups[cat].count += 1;

        if (r.recall === 0) {
            groups[cat].misses += 1;
        } else {
            groups[cat].hits += 1;
            // Guard against division by zero if reciprocal_rank is 0 despite a hit
            if (r.reciprocal_rank > 0) {
                groups[cat].hitRankSum += 1 / r.reciprocal_rank;
            }
        }

        // Track overall rank shift metrics
        if (r.rankShift < 0) improved++;
        else if (r.rankShift > 0) worsened++;
        else unchanged++;
    }   

    console.log("--- CATEGORY PERFORMANCE ---");
    for (const cat in groups) {
        const g = groups[cat];
        const avgHitRank = g.hits > 0 ? (g.hitRankSum / g.hits).toFixed(2) : "n/a";
        console.log(`${cat}: Recall = ${(g.totalRecall / g.count).toFixed(3)}, MRR = ${(g.totalRR / g.count).toFixed(3)}, n=${g.count}, hits=${g.hits}, misses=${g.misses}, avgRankWhenHit=${avgHitRank}`);
    }

    console.log("\n--- RERANKER SHIFT SUMMARY ---");
    console.log(`Improved Rank (Moved Closer to #1): ${improved} queries`);
    console.log(`Worsened Rank (Moved Down): ${worsened} queries`);
    console.log(`Unchanged Rank: ${unchanged} queries`);
}


async function runWorkflow() {
    // This pauses execution here until asyncTask() has completely finished
    await run();

    // This will ONLY run after asyncTask is done
    aggregateByCategory();
}

runWorkflow();
