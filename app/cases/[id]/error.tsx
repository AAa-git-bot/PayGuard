"use client";

import { useEffect } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";

export default function CaseError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  const router = useRouter();

  useEffect(() => {
    console.error(error);
  }, [error]);

  return (
    <main className="mx-auto flex w-full max-w-lg flex-1 flex-col gap-3 px-4 py-10">
      <h1 className="text-xl font-semibold">분석을 불러오지 못했어요</h1>
      <p className="text-sm leading-6 text-muted-foreground">
        사건을 찾지 못했거나 서버에 잠시 문제가 있어요. 잠시 후 다시 시도해 주세요.
      </p>
      <div className="flex flex-wrap gap-2">
        <Button
          type="button"
          onClick={() => {
            router.refresh();
            reset();
          }}
        >
          다시 시도
        </Button>
        <Link href="/" className={buttonVariants({ variant: "outline" })}>
          첫 화면으로
        </Link>
      </div>
    </main>
  );
}
