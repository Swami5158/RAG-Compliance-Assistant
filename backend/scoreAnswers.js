const fs = require("fs");

const INPUT_FILE = process.argv[2] || "./answer/answers_pages_top5_v2_rest.json";
const OUTPUT_FILE = INPUT_FILE.replace(".json", "_scored.json");

const data = JSON.parse(fs.readFileSync(INPUT_FILE, "utf-8"));

function normalize(s) {
    return String(s ?? "")
        .toLowerCase()
        .replace(/[\u2018\u2019\u201B]/g, "'")
        .replace(/[\u201C\u201D]/g, '"')
        .replace(/[\u2010-\u2015\u2212]/g, "-")
        .replace(/\s+/g, " ")
        .trim();
}

// ignores everything except letters and digits, to spot quotes that differ only in spacing/punctuation
function loose(s) {
    return String(s ?? "").toLowerCase().replace(/[^a-z0-9]/g, "");
}

function scoreRecord(r) {
    const retrieved = r.retrieved_pages || [];
    const gold = r.gold_pages || [];

    const goldRetrieved = gold.some(g =>
        retrieved.some(p => p.document_id === r.document_title && Number(p.page_number) === Number(g))
    );

    const out = {
        id: r.id,
        category: r.category,
        question: r.question,
        document_title: r.document_title,
        gold_pages: gold,
        status: r.parsed_answer?.status ?? null,
        gold_retrieved: goldRetrieved,
        gold_cited_stated: false,   // using the page numbers the model wrote
        gold_cited: false,          // using pages resolved from where the quote really is
        evidence_checks: [],
        outcome: null,              // resolved
        outcome_stated: null,       // as the model labelled pages
        latency_ms: r.latency_ms
    };

    if (r.error) { out.outcome = out.outcome_stated = "error"; return out; }
    if (r.parse_error || !r.parsed_answer) { out.outcome = out.outcome_stated = "parse_error"; return out; }
    if (r.parsed_answer.status === "UNANSWERED") { out.outcome = out.outcome_stated = "unanswered"; return out; }

    const evidence = Array.isArray(r.parsed_answer.evidence) ? r.parsed_answer.evidence : [];

    for (const e of evidence) {
        const statedPage = Number(e.page);
        const quote = e.quote;
        const hasQuote = typeof quote === "string" && quote.trim() !== "";

        // quote check against the page the model named
        const src = retrieved.find(p => p.document_id === e.document_id && Number(p.page_number) === statedPage);
        let quoteMatch = "no_page";
        if (src) {
            if (hasQuote && normalize(src.raw_text).includes(normalize(quote))) quoteMatch = "exact";
            else if (hasQuote && loose(src.raw_text).includes(loose(quote))) quoteMatch = "loose";
            else quoteMatch = "none";
        }

        // every retrieved page that contains the quote
        const matches = hasQuote
            ? retrieved.filter(p =>
                normalize(p.raw_text).includes(normalize(quote)) ||
                loose(p.raw_text).includes(loose(quote)))
            : [];

        const statedMatch = matches.find(p => p.document_id === e.document_id && Number(p.page_number) === statedPage);

        let resolution, resolved = null;
        if (statedMatch) { resolution = "as_cited"; resolved = statedMatch; }
        else if (matches.length === 1) { resolution = "corrected"; resolved = matches[0]; }
        else if (matches.length > 1) { resolution = "ambiguous"; }
        else { resolution = "unverified"; }

        const isGold = (docId, page) => docId === r.document_title && gold.includes(Number(page));

        out.evidence_checks.push({
            document_id: e.document_id,
            page: e.page,
            page_retrieved: !!src,
            quote_match: quoteMatch,
            resolution,
            resolved_document_id: resolved ? resolved.document_id : null,
            resolved_page: resolved ? Number(resolved.page_number) : null,
            candidates: resolution === "ambiguous"
                ? matches.map(p => ({ document_id: p.document_id, page: Number(p.page_number) }))
                : null,
            gold_hit_stated: isGold(e.document_id, statedPage),
            gold_hit: resolved ? isGold(resolved.document_id, resolved.page_number) : false,
            quote_preview: hasQuote ? quote.slice(0, 80) : null
        });
    }

    out.gold_cited_stated = out.evidence_checks.some(c => c.gold_hit_stated);
    out.gold_cited = out.evidence_checks.some(c => c.gold_hit);

    const outcomeOf = goldCited => {
        if (evidence.length === 0) return "no_evidence";
        if (!goldRetrieved) return "retrieval_miss";
        return goldCited ? "gold_cited" : "model_miss";
    };
    out.outcome_stated = outcomeOf(out.gold_cited_stated);
    out.outcome = outcomeOf(out.gold_cited);

    return out;
}

