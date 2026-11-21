import { HomeActions } from "@/components/HomeActions";

export default function Home() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col items-center justify-center gap-6 px-4 py-10 text-center">
      <h1 className="text-4xl font-bold">PayGuard</h1>
      <p className="text-lg leading-8 text-muted-foreground">
        계약서 없이 카톡으로 일하는 청년 프리랜서를 위해, AI가 조건을 기록하고 분쟁이 생기면 증거를 정리해 드려요.
      </p>
      <HomeActions />
      <p className="text-xs text-muted-foreground">AI가 생성한 결과는 법률 자문이 아니에요.</p>
    </main>
  );
}
