const buildPrompt = require("./services/buildPrompt"); // create prompt
const generateAnswer = require("./services/generateAnswer"); // send the prompt to llm and get response
const reranker = require("./services/reranker")
const fuseResults = require("./services/reciprocalRankFusion")
const fs = require('fs');
const { cat } = require("@huggingface/transformers");

const OUTPUT_FILE = "./answer/answers_pages_top5_v2_rest.json";
const TOP_K = 5;
const MAX_QUESTIONS = 50; 

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

async function generate(question){
    const fused = await fuseResults(question);
    const reranked = await reranker(question,fused);
    const pages = reranked.slice(0, TOP_K);

    const prompt = buildPrompt(question,pages);
    const rawAnswer = await generateAnswer(prompt);

    return {pages, rawAnswer};
}

function save(results) {
    const output = {
        config: {
            run_name: "rest",
            top_k: TOP_K,
            model: "llama3.1:8b",
            temperature: 0,
            num_ctx: 8192,
            saved_at: new Date().toISOString()
        },
        results
    };
    fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), "utf-8");
}

async function ragPipeline(){
    const results = [];
    const CONCURRENCY_LIMIT = 5;
    const total = Math.min(dataset.length, MAX_QUESTIONS);

    for (let i = 20; i < total; i++) {
        const { question, document_title, gold_pages, category } = dataset[i];
        const record = {
            id: `${category}_${i}`,
            category,
            question,
            document_title,
            gold_pages,
            retrieved_pages: [],
            raw_answer: null,
            parsed_answer: null,
            parse_error: null,
            error: null,
            latency_ms: null
        };

        const start = Date.now();

        try{
            const { pages, rawAnswer } = await generate(question);

            record.retrieved_pages = pages.map(p => ({
                document_id: p.document_id,
                page_number: p.page_number,
                raw_text: p.raw_text
            }));

            record.raw_answer = typeof rawAnswer === "string" ? rawAnswer : JSON.stringify(rawAnswer);

            try{
                record.parsed_answer = JSON.parse(record.raw_answer);
            }catch(e){
                record.parse_error = e.message;
            }

        }catch(e){
            record.error = e.message;
        }

        record.latency_ms = Date.now() - start;

        results.push(record);
        save(results);

        console.log(`Processed ${i + 1} / ${total} (${record.latency_ms} ms)${record.error ? " ERROR: " + record.error : ""}`);
    }
}

ragPipeline().catch(console.error);

module.exports = ragPipeline;