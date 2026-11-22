"use client";

import type { CaseEvent, SourceRef } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { AiBadge } from "@/components/AiBadge";
import {
  CERTAINTY_LABEL,
  EVENT_LABEL,
  PARTY_LABEL,
  monthDay,
  sourceLabel,
  won,
} from "@/components/labels";

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
  const ordered = [...events].sort((a, b) => {
    const aKey = a.eventDate ?? a.sentAt ?? "";
    const bKey = b.eventDate ?? b.sentAt ?? "";
    return aKey.localeCompare(bKey);
  });

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">타임라인</h2>
        <AiBadge />
      </div>
      <ol className="flex flex-col gap-3 border-l border-border pl-4">
        {ordered.map((event) => {
          const sent = monthDay(event.sentAt);
          const happened = monthDay(event.eventDate);
          const dateDiffers = sent && happened && sent !== happened;
          const unverified = event.certainty === "unverified";
          const changed = changedIds.has(event.id);
          return (
            <li
              key={event.id}
              className={`rounded-xl p-3 ring-1 ring-foreground/10 ${
                unverified ? "bg-muted text-muted-foreground" : "bg-card"
              } ${changed ? "ring-2 ring-yellow-400" : ""}`}
            >
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="text-sm font-medium">
                  {dateDiffers
                    ? `${sent} 보낸 메시지 · 사건일 ${happened}`
                    : (happened ?? sent ?? "날짜 없음")}
                </span>
                <Badge variant="outline">{PARTY_LABEL[event.who]}</Badge>
                <Badge variant="outline">{EVENT_LABEL[event.type]}</Badge>
                <Badge variant={unverified ? "secondary" : "outline"}>
                  {CERTAINTY_LABEL[event.certainty]}
                </Badge>
                {changed ? (
                  <Badge className="bg-yellow-200 text-yellow-950">새로 바뀜</Badge>
                ) : null}
              </div>
              <p className="mt-2 text-sm leading-6">{event.what}</p>
              {won(event.amount) ? (
                <p className="mt-1 text-sm font-medium">{won(event.amount)}</p>
              ) : null}
              <div className="mt-2 flex flex-wrap gap-1.5">
                {event.sources.map((source) => (
                  <button
                    key={`${event.id}-${source.seqFrom}-${source.seqTo}`}
                    type="button"
                    className="rounded-full bg-muted px-2 py-0.5 text-xs text-foreground underline-offset-2 hover:underline"
                    onClick={() => onOpenSource(source)}
                  >
                    {sourceLabel(source, textSourceIds)}
                  </button>
                ))}
              </div>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
