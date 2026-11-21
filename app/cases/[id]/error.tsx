"use client";

import { Button } from "@/components/ui/button";

export default function CaseError({
  error,
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 px-4 py-10">
      <h1 className="text-xl font-semibold">분석을 불러오지 못했어요</h1>
      <p className="text-sm leading-6 text-muted-foreground">{error.message}</p>
      <Button type="button" onClick={reset} className="w-fit">
        다시 시도
      </Button>
    </main>
  );
}
