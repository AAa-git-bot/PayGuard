import Link from "next/link";
import { ShieldCheck } from "lucide-react";

// 모든 페이지 위 공통 헤더 (인쇄할 때는 숨김)
export function SiteHeader() {
  return (
    <header className="sticky top-0 z-30 border-b bg-background/85 backdrop-blur print:hidden">
      <div className="mx-auto flex h-14 w-full max-w-5xl items-center justify-between px-4 sm:px-8">
        <Link href="/" className="flex items-center gap-2 font-semibold tracking-tight">
          <span className="flex size-8 items-center justify-center rounded-lg bg-brand text-white">
            <ShieldCheck className="size-4.5" aria-hidden />
          </span>
          PayGuard
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          <Link href="/cases/new" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            사건 업로드
          </Link>
          <Link href="/rooms/new" className="rounded-md px-3 py-1.5 text-muted-foreground hover:bg-muted hover:text-foreground">
            AI 채팅방
          </Link>
        </nav>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t py-6 text-center text-xs leading-5 text-muted-foreground print:hidden">
      <p>AI가 생성한 결과는 법률 자문이 아니에요. 문서는 초안이며 발송·제출은 직접 판단해 주세요.</p>
      <p>PayGuard · 2026 대한민국 청년 CAREER FAIR AI 해커톤</p>
    </footer>
  );
}
