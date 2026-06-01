"use client";

import { useEffect, useMemo, useState } from "react";

type SourceHit = {
  citation: string;
  score: number;
  excerpt: string;
};

type UploadResponse = {
  documentId: string;
  fileName: string;
  chunkCount: number;
  characterCount: number;
  preview: string;
};

type AskResponse = {
  answer: string;
  sources: SourceHit[];
};

const starterQuestions = [
  "What is this document mainly about?",
  "Summarize the key points in simple language.",
  "What are the most important details I should remember?"
];

export default function Page() {
  const [documentId, setDocumentId] = useState("");
  const [fileName, setFileName] = useState("");
  const [chunkCount, setChunkCount] = useState(0);
  const [characterCount, setCharacterCount] = useState(0);
  const [preview, setPreview] = useState("");
  const [documents, setDocuments] = useState<UploadResponse[]>([]);
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [sources, setSources] = useState<SourceHit[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    const stored = window.localStorage.getItem("rag-pdf-document");
    if (stored) {
      setDocumentId(stored);
    }
    // load persisted documents when UI mounts
    fetchDocuments();
  }, []);

  useEffect(() => {
    if (documentId) {
      window.localStorage.setItem("rag-pdf-document", documentId);
    }
  }, [documentId]);

  const hasDocument = Boolean(documentId);
  const statusText = useMemo(() => {
    if (uploading) return "Processing PDF...";
    if (busy) return "Searching and generating answer...";
    if (hasDocument) return "Ready for questions";
    return "Upload a PDF to begin";
  }, [busy, hasDocument, uploading]);

  async function handleUpload(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setAnswer("");
    setSources([]);

    const form = event.currentTarget as HTMLFormElement;
    const formData = new FormData(form);
    const file = formData.get("pdf");

    if (!(file instanceof File)) {
      setError("Please choose a PDF file.");
      return;
    }

    setUploading(true);

    try {
      const payload = new FormData();
      payload.append("pdf", file);

      const response = await fetch("/api/upload", {
        method: "POST",
        body: payload
      });

      const data = (await response.json()) as UploadResponse | { error?: string };

      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "Upload failed.");
      }

      const upload = data as UploadResponse;
      setDocumentId(upload.documentId);
      setFileName(upload.fileName);
      setChunkCount(upload.chunkCount);
      setCharacterCount(upload.characterCount);
      setPreview(upload.preview);
      // refresh document list
      await fetchDocuments();
      form.reset();
    } catch (uploadError) {
      setError(uploadError instanceof Error ? uploadError.message : "Upload failed.");
    } finally {
      setUploading(false);
    }
  }

  async function fetchDocuments() {
    try {
      const res = await fetch("/api/documents");
      if (!res.ok) return;
      const list = (await res.json()) as UploadResponse[];
      setDocuments(list);
    } catch {
      // ignore
    }
  }

  async function handleSelectDocument(id: string) {
    setDocumentId(id);
    // load metadata from server list if available
    const found = documents.find((d) => d.documentId === id);
    if (found) {
      setFileName(found.fileName);
      setChunkCount(found.chunkCount);
      setCharacterCount(found.characterCount);
      setPreview(found.preview);
    }
    window.localStorage.setItem("rag-pdf-document", id);
  }

  async function handleDeleteDocument(id: string) {
    if (!confirm("Delete this document?")) return;
    try {
      const res = await fetch("/api/documents", { method: "DELETE", body: JSON.stringify({ documentId: id }) });
      if (!res.ok) throw new Error("Delete failed");
      // clear if deleted was active
      if (documentId === id) {
        setDocumentId("");
        setFileName("");
        setChunkCount(0);
        setCharacterCount(0);
        setPreview("");
        window.localStorage.removeItem("rag-pdf-document");
      }
      await fetchDocuments();
    } catch (e) {
      // ignore error for now
    }
  }

  async function handleAsk(nextQuestion?: string) {
    const prompt = (nextQuestion ?? question).trim();
    if (!prompt) {
      setError("Ask a question about the uploaded PDF.");
      return;
    }
    if (!documentId) {
      setError("Upload a PDF first.");
      return;
    }

    setError("");
    setBusy(true);

    try {
      const response = await fetch("/api/ask", {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify({ documentId, question: prompt })
      });

      const data = (await response.json()) as AskResponse | { error?: string };
      if (!response.ok) {
        throw new Error("error" in data && data.error ? data.error : "Question failed.");
      }

      const answerPayload = data as AskResponse;
      setAnswer(answerPayload.answer);
      setSources(answerPayload.sources);
      setQuestion(prompt);
    } catch (askError) {
      setError(askError instanceof Error ? askError.message : "Question failed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="shell">
      <section className="hero">
        <div>
          <p className="eyebrow">RAG PDF Chat Assistant</p>
          <h1>Upload a PDF, ask questions, and get answers grounded in the document.</h1>
          <p className="lede">
            This project combines PDF parsing, chunking, embeddings, vector search, and GPT-style answer generation in a single local prototype.
          </p>
        </div>
        <div className="statusCard">
          <span className="statusLabel">Status</span>
          <strong>{statusText}</strong>
          <p>{hasDocument ? `Active document: ${fileName || "uploaded PDF"}` : "No document loaded yet."}</p>
          <div style={{ marginTop: 12 }}>
            <strong style={{ display: "block", marginBottom: 8 }}>Documents</strong>
            {documents.length === 0 ? (
              <div style={{ color: "var(--muted)", fontSize: 13 }}>No documents yet</div>
            ) : (
              <div style={{ display: "grid", gap: 8 }}>
                {documents.map((doc) => (
                  <div key={doc.documentId} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <button className="chip" type="button" onClick={() => handleSelectDocument(doc.documentId)}>
                      {doc.fileName}
                    </button>
                    <button className="chip" type="button" onClick={() => handleDeleteDocument(doc.documentId)} style={{ background: "rgba(248, 113, 113, 0.12)" }}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <section className="grid">
        <article className="panel uploadPanel">
          <h2>1. Upload PDF</h2>
          <form onSubmit={handleUpload} className="form">
            <label className="fileField">
              <span>Select a PDF</span>
              <input name="pdf" type="file" accept="application/pdf" />
            </label>
            <button className="primaryButton" type="submit" disabled={uploading}>
              {uploading ? "Processing..." : "Upload and index"}
            </button>
          </form>

          <div className="statsRow">
            <div>
              <span>Chunks</span>
              <strong>{chunkCount || "-"}</strong>
            </div>
            <div>
              <span>Characters</span>
              <strong>{characterCount ? characterCount.toLocaleString() : "-"}</strong>
            </div>
          </div>

          {preview ? (
            <div className="previewBox">
              <span>Preview</span>
              <p>{preview}</p>
            </div>
          ) : null}
        </article>

        <article className="panel chatPanel">
          <h2>2. Ask Questions</h2>
          <div className="questionChips">
            {starterQuestions.map((item) => (
              <button key={item} type="button" className="chip" onClick={() => handleAsk(item)}>
                {item}
              </button>
            ))}
          </div>

          <div className="chatForm">
            <textarea
              value={question}
              onChange={(event) => setQuestion(event.target.value)}
              placeholder="Ask anything about the uploaded PDF..."
              rows={5}
            />
            <button className="primaryButton" type="button" onClick={() => handleAsk()} disabled={busy || !hasDocument}>
              {busy ? "Thinking..." : "Get answer"}
            </button>
          </div>

          {answer ? (
            <div className="answerBox">
              <span>Answer</span>
              <p>{answer}</p>
            </div>
          ) : null}

          {sources.length ? (
            <div className="sourcesBox">
              <span>Retrieved context</span>
              <div className="sourcesList">
                {sources.map((source) => (
                  <article key={`${source.citation}-${source.score}`} className="sourceCard">
                    <strong>{source.citation}</strong>
                    <p>{source.excerpt}</p>
                    <small>Similarity {source.score.toFixed(3)}</small>
                  </article>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </section>

      {error ? <p className="errorBanner">{error}</p> : null}
    </main>
  );
}