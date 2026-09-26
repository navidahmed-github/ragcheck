import { readFile } from "node:fs/promises";
import { runEval } from "./run.js";

/**
 * The release gate. Runs the golden set and compares against the committed
 * baseline. Exits non-zero (fails CI, blocks the merge) when retrieval
 * quality regresses beyond tolerance.
 *
 * Why this exists: retrieval regressions are silent. The system returns
 * something plausible on every query, so a chunking tweak or embedder change
 * that quietly degrades recall ships without anyone noticing until users
 * complain. This gate turns "retrieval got worse" into a red build - the
 * quality bar is a number, enforced where code changes happen.
 *
 * Tolerances are deliberately asymmetric: any recall drop fails, small MRR
 * noise is tolerated, improvements always pass (and should be re-baselined).
 */

const RECALL_TOLERANCE = 0.0; // any recall drop is a failure
const MRR_TOLERANCE = 0.02; // ordering may wobble slightly between providers

interface Baseline {
  embedder: string;
  k: number;
  recallAtK: number;
  mrr: number;
}

const baselinePath = new URL("./baseline.json", import.meta.url);

let baseline: Baseline;
try {
  baseline = JSON.parse(await readFile(baselinePath, "utf8")) as Baseline;
} catch {
  console.error(
    "No baseline found. Run `npm run eval:baseline` on a known-good build first."
  );
  process.exit(2);
}

const result = await runEval();

console.log(`baseline : recall@${baseline.k}=${baseline.recallAtK} MRR=${baseline.mrr} (${baseline.embedder})`);
console.log(`current  : recall@${result.k}=${result.recallAtK} MRR=${result.mrr} (${result.embedder})`);

if (result.embedder !== baseline.embedder) {
  console.warn(
    `\nWARNING: embedder changed (${baseline.embedder} -> ${result.embedder}). ` +
      `Comparing across providers; re-baseline deliberately if this is intended.`
  );
}

const recallDrop = baseline.recallAtK - result.recallAtK;
const mrrDrop = baseline.mrr - result.mrr;
const problems: string[] = [];

if (recallDrop > RECALL_TOLERANCE) {
  problems.push(`recall@${result.k} dropped ${baseline.recallAtK} -> ${result.recallAtK}`);
}
if (mrrDrop > MRR_TOLERANCE) {
  problems.push(`MRR dropped ${baseline.mrr} -> ${result.mrr} (tolerance ${MRR_TOLERANCE})`);
}

if (problems.length > 0) {
  console.error(`\nGATE FAILED:`);
  for (const p of problems) console.error(`  - ${p}`);
  for (const f of result.failures) {
    console.error(`  failing case ${f.id}: expected [${f.expectedDoc}], got [${f.got.join(", ")}]`);
  }
  process.exit(1);
}

console.log(`\nGATE PASSED${recallDrop < 0 || mrrDrop < 0 ? " (improvement - consider re-baselining)" : ""}`);
