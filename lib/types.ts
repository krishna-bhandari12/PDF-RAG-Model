export type SourceChunk = {
  id: string;
  text: string;
  metadata: {
    source: string;
    chunkIndex: number;
  };
  embedding: number[];
};

export type DocumentRecord = {
  id: string;
  fileName: string;
  characterCount: number;
  preview: string;
  chunks: SourceChunk[];
};

export type UploadResult = {
  documentId: string;
  fileName: string;
  chunkCount: number;
  characterCount: number;
  preview: string;
};