const pool = require("../db/connection");

async function similaritySearch(queryEmbedding){

    const result = await pool.query(
        `
        SELECT
            id,
            document_id,
            chapter,
            section,
            clause,
            raw_text,
            full_text,
            page_start,
            page_end,
            embedding <=> $1 AS distance
        FROM chunks
        ORDER BY distance ASC
        LIMIT 5;
        `,
        [`[${queryEmbedding.join(",")}]`]
    );
    return result.rows;
} 

module.exports = similaritySearch;