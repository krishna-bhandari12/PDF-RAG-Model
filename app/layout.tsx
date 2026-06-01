import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PDF Chat Assistant",
  description: "Upload a PDF and ask grounded questions with a local RAG workflow."
};

export default function RootLayout({
  children
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}