const scored = data.results.map(scoreRecord);

function summarize(rows) {
    const s = {
        n: rows.length, error: 0, parse_error: 0, unanswered: 0, no_evidence: 0,
        retrieval_miss: 0, model_miss: 0, gold_cited: 0,
        evidence: 0, page_retrieved: 0, quote_exact: 0, quote_loose: 0, quote_none: 0,
        unanswered_gold_retrieved: 0, latency_total: 0
    };

    for (const r of rows) {
        s[r.outcome]++;
        s.latency_total += r.latency_ms || 0;
        if (r.outcome === "unanswered" && r.gold_retrieved) s.unanswered_gold_retrieved++;

        for (const c of r.evidence_checks) {
            s.evidence++;
            if (c.page_retrieved) s.page_retrieved++;
            if (c.quote_match === "exact") s.quote_exact++;
            else if (c.quote_match === "loose") s.quote_loose++;
            else if (c.quote_match === "none") s.quote_none++;
        }
    }
    return s;
}

function show(label, rows) {
    const s = summarize(rows);
    console.log(`\n=== ${label} (n=${s.n}) ===`);
    console.log(`errors: ${s.error}, parse errors: ${s.parse_error}, answered without evidence: ${s.no_evidence}`);
    console.log(`unanswered: ${s.unanswered} (gold page was retrieved in ${s.unanswered_gold_retrieved})`);
    console.log(`gold page cited: ${s.gold_cited}, model miss (gold retrieved, not cited): ${s.model_miss}, retrieval miss (gold not retrieved): ${s.retrieval_miss}`);
    console.log(`evidence entries: ${s.evidence}, cited page was in retrieved set: ${s.page_retrieved}`);
    console.log(`quote exact: ${s.quote_exact}, differs only in spacing/punctuation: ${s.quote_loose}, not found: ${s.quote_none}`);
    console.log(`avg latency: ${Math.round(s.latency_total / Math.max(s.n, 1))} ms`);
}

show("ALL", scored);
for (const cat of [...new Set(scored.map(r => r.category))]) {
    show(cat, scored.filter(r => r.category === cat));
}

const res = { as_cited: 0, corrected: 0, ambiguous: 0, unverified: 0 };
for (const r of scored) for (const c of r.evidence_checks) res[c.resolution]++;
const totalEv = res.as_cited + res.corrected + res.ambiguous + res.unverified;

console.log("\n=== Page label resolution ===");
console.log(`evidence entries: ${totalEv}`);
console.log(`page label correct (quote is on the cited page): ${res.as_cited}`);
console.log(`page label wrong, quote found on exactly one other retrieved page: ${res.corrected}`);
console.log(`quote found on several retrieved pages, none of them the cited one (ambiguous): ${res.ambiguous}`);
console.log(`quote not found on any retrieved page (unverified): ${res.unverified}`);

const counts = key => {
    const c = {};
    for (const r of scored) c[r[key]] = (c[r[key]] || 0) + 1;
    return c;
};
console.log("\n=== Outcomes ===");
console.log("as the model stated pages:", counts("outcome_stated"));
console.log("after resolving pages:   ", counts("outcome"));

console.log("\n=== Read by hand ===");
for (const r of scored) {
    const bad = r.evidence_checks.filter(c => c.resolution === "unverified" || c.resolution === "ambiguous");
    const flagged = r.outcome === "model_miss" || r.outcome === "no_evidence" || r.outcome === "error" || r.outcome === "parse_error" || bad.length > 0;
    if (!flagged) continue;

    const resolvedPages = [...new Set(
        r.evidence_checks.filter(c => c.resolved_page !== null).map(c => `${c.resolved_document_id.slice(-4)} p${c.resolved_page}`)
    )].join(", ");

    console.log(`${r.id}: ${r.outcome_stated} -> ${r.outcome} | gold: ${r.gold_pages.join(",")} | resolved: ${resolvedPages || "none"}`);
    for (const c of bad) {
        console.log(`   ${c.resolution}: cited ${c.document_id.slice(-4)} p${c.page} | "${c.quote_preview}"` +
            (c.candidates ? ` | candidates: ${c.candidates.map(x => x.document_id.slice(-4) + " p" + x.page).join(", ")}` : ""));
    }
}

fs.writeFileSync(OUTPUT_FILE, JSON.stringify(scored, null, 2), "utf-8");
console.log(`\nSaved per-question results to ${OUTPUT_FILE}`);