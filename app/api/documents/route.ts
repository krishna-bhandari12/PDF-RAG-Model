import { NextResponse } from "next/server";
import { listDocuments, deleteDocument } from "@/lib/rag";

export const runtime = "nodejs";

export async function GET() {
  try {
    const docs = await listDocuments();
    return NextResponse.json(docs);
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Could not list documents." }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  try {
    const body = (await request.json()) as { documentId?: string };
    if (!body?.documentId) {
      return NextResponse.json({ error: "documentId is required." }, { status: 400 });
    }

    const ok = await deleteDocument(body.documentId);
    if (!ok) {
      return NextResponse.json({ error: "Failed to delete document." }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Delete failed." }, { status: 500 });
  }
}