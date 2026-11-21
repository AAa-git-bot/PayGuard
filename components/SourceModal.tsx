"use client";

import type { SourceRef } from "@/lib/types";
import type { SourceLine } from "@/components/case-view";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { sourceChip } from "@/components/labels";

function formatSentAt(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleString("ko-KR", {
    timeZone: "Asia/Seoul",
    month: "numeric",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

export function SourceModal({
  source,
  lines,
  onClose,
}: {
  source: SourceRef | null;
  lines: SourceLine[];
  onClose: () => void;
}) {
  // 같은 자료(sourceId)에서 해당 seq 앞뒤 2개까지
  const sameSource = source ? lines.filter((line) => line.sourceId === source.sourceId) : [];
  const windowLines = source
    ? sameSource.filter((line) => line.seq >= source.seqFrom - 2 && line.seq <= source.seqTo + 2)
    : [];

  return (
    <Dialog open={source != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {source ? (sameSource.length > 0 ? sourceChip(source.seqFrom, source.seqTo) : "이미지 자료") : "원문"}
          </DialogTitle>
          <DialogDescription>해당 줄과 앞뒤 메시지를 보여 드려요.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {windowLines.map((line) => {
            const hit = source != null && line.seq >= source.seqFrom && line.seq <= source.seqTo;
            return (
              <li
                key={`${line.sourceId}-${line.seq}`}
                className={`rounded-lg px-3 py-2 text-sm ${hit ? "bg-yellow-100" : "bg-muted"}`}
              >
                <p className="text-xs text-muted-foreground">
                  #{line.seq} {line.sender}
                  {line.sentAt ? ` · ${formatSentAt(line.sentAt)}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{line.text}</p>
              </li>
            );
          })}
          {source && windowLines.length === 0 ? (
            <li className="rounded-lg bg-muted px-3 py-2 text-sm">
              <p className="text-xs text-muted-foreground">
                대화 원문이 없는 자료(이체 내역·영수증 이미지 등)라 AI가 읽은 내용만 보여 드려요.
              </p>
              <p className="mt-1">{source.quote}</p>
            </li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
