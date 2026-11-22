"use client";

// 담당: 최서은 | PRD ⑨ 예방 모드 방 만들기
import { useState } from "react";
import Link from "next/link";
import {
  ArrowLeft,
  Check,
  CircleHelp,
  Copy,
  ExternalLink,
  FileCheck2,
  LoaderCircle,
  MessagesSquare,
  Sparkles,
  TriangleAlert,
  UserRound,
} from "lucide-react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

const ROLES = [
  { as: "freelancer", label: "프리랜서", desc: "작업을 맡은 사람 (보통 나)", avatar: "프", tone: "bg-brand text-white" },
  { as: "client", label: "의뢰인", desc: "작업을 맡긴 사람", avatar: "의", tone: "bg-slate-600 text-white" },
] as const;

const FEATURES = [
  {
    icon: FileCheck2,
    title: "조건 카드",
    text: "대화에서 금액·수정 횟수·납기·지급 조건이 나오면 AI가 카드로 정리하고, 양측이 확인 버튼으로 확정해요.",
  },
  {
    icon: TriangleAlert,
    title: "변경 알림",
    text: "확정한 조건과 다른 요청(예: 합의한 2회를 넘는 수정)이 오면 추가 비용을 정할지 물어봐요.",
  },
  {
    icon: CircleHelp,
    title: "확인 질문",
    text: "\"다음 주쯤\", \"대충\" 같은 모호한 표현에는 날짜·범위를 정해 두자고 제안해요.",
  },
];

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
      setTimeout(() => setCopied(null), 2000);
    } catch {
      setCopied(null);
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div>
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          첫 화면
        </Link>
        <span className="mt-3 block w-fit rounded-full bg-secondary px-3 py-1 text-xs font-medium text-secondary-foreground">
          예방 모드
        </span>
        <h1 className="mt-2 text-2xl font-bold tracking-tight sm:text-3xl">AI 채팅방 만들기</h1>
        <p className="mt-2 max-w-2xl text-sm leading-6 text-muted-foreground sm:text-base">
          프리랜서와 의뢰인이 함께 쓰는 채팅방이에요. 분쟁이 생기기 전에, 대화 속 계약 조건을 AI가 기록하고 양측이 확인하게 도와드려요.
        </p>
      </div>

      {roomId ? (
        <section className="flex flex-col gap-4">
          <div className="flex items-center gap-3 rounded-2xl bg-emerald-50 px-4 py-3 text-emerald-900 ring-1 ring-emerald-600/15">
            <span className="flex size-8 items-center justify-center rounded-full bg-emerald-600 text-white">
              <Check className="size-4" aria-hidden />
            </span>
            <div>
              <p className="font-semibold">‘{title.trim()}’ 채팅방을 만들었어요</p>
              <p className="text-sm text-emerald-800/80">각자 자기 역할의 링크로 들어가면 같은 대화를 실시간으로 봐요.</p>
            </div>
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            {ROLES.map((role) => (
              <article key={role.as} className="flex flex-col gap-3 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
                <div className="flex items-center gap-3">
                  <span className={`flex size-10 items-center justify-center rounded-full text-sm font-semibold ${role.tone}`}>
                    {role.avatar}
                  </span>
                  <div>
                    <p className="font-semibold">{role.label}용 링크</p>
                    <p className="text-xs text-muted-foreground">{role.desc}</p>
                  </div>
                </div>
                <p className="truncate rounded-lg bg-muted/60 px-3 py-2 font-mono text-xs text-muted-foreground">{linkFor(role.as)}</p>
                <div className="grid grid-cols-2 gap-2">
                  <Button type="button" variant="outline" onClick={() => void copy(role.as)}>
                    {copied === role.as ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
                    {copied === role.as ? "복사했어요" : "링크 복사"}
                  </Button>
                  <a href={`/rooms/${roomId}?as=${role.as}`} target="_blank" rel="noreferrer" className={buttonVariants()}>
                    <ExternalLink className="size-4" aria-hidden />
                    입장하기
                  </a>
                </div>
              </article>
            ))}
          </div>
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Sparkles className="size-3.5 text-brand" aria-hidden />
            시연할 때는 두 링크를 각각 새 창으로 열어 나란히 두면 돼요.
          </p>
        </section>
      ) : (
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
          <ul className="flex flex-col gap-3">
            {FEATURES.map(({ icon: Icon, title: featureTitle, text }) => (
              <li key={featureTitle} className="flex gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
                <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-brand">
                  <Icon className="size-5" aria-hidden />
                </span>
                <div>
                  <p className="font-semibold">{featureTitle}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{text}</p>
                </div>
              </li>
            ))}
          </ul>

          <section className="flex flex-col gap-4 rounded-2xl bg-card p-5 ring-1 ring-foreground/10 lg:sticky lg:top-20 lg:self-start">
            <div className="flex items-center gap-3">
              <span className="flex size-10 items-center justify-center rounded-xl bg-primary text-primary-foreground">
                <MessagesSquare className="size-5" aria-hidden />
              </span>
              <div>
                <h2 className="font-semibold">새 채팅방</h2>
                <p className="text-xs text-muted-foreground">로그인 없이 링크만으로 입장해요</p>
              </div>
            </div>
            <label className="flex flex-col gap-1.5 text-sm font-medium" htmlFor="room-title">
              방 제목
              <Input
                id="room-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.nativeEvent.isComposing) void createRoom();
                }}
                placeholder="예: 카페 로고 디자인"
                className="h-11 font-normal"
              />
            </label>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <UserRound className="size-3.5" aria-hidden />
              만들고 나면 프리랜서용·의뢰인용 링크 2개가 생겨요.
            </div>
            {error ? (
              <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {error}
              </p>
            ) : null}
            <Button type="button" size="lg" className="h-11 w-full" disabled={loading} onClick={() => void createRoom()}>
              {loading ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {loading ? "만드는 중" : "채팅방 만들기"}
            </Button>
          </section>
        </div>
      )}
    </main>
  );
}
