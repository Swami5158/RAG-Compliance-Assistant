const BLOCK_START = [
    /^\((\d+|[a-z]|[ivx]+)\)\s/,        // (1)  (a)  (iv)
    /^\d+\.\s/,                          // 8.
    /^[A-Z]\.\s/,                        // A.
    /^Chapter\s+[IVXLC\d]+\s*[-–:]/,     // Chapter III - General Controls
    /^\(Note/                            // (Note: ...
];

const EDGE_LINES = 3;

function isBlockStart(line) {
    return BLOCK_START.some(re => re.test(line));
}

// rawPages: [{ pageNumber, text }] for ONE document
function cleanDocument(rawPages) {
    const removed = [];
    const hyphenJoins = [];

    const pages = rawPages.map(p => ({
        pageNumber: p.pageNumber,
        lines: p.text
            .split("\n")
            .map(l => l.replace(/\s+/g, " ").trim())
            .filter(l => l !== "")
    }));

    // lines that repeat at the page edges on most pages = header/footer
    const edgeCount = new Map();
    for (const p of pages) {
        const edges = new Set([
            ...p.lines.slice(0, EDGE_LINES),
            ...p.lines.slice(-EDGE_LINES)
        ]);
        for (const l of edges) edgeCount.set(l, (edgeCount.get(l) || 0) + 1);
    }
    const repeated = new Set(
        [...edgeCount].filter(([, n]) => n > pages.length / 2).map(([l]) => l)
    );

    const cleaned = pages.map(p => {
        const blocks = [];

        for (const line of p.lines) {
            if (repeated.has(line)) {
                removed.push({ page: p.pageNumber, line, reason: "repeated header/footer" });
                continue;
            }
            if (/^\d+$/.test(line)) {
                removed.push({ page: p.pageNumber, line, reason: "lone page number" });
                continue;
            }

            if (blocks.length === 0 || isBlockStart(line)) {
                blocks.push(line);
            } else {
                const last = blocks.length - 1;
                if (blocks[last].endsWith("-")) {
                    hyphenJoins.push({ page: p.pageNumber, before: blocks[last].slice(-25), after: line.slice(0, 25) });
                    blocks[last] += line;
                } else {
                    blocks[last] += " " + line;
                }
            }
        }

        return { pageNumber: p.pageNumber, text: blocks.join("\n") };
    });

    return { pages: cleaned, removed, hyphenJoins };
}

module.exports = cleanDocument;