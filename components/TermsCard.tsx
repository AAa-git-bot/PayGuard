"use client";

import type { Terms } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { AiBadge } from "@/components/AiBadge";

export type RoomRole = "freelancer" | "client";
export type TermKey = "scope" | "revisionsIncluded" | "deadline" | "price" | "paymentTerms";

export const TERM_ROWS: { key: TermKey; label: string }[] = [
  { key: "scope", label: "작업 범위" },
  { key: "revisionsIncluded", label: "포함 수정 횟수" },
  { key: "deadline", label: "납기" },
  { key: "price", label: "금액" },
  { key: "paymentTerms", label: "지급 조건" },
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

export function TermsTable({
  terms,
  changed = [],
}: {
  terms: Partial<Terms> | null | undefined;
  changed?: string[];
}) {
  return (
    <dl className="flex flex-col gap-1.5">
      {TERM_ROWS.map((row) => {
        const isChanged = changed.includes(row.key);
        const empty = terms?.[row.key] == null || terms?.[row.key] === "";
        return (
          <div
            key={row.key}
            className={`flex flex-wrap items-start justify-between gap-x-3 gap-y-1 rounded-lg px-2.5 py-1.5 text-sm ${
              isChanged ? "bg-yellow-50 ring-2 ring-yellow-400" : "bg-muted/50"
            }`}
          >
            <dt className="flex items-center gap-1.5 text-muted-foreground">
              {row.label}
              {isChanged ? <Badge className="bg-yellow-200 text-yellow-950">새로 바뀜</Badge> : null}
            </dt>
            <dd className={`text-right font-medium ${empty ? "text-muted-foreground" : ""}`}>
              {termValue(terms, row.key)}
            </dd>
          </div>
        );
      })}
    </dl>
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

  return (
    <div className={`flex w-full flex-col gap-3 rounded-xl bg-card p-3 ring-1 ${done ? "ring-emerald-400" : "ring-foreground/10"}`}>
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-semibold">조건 카드 v{terms.version}</p>
        <AiBadge />
      </div>
      <TermsTable terms={terms} changed={changed} />
      {done ? (
        <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm font-medium text-emerald-900">양측 확인 완료 ✓</p>
      ) : (
        <div className="flex flex-col gap-2">
          <div className="flex flex-wrap gap-2">
            {(["freelancer", "client"] as const).map((who) => {
              const confirmed = who === "freelancer" ? terms.confirmedByFreelancer : terms.confirmedByClient;
              const label = who === "freelancer" ? "프리랜서" : "의뢰인";
              return (
                <Button
                  key={who}
                  type="button"
                  size="sm"
                  variant={confirmed ? "secondary" : who === role ? "default" : "outline"}
                  disabled={who !== role || confirmed || !latest || pending}
                  onClick={onConfirm}
                >
                  {confirmed ? `${label} 확인 ✓` : pending && who === role ? "확인하는 중" : `${label} 확인`}
                </Button>
              );
            })}
          </div>
          <p className="text-xs text-muted-foreground">
            {!latest
              ? "더 새로운 조건 카드가 있어요. 최신 카드에서 확인해 주세요."
              : mine
                ? "상대방의 확인을 기다리고 있어요."
                : "내용이 맞으면 내 역할의 확인 버튼을 눌러 주세요."}
          </p>
        </div>
      )}
    </div>
  );
}
