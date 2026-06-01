import { NextResponse } from "next/server";
import { answerQuestion } from "@/lib/rag";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as { documentId?: string; question?: string };
    const documentId = body.documentId?.trim();
    const question = body.question?.trim();

    if (!documentId) {
      return NextResponse.json({ error: "Missing document id." }, { status: 400 });
    }

    if (!question) {
      return NextResponse.json({ error: "Ask a question." }, { status: 400 });
    }

    const result = await answerQuestion(documentId, question);

    if (!result) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to answer the question."
      },
      { status: 500 }
    );
  }
}