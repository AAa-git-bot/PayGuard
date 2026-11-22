"use client";

import type { CaseEvent, SettlementLine } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { AiBadge } from "@/components/AiBadge";
import { monthDay, won } from "@/components/labels";

const STATUS_LABEL = {
  confirmed: "확인됨",
  pending: "보류",
  unverifiable: "확인 불가",
} as const;

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
        <h2 className="text-base font-semibold">정산표</h2>
        <AiBadge />
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>항목</TableHead>
            <TableHead>금액</TableHead>
            <TableHead>계산식</TableHead>
            <TableHead>상태</TableHead>
            <TableHead>근거</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {lines.map((line) => {
            // lib/diff.ts는 정산 줄을 "settlement:<key>"로 표시한다
            const changed = changedIds.has(`settlement:${line.key}`) || changedIds.has(line.key);
            const unverifiable = line.status === "unverifiable";
            return (
              <TableRow
                key={line.key}
                className={`${unverifiable ? "text-muted-foreground" : ""} ${
                  changed ? "bg-yellow-50 ring-2 ring-yellow-400 ring-inset" : ""
                }`}
              >
                <TableCell className="font-medium whitespace-nowrap">
                  {line.label}
                  {changed ? (
                    <Badge className="ml-1 bg-yellow-200 text-yellow-950">새로 바뀜</Badge>
                  ) : null}
                </TableCell>
                <TableCell className="whitespace-nowrap">
                  {line.status === "pending" ? (
                    <button
                      type="button"
                      className="text-left font-medium text-foreground underline-offset-2 hover:underline"
                      onClick={onGoToEvidence}
                    >
                      결론 보류
                    </button>
                  ) : unverifiable ? (
                    "확인 불가"
                  ) : (
                    (won(line.amount) ?? "확인 불가")
                  )}
                </TableCell>
                <TableCell className="min-w-40 whitespace-normal">{line.formula}</TableCell>
                <TableCell>{STATUS_LABEL[line.status]}</TableCell>
                <TableCell className="min-w-56 whitespace-normal">
                  {line.note ? <p>{line.note}</p> : null}
                  <ul className="mt-1 flex flex-col gap-0.5 text-xs text-muted-foreground">
                    {line.eventIds.map((eventId) => {
                      const event = events.find((item) => item.id === eventId);
                      if (!event) return null;
                      return (
                        <li key={eventId}>
                          {monthDay(event.eventDate ?? event.sentAt) ?? "날짜 없음"} · {event.what}
                        </li>
                      );
                    })}
                  </ul>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>
    </section>
  );
}
