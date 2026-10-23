const fs = require("fs");

const results = JSON.parse(
    fs.readFileSync("./evaluation_results_with_categories_fused.json", "utf-8")
);

function aggregateByCategory() {
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

aggregateByCategory();