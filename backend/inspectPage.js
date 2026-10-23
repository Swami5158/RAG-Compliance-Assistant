const fs = require("fs");
const cleanDocument = require("./cleanPages");
const PDF_PATH = "./documents/MD_DigitalPaymentSecurity_2021.pdf"; 
const embedPage = require("./services/embedQuery");
const pool = require("./db/connection")

function computeBm25Features(text) {
    // 1. Lowercase, remove non-alphanumeric chars (using regex with Unicode flag for robustness)
    const clean = text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ');
    
    // 2. Split into tokens (filter out empty strings)
    const tokens = clean.split(/\s+/).filter(t => t.length > 0);
    
    // 3. Calculate term frequencies using a plain object
    const tfMap = {};
    for (const token of tokens) {
        tfMap[token] = (tfMap[token] || 0) + 1;
    }
    
    return {
        doc_length: tokens.length,
        tf_map: tfMap
    };
}

async function main(){
    const pdfjs = require("pdfjs-dist/legacy/build/pdf.js");

    const data = new Uint8Array(fs.readFileSync(PDF_PATH));
    const doc = await pdfjs.getDocument({data}).promise;

    const rawPages = [];

    for(let i = 3 ; i <= doc.numPages ; i++){
        const page = await doc.getPage(i);
        const content = await page.getTextContent();

        const text = content.items
            .map(item => item.str + (item.hasEOL ? "\n" : ""))
            .join("");

        rawPages.push({ pageNumber: i, text });
    }

    const result = cleanDocument(rawPages);
    const documentId = "MD_DigitalPaymentSecurity_2021";

    for(const p of result.pages){
        // 1. Compute BM25 features (doc_length and tf_map)
        const bm25Features = computeBm25Features(p.text);

        // 2. Generate vector embedding (must be awaited)
        const embedding = await embedPage(p.text);

        console.log(`Processed Page ${p.pageNumber}: length = ${bm25Features.doc_length} words`);

        const queryText = `
            INSERT INTO pages (document_id, page_number , raw_text , full_text , embedding , doc_length , tf_map)
            VALUES ($1, $2, $3, $4, $5, $6, $7)
            ON CONFLICT (document_id, page_number) DO NOTHING
        `;

        await pool.query(queryText,
            [
                documentId,
                p.pageNumber,
                p.text,
                p.text,
                JSON.stringify(embedding),
                bm25Features.doc_length,
                JSON.stringify(bm25Features.tf_map)
            ]
        );

        console.log(`Inserted Page ${p.pageNumber}`);

    }

    console.log("All pages processed and embedded successfully!");
}
// CREATE TABLE pages (
//     id          SERIAL PRIMARY KEY,
//     document_id TEXT NOT NULL,
//     page_number INTEGER NOT NULL,
//     raw_text    TEXT NOT NULL,
//     full_text   TEXT NOT NULL,
//     embedding   vector(1024) NOT NULL,
//     doc_length  INTEGER NOT NULL,
//     tf_map      JSONB NOT NULL,
//     created_at  TIMESTAMP DEFAULT now(),
//     UNIQUE (document_id, page_number)
// );

main().catch(console.error);