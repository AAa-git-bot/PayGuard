"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { ArrowRight, FileSearch, LoaderCircle, MessagesSquare, Upload, type LucideIcon } from "lucide-react";

function ActionBody({
  icon: Icon,
  title,
  description,
  tag,
  primary,
  loading,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  tag?: string;
  primary?: boolean;
  loading?: boolean;
}) {
  return (
    <>
      <div className="flex items-start justify-between gap-3">
        <span
          className={`flex size-11 items-center justify-center rounded-xl ${
            primary ? "bg-white/15 text-white" : "bg-secondary text-secondary-foreground"
          }`}
        >
          {loading ? <LoaderCircle className="size-5 animate-spin" aria-hidden /> : <Icon className="size-5" aria-hidden />}
        </span>
        {tag ? (
          <span
            className={`rounded-full px-2 py-0.5 text-xs font-medium ${
              primary ? "bg-white/15 text-white" : "bg-muted text-muted-foreground"
            }`}
          >
            {tag}
          </span>
        ) : null}
      </div>
      <div className="mt-5 flex items-center gap-1.5 text-lg font-semibold">
        {title}
        <ArrowRight className="size-4 transition-transform group-hover:translate-x-0.5" aria-hidden />
      </div>
      <p className={`mt-1.5 text-sm leading-6 ${primary ? "text-white/80" : "text-muted-foreground"}`}>{description}</p>
    </>
  );
}

const CARD =
  "group flex h-full flex-col rounded-2xl p-5 text-left ring-1 transition-all hover:-translate-y-0.5 hover:shadow-lg focus-visible:outline-none focus-visible:ring-3 disabled:pointer-events-none";

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
        setLoading(false);
        return;
      }
      router.push(`/cases/${body.id}`);
    } catch {
      setError("서버에 연결하지 못했어요.");
      setLoading(false);
    }
  }

  return (
    <div className="flex w-full flex-col gap-3">
      <div className="grid w-full gap-3 sm:grid-cols-3">
        <button
          type="button"
          className={`${CARD} bg-primary text-primary-foreground ring-primary`}
          disabled={loading}
          onClick={() => void openSample()}
        >
          <ActionBody
            icon={FileSearch}
            title={loading ? "샘플을 준비하는 중" : "샘플 사건 분석"}
            description="로고 외주 잔금 분쟁 예시로 타임라인·정산표·쟁점 정리를 바로 확인해요."
            tag="3초 체험"
            primary
            loading={loading}
          />
        </button>
        <Link href="/cases/new" className={`${CARD} bg-card ring-foreground/10`}>
          <ActionBody
            icon={Upload}
            title="사건 업로드 & 분석"
            description="채팅 대화 내보내기 파일과 이체 내역 이미지를 올리면 AI가 증거를 정리해요."
          />
        </Link>
        <Link href="/rooms/new" className={`${CARD} bg-card ring-foreground/10`}>
          <ActionBody
            icon={MessagesSquare}
            title="AI 채팅방 입장"
            description="의뢰인과 대화하면 AI가 금액·수정 횟수·납기를 조건 카드로 정리하고 양측이 확인해요."
            tag="예방 모드"
          />
        </Link>
      </div>
      {error ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
