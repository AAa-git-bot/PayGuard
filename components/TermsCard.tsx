"use client";

import { Check, Clock, FileCheck2, Sparkles } from "lucide-react";
import type { Terms } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { PILL } from "@/components/labels";

export type RoomRole = "freelancer" | "client";
export type TermKey = "scope" | "revisionsIncluded" | "deadline" | "price" | "paymentTerms";

export const TERM_ROWS: { key: TermKey; label: string }[] = [
  { key: "scope", label: "작업 범위" },
  { key: "price", label: "금액" },
  { key: "paymentTerms", label: "지급 조건" },
  { key: "revisionsIncluded", label: "포함 수정 횟수" },
  { key: "deadline", label: "납기" },
];

export function termValue(terms: Partial<Terms> | null | undefined, key: TermKey): string {
  const value = terms?.[key];
  if (value == null || value === "") return "아직 정하지 않았어요";
  if (key === "price" && typeof value === "number") return `${value.toLocaleString("ko-KR")}원`;
  if (key === "revisionsIncluded" && typeof value === "number") return `${value}회`;
  if (key === "deadline" && typeof value === "string") {
    const [y, m, d] = value.slice(0, 10).split("-");
    return y && m && d ? `${Number(y)}년 ${Number(m)}월 ${Number(d)}일` : value;
  }
  return String(value);
}

export function filledCount(terms: Partial<Terms> | null | undefined) {
  return TERM_ROWS.filter((row) => terms?.[row.key] != null && terms?.[row.key] !== "").length;
}

export function TermsTable({
  terms,
  changed = [],
}: {
  terms: Partial<Terms> | null | undefined;
  changed?: string[];
}) {
  return (
    <dl className="flex flex-col divide-y divide-border/70">
      {TERM_ROWS.map((row) => {
        const isChanged = changed.includes(row.key);
        const empty = terms?.[row.key] == null || terms?.[row.key] === "";
        return (
          <div
            key={row.key}
            className={`flex items-start justify-between gap-3 px-1 py-2 text-sm ${isChanged ? "-mx-1 rounded-md bg-yellow-50 px-2" : ""}`}
          >
            <dt className="flex shrink-0 items-center gap-1.5 text-muted-foreground">
              {row.label}
              {isChanged ? <span className={`${PILL} bg-yellow-200 text-yellow-950 ring-yellow-500/30`}>바뀜</span> : null}
            </dt>
            <dd className={`text-right font-medium ${empty ? "font-normal text-muted-foreground/70" : ""}`}>
              {termValue(terms, row.key)}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

function ConfirmState({ label, done }: { label: string; done: boolean }) {
  return (
    <span
      className={`${PILL} ${
        done ? "bg-emerald-50 text-emerald-700 ring-emerald-600/20" : "bg-muted text-muted-foreground ring-foreground/10"
      }`}
    >
      {done ? <Check className="size-3" aria-hidden /> : <Clock className="size-3" aria-hidden />}
      {label} {done ? "확인" : "대기"}
    </span>
  );
}

export function TermsCard({
  terms,
  changed,
  role,
  latest,
  pending,
  onConfirm,
}: {
  terms: Terms;
  changed: string[];
  role: RoomRole;
  latest: boolean; // 가장 최근 조건 카드일 때만 확인 가능
  pending: boolean;
  onConfirm: () => void;
}) {
  const done = terms.confirmedByFreelancer && terms.confirmedByClient;
  const mine = role === "freelancer" ? terms.confirmedByFreelancer : terms.confirmedByClient;
  const myLabel = role === "freelancer" ? "프리랜서" : "의뢰인";

  return (
    <div
      className={`w-full overflow-hidden rounded-2xl bg-card ring-1 ${
        done ? "ring-emerald-300" : latest ? "ring-brand/40" : "ring-foreground/10 opacity-80"
      }`}
    >
      <div className={`flex items-center justify-between gap-2 px-4 py-2.5 ${done ? "bg-emerald-50" : "bg-secondary"}`}>
        <p className={`flex items-center gap-1.5 text-sm font-semibold ${done ? "text-emerald-800" : "text-secondary-foreground"}`}>
          {done ? <FileCheck2 className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
          조건 카드 v{terms.version}
        </p>
        <span className="text-[11px] text-muted-foreground">AI가 생성한 결과예요</span>
      </div>
      <div className="px-4 py-2">
        <TermsTable terms={terms} changed={changed} />
      </div>
      <div className="flex flex-col gap-2 border-t px-4 py-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <ConfirmState label="프리랜서" done={terms.confirmedByFreelancer} />
          <ConfirmState label="의뢰인" done={terms.confirmedByClient} />
        </div>
        {done ? (
          <p className="text-sm font-medium text-emerald-700">양측 확인 완료 ✓ 확정된 조건으로 저장했어요.</p>
        ) : (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <p className="text-xs text-muted-foreground">
              {!latest
                ? "더 새로운 조건 카드가 있어요. 최신 카드에서 확인해 주세요."
                : mine
                  ? "상대방의 확인을 기다리고 있어요."
                  : "내용이 맞으면 확인을 눌러 주세요."}
            </p>
            {latest && !mine ? (
              <Button type="button" size="sm" disabled={pending} onClick={onConfirm}>
                <Check className="size-4" aria-hidden />
                {pending ? "확인하는 중" : `${myLabel}로 확인`}
              </Button>
            ) : null}
          </div>
        )}
      </div>
    </div>
  );
}
