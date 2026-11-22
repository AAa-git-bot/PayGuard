"use client";

import { ArrowRight, Calculator, CircleAlert, FileSearch } from "lucide-react";
import type { CaseEvent, SettlementLine } from "@/lib/types";
import { AiBadge } from "@/components/AiBadge";
import { PILL, STATUS_LABEL, STATUS_STYLE, kstMonthDay, kstTime, splitNote, won } from "@/components/labels";

export function SettlementTable({
  lines,
  events,
  changedIds,
  onGoToEvidence,
}: {
  lines: SettlementLine[];
  events: CaseEvent[];
  changedIds: Set<string>;
  onGoToEvidence: () => void;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">정산표</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">금액 계산은 AI가 아니라 코드가 해요. 근거가 부족한 줄은 결론을 보류해요.</p>
        </div>
        <AiBadge />
      </div>

      <ul className="flex flex-col gap-2.5">
        {lines.map((line, index) => {
          // lib/diff.ts는 정산 줄을 "settlement:<key>"로 표시한다
          const changed = changedIds.has(`settlement:${line.key}`) || changedIds.has(line.key);
          const { notes, needs } = splitNote(line.note);
          const amount =
            line.status === "pending" && line.amount == null
              ? "결론 보류"
              : line.status === "unverifiable" && line.amount == null
                ? "확인 불가"
                : (won(line.amount) ?? "확인 불가");
          const muted = line.amount == null;
          const evidence = line.eventIds
            .map((id) => events.find((event) => event.id === id))
            .filter((event): event is CaseEvent => Boolean(event));
          return (
            <li
              key={`${line.key}-${index}`}
              className={`rounded-xl bg-card p-4 ring-1 ring-foreground/10 ${changed ? "bg-yellow-50/60 ring-2 ring-yellow-400" : ""}`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="font-semibold">{line.label}</p>
                  <span className={`${PILL} ${STATUS_STYLE[line.status]}`}>{STATUS_LABEL[line.status]}</span>
                  {changed ? <span className={`${PILL} bg-yellow-200 text-yellow-950 ring-yellow-500/30`}>새로 바뀜</span> : null}
                </div>
                <p className={`text-xl font-bold tabular-nums ${muted ? "text-muted-foreground" : ""}`}>{amount}</p>
              </div>

              {line.formula && line.formula !== "확인 불가" ? (
                <p className="mt-2 inline-flex items-center gap-1.5 rounded-md bg-muted px-2 py-1 font-mono text-xs text-foreground/80">
                  <Calculator className="size-3.5" aria-hidden />
                  {line.formula}
                </p>
              ) : null}

              {notes.length ? (
                <ul className="mt-2 flex flex-col gap-1 text-sm leading-6 text-foreground/80">
                  {notes.map((note) => (
                    <li key={note} className="flex gap-1.5">
                      <CircleAlert className="mt-1 size-3.5 shrink-0 text-muted-foreground" aria-hidden />
                      {note}
                    </li>
                  ))}
                </ul>
              ) : null}

              {needs.length ? (
                <div className="mt-3 flex flex-col gap-1.5">
                  {needs.map((need) => (
                    <button
                      key={need}
                      type="button"
                      onClick={onGoToEvidence}
                      className="group flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-left text-sm text-amber-900 ring-1 ring-amber-600/15 hover:bg-amber-100"
                    >
                      <FileSearch className="mt-0.5 size-4 shrink-0" aria-hidden />
                      <span className="flex-1">
                        <span className="font-medium">필요한 자료 · </span>
                        {need}
                      </span>
                      <ArrowRight className="mt-0.5 size-4 shrink-0 transition-transform group-hover:translate-x-0.5" aria-hidden />
                    </button>
                  ))}
                </div>
              ) : null}

              {evidence.length ? (
                <details className="mt-3 text-sm">
                  <summary className="cursor-pointer text-xs font-medium text-muted-foreground hover:text-foreground">
                    근거 사건 {evidence.length}개 보기
                  </summary>
                  <ul className="mt-2 flex flex-col gap-1 border-l-2 pl-3 text-xs leading-5 text-muted-foreground">
                    {evidence.map((event) => (
                      <li key={event.id}>
                        <span className="font-medium text-foreground/80 tabular-nums">
                          {kstMonthDay(event.eventDate ?? event.sentAt) ?? "날짜 없음"}
                          {kstTime(event.sentAt) ? ` ${kstTime(event.sentAt)}` : ""}
                        </span>{" "}
                        · {event.what}
                      </li>
                    ))}
                  </ul>
                </details>
              ) : null}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
