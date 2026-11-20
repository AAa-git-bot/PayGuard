// 담당: 최서은 | PRD ① 첫 화면 (임시 뼈대 — 디자인은 서은이 교체)
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";

export default function Home() {
  return (
    <main className="mx-auto flex max-w-2xl flex-1 flex-col items-center justify-center gap-6 p-8 text-center">
      <h1 className="text-4xl font-bold">PayGuard</h1>
      <p className="text-lg text-gray-600">
        계약서 없이 카톡으로 일하는 청년 프리랜서를 위해, AI가 조건을 기록하고 분쟁이 생기면 증거를 정리해 드려요.
      </p>
      <div className="flex flex-col gap-3 sm:flex-row">
        {/* TODO(최서은·이다은): POST /api/sample 호출 후 /cases/[id]로 이동 */}
        <Button size="lg">샘플 사건으로 체험하기</Button>
        <Link href="/cases/new" className={buttonVariants({ size: "lg", variant: "outline" })}>
          새 사건 분석
        </Link>
        <Link href="/rooms/new" className={buttonVariants({ size: "lg", variant: "outline" })}>
          예방 모드 채팅방 만들기
        </Link>
      </div>
      <p className="text-xs text-gray-400">AI가 생성한 결과는 법률 자문이 아니에요.</p>
    </main>
  );
}
