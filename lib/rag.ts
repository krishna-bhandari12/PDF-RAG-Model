import { randomUUID } from "crypto";
import fs from "node:fs/promises";
import path from "node:path";
import pdfParse from "pdf-parse";
import { ChatOpenAI, OpenAIEmbeddings } from "@langchain/openai";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import { RecursiveCharacterTextSplitter } from "langchain/text_splitter";
import type { DocumentRecord, SourceChunk } from "./types";

const documents = new Map<string, DocumentRecord>();

const ROOT = path.join(process.cwd(), "data");
const DOCUMENT_DIR = path.join(ROOT, "documents");
const UPLOAD_DIR = path.join(ROOT, "uploads");

async function ensureDirs() {
  await fs.mkdir(DOCUMENT_DIR, { recursive: true });
  await fs.mkdir(UPLOAD_DIR, { recursive: true });
}
const fallbackEmbeddingSize = 128;

const embeddingModel = process.env.OPENAI_API_KEY
  ? new OpenAIEmbeddings({ model: process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small" })
  : null;

const chatModel = process.env.OPENAI_API_KEY
  ? new ChatOpenAI({
      model: process.env.OPENAI_CHAT_MODEL || "gpt-4o-mini",
      temperature: 0.2
    })
  : null;

function normalizeText(text: string) {
  return text.replace(/\s+/g, " ").trim();
}

function previewText(text: string) {
  const normalized = normalizeText(text);
  return normalized.length > 220 ? `${normalized.slice(0, 220)}...` : normalized;
}

function hashToken(token: string) {
  let hash = 0;
  for (let index = 0; index < token.length; index += 1) {
    hash = (hash * 31 + token.charCodeAt(index)) >>> 0;
  }
  return hash;
}

function fallbackEmbed(text: string) {
  const vector = new Array(fallbackEmbeddingSize).fill(0);
  const tokens = normalizeText(text).toLowerCase().match(/[a-z0-9]+/g) ?? [];

  for (const token of tokens) {
    const index = hashToken(token) % fallbackEmbeddingSize;
    vector[index] += 1;
  }

  const magnitude = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0)) || 1;
  return vector.map((value) => value / magnitude);
}

async function embedText(text: string) {
  if (embeddingModel) {
    return embeddingModel.embedQuery(text);
  }

  return fallbackEmbed(text);
}

function cosineSimilarity(left: number[], right: number[]) {
  let dot = 0;
  let leftMagnitude = 0;
  let rightMagnitude = 0;

  for (let index = 0; index < Math.min(left.length, right.length); index += 1) {
    dot += left[index] * right[index];
    leftMagnitude += left[index] * left[index];
    rightMagnitude += right[index] * right[index];
  }

  const denominator = Math.sqrt(leftMagnitude) * Math.sqrt(rightMagnitude);
  return denominator === 0 ? 0 : dot / denominator;
}

function selectRelevantChunks(questionEmbedding: number[], chunks: SourceChunk[], topK = 4) {
  return chunks
    .map((chunk) => ({
      chunk,
      score: cosineSimilarity(questionEmbedding, chunk.embedding)
    }))
    .sort((left, right) => right.score - left.score)
    .slice(0, topK);
}

function formatContext(chunks: Array<{ chunk: SourceChunk; score: number }>) {
  return chunks
    .map(({ chunk, score }, index) => `[${index + 1}] ${chunk.metadata.source} | chunk ${chunk.metadata.chunkIndex + 1} | score ${score.toFixed(3)}\n${chunk.text}`)
    .join("\n\n");
}

function fallbackAnswer(question: string, chunks: Array<{ chunk: SourceChunk; score: number }>) {
  if (!chunks.length) {
    return `I could not find relevant content for: ${question}`;
  }

  const strongest = chunks[0];
  return [
    "I do not have an OpenAI API key configured, so this answer is based on retrieved text excerpts only.",
    `Most relevant passage: ${strongest.chunk.text.slice(0, 280).trim()}`,
    "Add OPENAI_API_KEY to .env.local to enable GPT-generated responses."
  ].join(" ");
}

