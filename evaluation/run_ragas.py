import sys
import types
import warnings

warnings.filterwarnings("ignore", category=DeprecationWarning)

# Mock patch for ragas vertexai import bug
dummy_module = types.ModuleType("langchain_community.chat_models.vertexai")
dummy_module.ChatVertexAI = type("ChatVertexAI", (object,), {})
sys.modules["langchain_community.chat_models.vertexai"] = dummy_module

import os
import time
import json
import pandas as pd
from ragas import EvaluationDataset, evaluate
from ragas.metrics import Faithfulness
from ragas.llms import LangchainLLMWrapper
from ragas.run_config import RunConfig
from langchain_google_genai import ChatGoogleGenerativeAI

# ---------- Config ----------
assert "GOOGLE_API_KEY" in os.environ, "GOOGLE_API_KEY is not set in this terminal"

INPUT_PATH = "answer/ragas_pages_top5_e3.jsonl"
OUTPUT_PATH = "answer/ragas_faithfulness_scores_e3.jsonl"
LLM_MODEL = "gemini-3.5-flash-lite"

LIMIT = None               # set to 2 for a quick cost check, None for all rows
ROWS_PER_CHUNK = 3         # about 6-8 judge calls per chunk
MIN_SECONDS_PER_ROW = 13   # paces the run to roughly 10-12 requests/min (limit is 15)
MAX_PASSES = 4             # retry passes over rows that failed
WAIT_BETWEEN_PASSES = 70   # seconds

print("Using judge model:", LLM_MODEL)

# ---------- Load dataset ----------
df = pd.read_json(INPUT_PATH, lines=True, encoding="utf-8")
for col in ("user_input", "response", "retrieved_contexts"):
    if col not in df.columns:
        raise SystemExit(f"Missing required column '{col}'. Found: {list(df.columns)}")

df["retrieved_contexts"] = df["retrieved_contexts"].apply(
    lambda x: [str(c) for c in x] if isinstance(x, list) else [str(x)]
)
if LIMIT:
    df = df.head(LIMIT)

# ---------- Resume from earlier scores (same judge only) ----------
scores = {}
if os.path.exists(OUTPUT_PATH):
    with open(OUTPUT_PATH, encoding="utf-8") as f:
        for line in f:
            rec = json.loads(line)
            if rec["judge"] != LLM_MODEL:
                raise SystemExit(
                    f"{OUTPUT_PATH} holds scores from {rec['judge']}. "
                    "Delete it or use a new OUTPUT_PATH; do not mix judge models."
                )
            scores[rec["row"]] = rec["faithfulness"]
    print(f"Resuming: {len(scores)} rows already scored")


def save():
    with open(OUTPUT_PATH, "w", encoding="utf-8") as f:
        for row in sorted(scores):
            f.write(json.dumps({
                "row": int(row),
                "user_input": df.loc[row, "user_input"],
                "faithfulness": scores[row],
                "judge": LLM_MODEL,
            }, ensure_ascii=False) + "\n")


# ---------- Judge ----------
evaluator_llm = LangchainLLMWrapper(
    ChatGoogleGenerativeAI(model=LLM_MODEL, temperature=0, max_retries=1, timeout=300)
)
metric = Faithfulness()
run_config = RunConfig(max_workers=2, timeout=300, max_retries=2)

evaluator_llm.langchain_llm.invoke("ping")   # costs 1 request; fails fast on a bad key
print("LLM check passed.")

# ---------- Score, pacing requests, retrying failed rows ----------
for attempt in range(1, MAX_PASSES + 1):
    pending = [i for i in df.index if i not in scores]
    if not pending:
        break
    print(f"Pass {attempt}: {len(pending)} rows to score")

    for k in range(0, len(pending), ROWS_PER_CHUNK):
        batch = pending[k:k + ROWS_PER_CHUNK]
        t0 = time.time()

        part = EvaluationDataset.from_pandas(
            df.loc[batch, ["user_input", "response", "retrieved_contexts"]]
        )
        result = evaluate(
            dataset=part,
            metrics=[metric],
            llm=evaluator_llm,
            run_config=run_config,
            raise_exceptions=False,
            show_progress=False,
        )
        out = result.to_pandas()

        for row, val in zip(batch, out["faithfulness"]):
            if pd.notna(val):
                scores[row] = float(val)
        save()

        done = sum(1 for r in batch if r in scores)
        print(f"  rows {batch}: {done}/{len(batch)} scored")

        pause = ROWS_PER_CHUNK * MIN_SECONDS_PER_ROW - (time.time() - t0)
        if pause > 0:
            time.sleep(pause)

    if attempt < MAX_PASSES and any(i not in scores for i in df.index):
        print(f"Waiting {WAIT_BETWEEN_PASSES}s before retrying the failed rows...")
        time.sleep(WAIT_BETWEEN_PASSES)

# ---------- Report ----------
total = len(df)
vals = pd.Series(scores, dtype=float)
print(f"\nScored {len(vals)} of {total} rows with {LLM_MODEL}")
if len(vals):
    print(f"Mean faithfulness (scored rows only): {vals.mean():.3f}")

print("\nRows below 0.8:")
for row, v in vals[vals < 0.8].items():
    print(f"  row {row}: {v:.2f} | {df.loc[row, 'user_input'][:80]}")

missing = [i for i in df.index if i not in scores]
if missing:
    print(f"\nUNSCORED rows: {missing}")
    print("Run the script again to resume; finished rows are skipped.")
print(f"\nSaved to {OUTPUT_PATH}")