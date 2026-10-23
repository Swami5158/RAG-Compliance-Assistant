const buildPrompt = require("./services/buildPrompt");
const generateAnswer = require("./services/generateAnswer");
const reranker = require("./services/reranker");
const fuseResults = require("./services/reciprocalRankFusion");
const denseSearch = require("./services/similaritySearch"); // E0 only — adjust import/signature to yours
const fs = require("fs");

// ---------- Config ----------
const MODE = process.env.MODE || "e3";   // "e0" = dense baseline | "e3" = hybrid + reranker
const TOP_K = 5;
const MAX_QUESTIONS = 50;
const START_INDEX = 0;                   // always 0 for RAGAS runs — ids must align with verdict file

const RUN_NAME = `pages_top5_${MODE}`;
const OUTPUT_FILE = `./answer/ragas_${RUN_NAME}.jsonl`;        // RAGAS input
const METRICS_FILE = `./answer/ragas_${RUN_NAME}_metrics.jsonl`; // latency + errors (Gap 2 numbers)
// ----------------------------

const raw = JSON.parse(fs.readFileSync("./retrieval_eval_dataset.json", "utf-8"));

function flattenDataset(raw) {
    const items = [];
    for (const category of Object.keys(raw)) {
        if (category === "cross_document_comparative") {
            for (const pair of raw[category]) {
                items.push({ ...pair.question_a, category });
                items.push({ ...pair.question_b, category });
            }
        } else {
            for (const entry of raw[category]) {
                items.push({ ...entry, category });
            }
        }
    }
    return items;
}

const dataset = flattenDataset(raw);

async function retrieve(question) {
    if (MODE === "e3") {
        const fused = await fuseResults(question);
        return await reranker(question, fused);   // E3: hybrid + rerank
    }
    return await denseSearch(question);           // E0: dense only (its own ranking, sliced to TOP_K below)
}

async function generate(question) {
    const ranked = await retrieve(question);
    const pages = ranked.slice(0, TOP_K);         // same pages go to prompt AND to RAGAS — keep identical
    const prompt = buildPrompt(question, pages);
    const rawAnswer = await generateAnswer(prompt);
    return { pages, rawAnswer };
}

async function ragPipeline() {
    fs.writeFileSync(OUTPUT_FILE, "");
    fs.writeFileSync(METRICS_FILE, "");

    const total = Math.min(dataset.length, MAX_QUESTIONS);

    for (let i = START_INDEX; i < total; i++) {
        const { question, document_title, gold_pages, category } = dataset[i];
        const id = `${category}_${i}`;
        const start = Date.now();

        let record = null;
        const metrics = { id, category, latency_ms: null, parse_error: null, error: null };

        try {
            const { pages, rawAnswer } = await generate(question);
            const rawStr = typeof rawAnswer === "string" ? rawAnswer : JSON.stringify(rawAnswer);

            let parsed = null;
            try { parsed = JSON.parse(rawStr); }
            catch (e) { metrics.parse_error = e.message; }

            record = {
                id,
                category,
                user_input: question,
                retrieved_contexts: pages.map(p => p.raw_text),
                response: (parsed && parsed.answer) ? parsed.answer : rawStr
            };
        } catch (e) {
            const errDetails = e.response ? JSON.stringify(e.response.data) : e.message;
            console.error(`Error at item ${i}:`, errDetails);
        }

        metrics.latency_ms = Date.now() - start;

        if (record) fs.appendFileSync(OUTPUT_FILE, JSON.stringify(record) + "\n");
        fs.appendFileSync(METRICS_FILE, JSON.stringify(metrics) + "\n");

        console.log(`[${MODE}] ${i + 1}/${total} (${metrics.latency_ms} ms)`
            + (metrics.error ? ` ERROR: ${metrics.error}` : "")
            + (metrics.parse_error ? ` PARSE_ERR` : ""));
    }
}

ragPipeline().catch(console.error);