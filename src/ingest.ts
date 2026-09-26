import { makePipeline } from "./pipeline.js";

const pipeline = await makePipeline();
const { docs, chunks } = await pipeline.ingest();
console.log(
  `Ingested ${docs} documents into ${chunks} chunks ` +
    `(embedder=${pipeline.embedder.name}, store=${pipeline.store.name})`
);
await pipeline.close();
