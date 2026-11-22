"use client";

import { CircleHelp, ListChecks, Scale } from "lucide-react";
import type { CaseEvent, Issue } from "@/lib/types";
import { AiBadge } from "@/components/AiBadge";
import { Cited } from "@/components/Cited";
import { PILL, sourceChip } from "@/components/labels";

// 근거 항목은 사건 id(샘플 데이터)이거나 문장(파이프라인 결과)이다 → 화면용 문장으로
function supportText(item: string, events: CaseEvent[]): string {
  const event = events.find((e) => e.id === item);
  if (!event) return item;
  const seqs = event.sources.filter((s) => s.seqFrom > 0).map((s) => sourceChip(s.seqFrom, s.seqTo).replace(/^(카톡|채팅) /, ""));
  return seqs.length ? `${event.what} (${seqs.join(", ")})` : event.what;
}

function SupportList({
  title,
  items,
  events,
  tone,
  onOpenSeq,
}: {
  title: string;
  items: string[];
  events: CaseEvent[];
  tone: "me" | "other";
  onOpenSeq?: (from: number, to: number) => void;
}) {
  return (
    <div className={`rounded-xl p-3 ${tone === "me" ? "bg-secondary/60" : "bg-muted"}`}>
      <p className={`text-xs font-semibold ${tone === "me" ? "text-secondary-foreground" : "text-slate-600"}`}>{title}</p>
      {items.length ? (
        <ul className="mt-1.5 flex flex-col gap-1.5 text-sm leading-6">
          {items.map((item) => (
            <li key={item} className="flex gap-1.5">
              <span className="mt-2.5 size-1 shrink-0 rounded-full bg-current opacity-50" aria-hidden />
              <span>
                <Cited text={supportText(item, events)} onOpenSeq={onOpenSeq} />
              </span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="mt-1.5 text-sm text-muted-foreground">이 자료에는 없어요.</p>
      )}
    </div>
  );
}

export function IssueCard({
  issues,
  events,
  changedIds,
  onOpenSeq,
}: {
  issues: Issue[];
  events: CaseEvent[];
  changedIds: Set<string>;
  onOpenSeq?: (from: number, to: number) => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">쟁점</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">다툼이 생길 수 있는 지점을 양쪽 입장과 근거로 나눠 정리했어요. #번호를 누르면 원문을 볼 수 있어요.</p>
        </div>
        <AiBadge />
      </div>
      <div className="flex flex-col gap-3">
        {issues.map((issue, index) => {
          const changed = changedIds.has(issue.id);
          return (
            <article
              key={issue.id}
              className={`rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-5 ${changed ? "ring-2 ring-yellow-400" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className={`${PILL} bg-primary text-primary-foreground ring-primary`}>쟁점 {index + 1}</span>
                {changed ? <span className={`${PILL} bg-yellow-200 text-yellow-950 ring-yellow-500/30`}>새로 바뀜</span> : null}
              </div>
              <h3 className="mt-2 text-lg font-semibold leading-snug">{issue.title}</h3>

              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <div className="rounded-xl border-l-4 border-brand bg-secondary/50 p-3">
                  <p className="text-xs font-semibold text-secondary-foreground">내 주장</p>
                  <p className="mt-1 text-sm leading-6">
                    <Cited text={issue.myClaim} onOpenSeq={onOpenSeq} />
                  </p>
                </div>
                <div className="rounded-xl border-l-4 border-slate-400 bg-muted p-3">
                  <p className="text-xs font-semibold text-slate-600">상대방 주장</p>
                  <p className="mt-1 text-sm leading-6">
                    <Cited text={issue.otherClaim} onOpenSeq={onOpenSeq} />
                  </p>
                </div>
              </div>

              {issue.facts.length ? (
                <div className="mt-4">
                  <p className="flex items-center gap-1.5 text-sm font-semibold">
                    <ListChecks className="size-4 text-emerald-600" aria-hidden />
                    확인된 사실
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1.5 text-sm leading-6">
                    {issue.facts.map((fact) => (
                      <li key={fact} className="flex gap-2">
                        <span className="mt-2.5 size-1.5 shrink-0 rounded-full bg-emerald-500" aria-hidden />
                        <span>
                          <Cited text={fact} onOpenSeq={onOpenSeq} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <div className="mt-4 grid gap-2.5 sm:grid-cols-2">
                <SupportList title="내 주장을 뒷받침하는 근거" items={issue.supportsMe} events={events} tone="me" onOpenSeq={onOpenSeq} />
                <SupportList title="상대방 주장을 뒷받침하는 근거" items={issue.supportsOther} events={events} tone="other" onOpenSeq={onOpenSeq} />
              </div>

              {issue.toCheck.length ? (
                <div className="mt-4 rounded-xl bg-amber-50 p-3 ring-1 ring-amber-600/15">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-amber-900">
                    <CircleHelp className="size-4" aria-hidden />
                    추가로 확인할 것
                  </p>
                  <ul className="mt-1.5 flex flex-col gap-1 text-sm leading-6 text-amber-950">
                    {issue.toCheck.map((item) => (
                      <li key={item} className="flex gap-2">
                        <span className="mt-2.5 size-1 shrink-0 rounded-full bg-amber-600" aria-hidden />
                        <span>
                          <Cited text={item} onOpenSeq={onOpenSeq} />
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              <p className="mt-4 flex items-center gap-1.5 border-t pt-3 text-xs text-muted-foreground">
                <Scale className="size-3.5" aria-hidden />
                PayGuard는 책임 비율을 판단하지 않아요. 아래 근거를 상담에 활용하세요.
              </p>
            </article>
          );
        })}
      </div>
    </section>
  );
}
