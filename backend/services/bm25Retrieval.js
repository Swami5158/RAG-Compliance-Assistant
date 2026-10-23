const pool = require("../db/connection.js");
/**
 * Performs BM25 Sparse Keyword Retrieval on PostgreSQL pages.
 * @param {string} query - User search query.
 * @param {number} totalChunks - Total number of pages in DB (N).
 * @param {number} avgDocLength - Average token length of pages in DB.
 */
async function bm25Retrieval(query, totalChunks = 0, avgDocLength = 1) {
    const k1 = 1.2;
    const b = 0.75;

    // 1. Tokenize query

    const safeQuery = typeof query === "string" ? query : String(query || "");

    const tokenizeQuery = safeQuery
        .toLowerCase()
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "") // Remove accents
        .replace(/[^a-z0-9]+/g, " ")     // Replace non-alphanumeric with spaces
        .trim()
        .split(/\s+/)
        .filter(Boolean);

    if (tokenizeQuery.length === 0) return [];

    const queryTokens = Array.from(new Set(tokenizeQuery));

    // 2. Fetch corpus stats (N, avgDL) dynamically if missing
    let N = totalChunks;
    let avgDL = avgDocLength;

    if (N === 0 || avgDL === 1) {
        const statsRes = await pool.query(
            // "SELECT COUNT(*)::int AS n, COALESCE(AVG(doc_length), 1) AS avg_dl FROM pages"
            "SELECT COUNT(*)::int AS n, COALESCE(AVG(doc_length), 1) AS avg_dl FROM pages"
        );
        N = statsRes.rows[0].n || 1;
        avgDL = parseFloat(statsRes.rows[0].avg_dl) || 1;
    }

    // 3. Calculate dynamic DF & IDF for each query token
    const queryIdfCache = {};
    await Promise.all(
        queryTokens.map(async (token) => {
            const dfRes = await pool.query(
                "SELECT COUNT(*)::int AS df FROM pages WHERE tf_map ? $1",
                [token]
            );
            const DF = dfRes.rows[0].df || 0;

            // Standard BM25 IDF formula
            queryIdfCache[token] = Math.log(1 + (N - DF + 0.5) / (DF + 0.5));
        })
    );

    // 4. Retrieve candidate pages containing AT LEAST ONE query token
    // const sql = `
    //     SELECT id, document_id, page_start, page_end, raw_text, full_text, doc_length, tf_map
    //     FROM pages
    //     WHERE tf_map ?| $1
    // `;
    const sql = `
        SELECT id, document_id, page_number, raw_text, full_text, doc_length, tf_map
        FROM pages
        WHERE tf_map ?| $1
    `;

    const result = await pool.query(sql, [queryTokens]);
    const candidateChunks = result.rows;

    // 5. Compute BM25 scores for candidates
    const scoredChunks = candidateChunks.map((chunk) => {
        let score = 0;
        const { tf_map: tfMap, doc_length: docLength } = chunk;

        for (const token of queryTokens) {
            const freq = tfMap ? (tfMap[token] || 0) : 0;

            if (freq > 0) {
                const idf = queryIdfCache[token] || 0;
                const numerator = freq * (k1 + 1);
                const denominator = freq + k1 * (1 - b + b * (docLength / avgDL));

                score += idf * (numerator / denominator);
            }
        }

        return {
            ...chunk,
            bm25Score: score
        };
    });

    // 6. Sort descending and return top 10
    scoredChunks.sort((a, b) => b.bm25Score - a.bm25Score);

    return scoredChunks.slice(0, 20);
}

module.exports =  bm25Retrieval;