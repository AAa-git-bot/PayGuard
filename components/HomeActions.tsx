"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Button, buttonVariants } from "@/components/ui/button";

export function HomeActions() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openSample() {
    setLoading(true);
    setError(null);
    try {
      const response = await fetch("/api/sample", { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "샘플 사건을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      router.push(`/cases/${body.id}`);
    } catch {
      setError("서버에 연결하지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col items-center gap-3">
      <div className="flex w-full flex-col gap-3 sm:w-auto sm:flex-row sm:flex-wrap sm:justify-center">
        <Button size="lg" className="w-full sm:w-auto" disabled={loading} onClick={() => void openSample()}>
          {loading ? "샘플을 준비하는 중" : "샘플 사건으로 체험하기"}
        </Button>
        <Link href="/cases/new" className={buttonVariants({ size: "lg", variant: "outline", className: "w-full sm:w-auto" })}>
          새 사건 분석
        </Link>
        <Link href="/rooms/new" className={buttonVariants({ size: "lg", variant: "outline", className: "w-full sm:w-auto" })}>
          예방 모드 채팅방 만들기
        </Link>
      </div>
      {error ? (
        <p className="max-w-md rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
