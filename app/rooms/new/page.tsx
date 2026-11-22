"use client";

// 담당: 최서은 | PRD ⑨ 예방 모드 방 만들기
import { useState } from "react";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";

const ROLES = [
  { as: "freelancer", label: "프리랜서용 링크" },
  { as: "client", label: "의뢰인용 링크" },
] as const;

export default function NewRoomPage() {
  const [title, setTitle] = useState("");
  const [roomId, setRoomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  async function createRoom() {
    setError(null);
    if (!title.trim()) {
      setError("방 제목을 입력해 주세요.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch("/api/rooms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ title: title.trim() }),
      });
      const body = (await response.json().catch(() => ({}))) as { id?: string; error?: string };
      if (!response.ok || !body.id) {
        setError(body.error ?? "방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setRoomId(body.id);
    } catch {
      setError("서버에 연결하지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  function linkFor(as: string) {
    const origin = typeof window === "undefined" ? "" : window.location.origin;
    return `${origin}/rooms/${roomId}?as=${as}`;
  }

  async function copy(as: string) {
    try {
      await navigator.clipboard.writeText(linkFor(as));
      setCopied(as);
    } catch {
      setCopied(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-xl flex-1 flex-col gap-5 px-4 py-8 sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold">예방 모드 채팅방 만들기</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          프리랜서와 의뢰인이 함께 쓰는 채팅방이에요. AI가 대화 속 계약 조건(금액·수정 횟수·납기·지급 시기)을
          조건 카드로 정리하고, 양측이 확인할 수 있게 도와드려요.
        </p>
      </div>

      {roomId ? (
        <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <p className="text-sm font-medium">방을 만들었어요. 각자 자기 링크로 들어가세요.</p>
          {ROLES.map((role) => (
            <div key={role.as} className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3">
              <p className="text-sm font-medium">{role.label}</p>
              <p className="break-all text-xs text-muted-foreground">{linkFor(role.as)}</p>
              <div className="flex flex-wrap gap-2">
                <a
                  href={`/rooms/${roomId}?as=${role.as}`}
                  target="_blank"
                  rel="noreferrer"
                  className={buttonVariants({ size: "sm" })}
                >
                  새 창으로 열기
                </a>
                <Button type="button" size="sm" variant="outline" onClick={() => void copy(role.as)}>
                  {copied === role.as ? "복사했어요" : "링크 복사"}
                </Button>
              </div>
            </div>
          ))}
          <p className="text-xs text-muted-foreground">시연할 때는 두 링크를 각각 새 창으로 열어 나란히 두면 돼요.</p>
        </section>
      ) : (
        <section className="flex flex-col gap-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="room-title">방 제목</Label>
            <Input
              id="room-title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.nativeEvent.isComposing) void createRoom();
              }}
              placeholder="카페 로고 디자인"
            />
          </div>
          <Button type="button" className="w-full sm:w-fit" disabled={loading} onClick={() => void createRoom()}>
            {loading ? "만드는 중" : "방 만들기"}
          </Button>
        </section>
      )}

      {error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}

      <Link href="/" className="text-sm text-muted-foreground underline-offset-2 hover:underline">
        첫 화면으로
      </Link>
    </main>
  );
}
