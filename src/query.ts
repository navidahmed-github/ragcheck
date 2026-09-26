import { makePipeline } from "./pipeline.js";

const query = process.argv.slice(2).join(" ").trim();
if (!query) {
  console.error('Usage: npm run ask -- "when must a harness be inspected?"');
  process.exit(1);
}

const pipeline = await makePipeline();
await pipeline.ingest();
const results = await pipeline.retrieve(query, 3);

console.log(`\nQuery: ${query}\n`);
for (const [i, r] of results.entries()) {
  console.log(`--- ${i + 1}. [${r.docId}] ${r.heading} (score ${r.score.toFixed(3)})`);
  console.log(r.text.split("\n\n").slice(1).join("\n\n").slice(0, 400));
  console.log();
}
await pipeline.close();
