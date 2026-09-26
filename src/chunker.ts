import { createHash } from "node:crypto";
import type { Chunk } from "./types.js";

/**
 * Heading-aware markdown chunker.
 *
 * Strategy (see ADR-0003): split on H2/H3 boundaries so a chunk never
 * straddles two procedures, then split any oversized section on paragraph
 * boundaries with one paragraph of overlap. Every chunk carries its heading,
 * because "Working at Heights > Harness inspection" retrieves far better than
 * an orphaned paragraph about webbing.
 */
const MAX_CHUNK_CHARS = 1200;

interface Section {
  heading: string;
  body: string;
}

function splitSections(markdown: string): Section[] {
  const lines = markdown.split("\n");
  const sections: Section[] = [];
  let heading = "";
  let buf: string[] = [];

  const flush = () => {
    const body = buf.join("\n").trim();
    if (body) sections.push({ heading, body });
    buf = [];
  };

  for (const line of lines) {
    const m = /^(#{1,3})\s+(.*)$/.exec(line);
    if (m) {
      flush();
      heading = m[2]?.trim() ?? "";
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

export function chunkDocument(docId: string, markdown: string): Chunk[] {
  const chunks: Chunk[] = [];

  for (const section of splitSections(markdown)) {
    const paragraphs = section.body
      .split(/\n\s*\n/)
      .map((p) => p.trim())
      .filter(Boolean);

    let current: string[] = [];
    let currentLen = 0;

    const emit = () => {
      if (current.length === 0) return;
      const text = `${section.heading}\n\n${current.join("\n\n")}`;
      const id = createHash("sha1").update(`${docId}:${text}`).digest("hex").slice(0, 12);
      chunks.push({ id, docId, heading: section.heading, text });
    };

    for (const para of paragraphs) {
      if (currentLen + para.length > MAX_CHUNK_CHARS && current.length > 0) {
        emit();
        // one-paragraph overlap so a fact at a boundary is retrievable from
        // either side of the split
        const overlap = current[current.length - 1];
        current = overlap !== undefined ? [overlap] : [];
        currentLen = overlap?.length ?? 0;
      }
      current.push(para);
      currentLen += para.length;
    }
    emit();
  }

  return chunks;
}
