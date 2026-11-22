"use client";

import { Clock, Image as ImageIcon } from "lucide-react";
import type { CaseEvent, SourceRef } from "@/lib/types";
import { AiBadge } from "@/components/AiBadge";
import {
  CERTAINTY_LABEL,
  CERTAINTY_STYLE,
  EVENT_LABEL,
  PARTY_LABEL,
  PILL,
  dayHeading,
  isImageSource,
  kstDayKey,
  kstMonthDay,
  kstTime,
  sourceLabel,
  won,
} from "@/components/labels";

const WHO_DOT: Record<string, string> = {
  me: "bg-brand",
  counterparty: "bg-slate-500",
  ai: "bg-violet-500",
  unknown: "bg-slate-300",
};
const WHO_TEXT: Record<string, string> = {
  me: "text-brand-strong",
  counterparty: "text-slate-600",
  ai: "text-violet-600",
  unknown: "text-muted-foreground",
};

export function Timeline({
  events,
  changedIds,
  textSourceIds,
  onOpenSource,
}: {
  events: CaseEvent[];
  changedIds: Set<string>;
  textSourceIds: Set<string>; // 원문 메시지가 있는 자료(카톡·텍스트). 없으면 이체 내역 등 이미지 자료
  onOpenSource: (source: SourceRef) => void;
}) {
  // 사건일(없으면 보낸 날) 기준으로 날짜별로 묶고, 같은 날은 보낸 시각 순
  const dayOf = (e: CaseEvent) => kstDayKey(e.eventDate) ?? kstDayKey(e.sentAt) ?? "날짜 없음";
  const ordered = [...events].sort((a, b) => `${dayOf(a)}|${a.sentAt ?? ""}`.localeCompare(`${dayOf(b)}|${b.sentAt ?? ""}`));
  const groups: { day: string; items: CaseEvent[] }[] = [];
  for (const event of ordered) {
    const day = dayOf(event);
    if (groups.at(-1)?.day === day) groups.at(-1)!.items.push(event);
    else groups.push({ day, items: [event] });
  }

  return (
    <section className="flex flex-col gap-4">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">타임라인</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">
            사건 {events.length}개 ·{" "}
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-brand" /> 나
            </span>{" "}
            <span className="inline-flex items-center gap-1">
              <span className="size-2 rounded-full bg-slate-500" /> 상대방
            </span>
          </p>
        </div>
        <AiBadge />
      </div>

      {groups.map(({ day, items }) => (
        <div key={day}>
          <h3 className="sticky top-14 z-10 -mx-1 mb-2 bg-background/90 px-1 py-1 text-sm font-semibold backdrop-blur">
            {day === "날짜 없음" ? day : dayHeading(day)}
          </h3>
          <ol className="relative flex flex-col gap-2.5 border-l-2 border-border pl-5">
            {items.map((event) => {
              const time = kstTime(event.sentAt);
              const sentDay = kstDayKey(event.sentAt);
              const happened = kstDayKey(event.eventDate);
              const dateDiffers = sentDay && happened && sentDay !== happened;
              const unverified = event.certainty === "unverified";
              const changed = changedIds.has(event.id);
              const fromImage = event.sources.every((s) => isImageSource(s, textSourceIds));
              return (
                <li
                  key={event.id}
                  className={`relative rounded-xl p-3.5 ring-1 ${
                    unverified ? "bg-muted/60 text-muted-foreground ring-foreground/5" : "bg-card ring-foreground/10"
                  } ${changed ? "ring-2 ring-yellow-400" : ""}`}
                >
                  <span
                    className={`absolute top-4.5 -left-[27px] size-3 rounded-full ring-4 ring-background ${WHO_DOT[event.who]}`}
                    aria-hidden
                  />
                  <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="inline-flex items-center gap-1 text-xs tabular-nums text-muted-foreground">
                      {fromImage ? <ImageIcon className="size-3.5" aria-hidden /> : <Clock className="size-3.5" aria-hidden />}
                      {dateDiffers ? `${kstMonthDay(event.sentAt)} 보냄` : (time ?? (fromImage ? "이미지 자료" : "시각 없음"))}
                    </span>
                    <span className={`text-sm font-semibold ${WHO_TEXT[event.who]}`}>{PARTY_LABEL[event.who]}</span>
                    <span className={`${PILL} bg-secondary text-secondary-foreground ring-primary/10`}>{EVENT_LABEL[event.type]}</span>
                    <span className={`${PILL} ${CERTAINTY_STYLE[event.certainty]}`}>{CERTAINTY_LABEL[event.certainty]}</span>
                    {changed ? <span className={`${PILL} bg-yellow-200 text-yellow-950 ring-yellow-500/30`}>새로 바뀜</span> : null}
                  </div>
                  {dateDiffers ? (
                    <p className="mt-1.5 w-fit rounded-md bg-muted px-2 py-0.5 text-xs text-muted-foreground">
                      {kstMonthDay(event.sentAt)} {time}에 보낸 메시지 · 사건일 {kstMonthDay(event.eventDate)}
                    </p>
                  ) : null}
                  <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
                    <p className="text-sm leading-6">{event.what}</p>
                    {won(event.amount) ? (
                      <p className="text-base font-semibold tabular-nums">{won(event.amount)}</p>
                    ) : null}
                  </div>
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {event.sources.map((source) => (
                      <button
                        key={`${event.id}-${source.sourceId}-${source.seqFrom}-${source.seqTo}`}
                        type="button"
                        className="rounded-full bg-muted px-2.5 py-0.5 text-xs text-foreground/80 hover:bg-primary hover:text-primary-foreground"
                        onClick={() => onOpenSource(source)}
                      >
                        {sourceLabel(source, textSourceIds)} 원문
                      </button>
                    ))}
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      ))}
    </section>
  );
}
