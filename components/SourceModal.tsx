"use client";

import type { SourceRef } from "@/lib/types";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { readKakao } from "@/components/read-kakao";
import { sourceChip } from "@/components/labels";

export function SourceModal({
  source,
  transcript,
  onClose,
}: {
  source: SourceRef | null;
  transcript: string;
  onClose: () => void;
}) {
  const { lines } = readKakao(transcript);
  const windowLines = source
    ? lines.filter(
        (line) => line.seq >= source.seqFrom - 2 && line.seq <= source.seqTo + 2,
      )
    : [];

  return (
    <Dialog open={source != null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-h-[80vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{source ? sourceChip(source.seqFrom, source.seqTo) : "원문"}</DialogTitle>
          <DialogDescription>해당 줄과 앞뒤 메시지를 보여 드려요.</DialogDescription>
        </DialogHeader>
        <ul className="flex flex-col gap-2">
          {windowLines.map((line) => {
            const hit = source != null && line.seq >= source.seqFrom && line.seq <= source.seqTo;
            return (
              <li
                key={line.seq}
                className={`rounded-lg px-3 py-2 text-sm ${hit ? "bg-yellow-100" : "bg-muted"}`}
              >
                <p className="text-xs text-muted-foreground">
                  #{line.seq} {line.sender}
                  {line.date ? ` · ${line.date}` : ""}
                  {line.time ? ` ${line.time}` : ""}
                </p>
                <p className="mt-1 whitespace-pre-wrap">{line.text}</p>
              </li>
            );
          })}
          {source && windowLines.length === 0 ? (
            <li className="rounded-lg bg-muted px-3 py-2 text-sm">{source.quote}</li>
          ) : null}
        </ul>
      </DialogContent>
    </Dialog>
  );
}
