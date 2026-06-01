import { NextResponse } from "next/server";
import { createDocumentFromPdf } from "@/lib/rag";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const formData = await request.formData();
    const file = formData.get("pdf");

    if (!(file instanceof File)) {
      return NextResponse.json({ error: "Please upload a PDF file." }, { status: 400 });
    }

    if (file.type !== "application/pdf") {
      return NextResponse.json({ error: "Only PDF files are supported." }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const document = await createDocumentFromPdf(buffer, file.name);

    return NextResponse.json({
      documentId: document.id,
      fileName: document.fileName,
      chunkCount: document.chunks.length,
      characterCount: document.characterCount,
      preview: document.preview
    });
  } catch (error) {
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to process the PDF."
      },
      { status: 500 }
    );
  }
}