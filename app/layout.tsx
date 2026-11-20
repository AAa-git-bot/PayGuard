import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "PayGuard — 청년 프리랜서 분쟁 정리 AI",
  description:
    "계약서 없이 카톡으로 일하는 청년 프리랜서를 위해, AI가 조건을 기록하고 분쟁이 생기면 증거를 정리해 드려요.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="ko" className="h-full antialiased">
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
