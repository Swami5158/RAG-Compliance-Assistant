const pool = require("../db/connection");
const embedQuery = require("./embedQuery");

async function similaritySearch(question){

    // const result = await pool.query(
    //     `
    //     SELECT 
    //     id, 
    //     document_id, 
    //     page_start, 
    //     page_end, 
    //     raw_text, 
    //     full_text, 
    //     doc_length, 
    //     tf_map,
    //     (1 - (embedding <=> $1)) AS similarity_score
    // FROM chunks
    // ORDER BY embedding <=> $1 ASC
    // LIMIT 30;
    //     `,
    //     [`[${queryEmbedding.join(",")}]`]
    // );

    const queryEmbedding = await embedQuery(question);
    
    const result = await pool.query(
        `
        SELECT 
        id, 
        document_id, 
        page_number, 
        raw_text, 
        full_text, 
        doc_length, 
        tf_map,
        (1 - (embedding <=> $1)) AS similarity_score
    FROM pages
    ORDER BY embedding <=> $1 ASC
    LIMIT 20;
        `,
        [`[${queryEmbedding.join(",")}]`]
    );

    return result.rows;
} 

module.exports = similaritySearch;