export async function createDocumentFromPdf(buffer: Buffer, fileName: string): Promise<DocumentRecord> {
  await ensureDirs();
  const parsed = await pdfParse(buffer);
  const splitter = new RecursiveCharacterTextSplitter({
    chunkSize: 1000,
    chunkOverlap: 180
  });

  const text = normalizeText(parsed.text);
  const rawChunks = await splitter.splitText(text);
  const chunkEmbeddings = await Promise.all(rawChunks.map((chunk) => embedText(chunk)));

  const chunks: SourceChunk[] = rawChunks.map((chunk, index) => ({
    id: randomUUID(),
    text: chunk,
    metadata: {
      source: fileName,
      chunkIndex: index
    },
    embedding: chunkEmbeddings[index]
  }));

  const document: DocumentRecord = {
    id: randomUUID(),
    fileName,
    characterCount: text.length,
    preview: previewText(text),
    chunks
  };

  // persist uploaded PDF and document JSON so data survives restarts
  const uploadPath = path.join(UPLOAD_DIR, `${document.id}.pdf`);
  const docPath = path.join(DOCUMENT_DIR, `${document.id}.json`);

  await fs.writeFile(uploadPath, buffer);
  await fs.writeFile(docPath, JSON.stringify(document, null, 2), "utf8");

  documents.set(document.id, document);
  return document;
}

export async function listDocuments(): Promise<Array<{
  id: string;
  fileName: string;
  characterCount: number;
  preview: string;
  chunkCount: number;
}>> {
  await ensureDirs();
  const files = await fs.readdir(DOCUMENT_DIR).catch(() => []);
  const docs: Array<{ id: string; fileName: string; characterCount: number; preview: string; chunkCount: number }> = [];

  for (const file of files) {
    if (!file.endsWith(".json")) continue;
    try {
      const raw = await fs.readFile(path.join(DOCUMENT_DIR, file), "utf8");
      const parsed = JSON.parse(raw) as DocumentRecord;
      docs.push({ id: parsed.id, fileName: parsed.fileName, characterCount: parsed.characterCount, preview: parsed.preview, chunkCount: parsed.chunks.length });
      documents.set(parsed.id, parsed);
    } catch {
      // ignore parse errors per-file
    }
  }

  // newest first
  docs.sort((a, b) => b.characterCount - a.characterCount);
  return docs;
}

export async function deleteDocument(documentId: string): Promise<boolean> {
  await ensureDirs();
  const docPath = path.join(DOCUMENT_DIR, `${documentId}.json`);
  const uploadPath = path.join(UPLOAD_DIR, `${documentId}.pdf`);

  try {
    await fs.unlink(docPath).catch(() => {});
    await fs.unlink(uploadPath).catch(() => {});
    documents.delete(documentId);
    return true;
  } catch {
    return false;
  }
}

export function getDocument(documentId: string) {
  return documents.get(documentId) ?? null;
}

async function loadDocumentFromDisk(documentId: string): Promise<DocumentRecord | null> {
  await ensureDirs();
  const docPath = path.join(DOCUMENT_DIR, `${documentId}.json`);
  try {
    const raw = await fs.readFile(docPath, "utf8");
    const parsed = JSON.parse(raw) as DocumentRecord;
    documents.set(parsed.id, parsed);
    return parsed;
  } catch {
    return null;
  }
}

export async function answerQuestion(documentId: string, question: string) {
  let document = getDocument(documentId);

  if (!document) {
    // try loading from disk as a fallback
    document = await loadDocumentFromDisk(documentId);
  }

  if (!document) {
    return null;
  }

  const questionEmbedding = await embedText(question);
  const relevantChunks = selectRelevantChunks(questionEmbedding, document.chunks);
  const context = formatContext(relevantChunks);

  let answer = fallbackAnswer(question, relevantChunks);

  if (chatModel) {
    const response = await chatModel.invoke([
      new SystemMessage(
        "You answer questions strictly from the supplied PDF context. If the context does not contain the answer, say you cannot find it in the document. Keep the response clear, concise, and factual."
      ),
      new HumanMessage(`Context:\n${context}\n\nQuestion: ${question}`)
    ]);

    answer = typeof response.content === "string" ? response.content : JSON.stringify(response.content);
  }

  return {
    answer,
    sources: relevantChunks.map(({ chunk, score }) => ({
      citation: `${chunk.metadata.source} · chunk ${chunk.metadata.chunkIndex + 1}`,
      score,
      excerpt: chunk.text.length > 240 ? `${chunk.text.slice(0, 240)}...` : chunk.text
    }))
  };
}