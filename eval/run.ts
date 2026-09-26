import { readFile, writeFile } from "node:fs/promises";
import { makePipeline } from "../src/pipeline.js";

/**
 * Runs the golden set against the live pipeline and reports:
 *
 *  - recall@k : fraction of cases where the expected document appears in the
 *               top k results. The headline number.
 *  - MRR      : mean reciprocal rank of the expected document. Sensitive to
 *               ordering, so it catches "still in top 3 but slipping" drift
 *               that recall@k hides.
 *
 * With --write-baseline, saves the result as the new baseline that
 * eval/gate.ts enforces. Re-baselining is a deliberate, reviewed act: the
 * diff shows up in the PR next to whatever change caused it.
 */

interface GoldenCase {
  id: string;
  query: string;
  expectedDoc: string;
}

interface Golden {
  k: number;
  cases: GoldenCase[];
}

export interface EvalResult {
  embedder: string;
  store: string;
  k: number;
  cases: number;
  recallAtK: number;
  mrr: number;
  failures: { id: string; query: string; expectedDoc: string; got: string[] }[];
}

const goldenPath = new URL("./golden.json", import.meta.url);
const baselinePath = new URL("./baseline.json", import.meta.url);

export async function runEval(): Promise<EvalResult> {
  const golden = JSON.parse(await readFile(goldenPath, "utf8")) as Golden;
  const pipeline = await makePipeline();
  await pipeline.ingest();

  let hits = 0;
  let rrSum = 0;
  const failures: EvalResult["failures"] = [];

  for (const c of golden.cases) {
    const results = await pipeline.retrieve(c.query, golden.k);
    const docIds = results.map((r) => r.docId);
    const rank = docIds.indexOf(c.expectedDoc);
    if (rank >= 0) {
      hits += 1;
      rrSum += 1 / (rank + 1);
    } else {
      failures.push({ id: c.id, query: c.query, expectedDoc: c.expectedDoc, got: docIds });
    }
  }

  await pipeline.close();

  return {
    embedder: pipeline.embedder.name,
    store: pipeline.store.name,
    k: golden.k,
    cases: golden.cases.length,
    recallAtK: Number((hits / golden.cases.length).toFixed(4)),
    mrr: Number((rrSum / golden.cases.length).toFixed(4)),
    failures,
  };
}

const isMain = process.argv[1] && import.meta.url.endsWith(process.argv[1].split("/").pop() ?? "");
if (isMain) {
  const result = await runEval();
  console.log(`embedder : ${result.embedder}`);
  console.log(`store    : ${result.store}`);
  console.log(`cases    : ${result.cases}`);
  console.log(`recall@${result.k} : ${result.recallAtK}`);
  console.log(`MRR      : ${result.mrr}`);
  if (result.failures.length > 0) {
    console.log(`\nFailed cases:`);
    for (const f of result.failures) {
      console.log(`  - ${f.id}: expected [${f.expectedDoc}], got [${f.got.join(", ")}]`);
      console.log(`    query: "${f.query}"`);
    }
  }
  if (process.argv.includes("--write-baseline")) {
    const { failures: _drop, ...baseline } = result;
    await writeFile(baselinePath, JSON.stringify(baseline, null, 2) + "\n");
    console.log(`\nBaseline written to eval/baseline.json`);
  }
}
