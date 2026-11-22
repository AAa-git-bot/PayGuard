"use client";

import { splitCitations } from "@/components/labels";

// 문장 속 "(#12)", "(#12~14)" 출처 표시를 눌러서 원문을 열 수 있는 칩으로 바꿔 보여 준다
export function Cited({ text, onOpenSeq }: { text: string; onOpenSeq?: (from: number, to: number) => void }) {
  const parts = splitCitations(text);
  return (
    <>
      {parts.map((part, i) =>
        "text" in part ? (
          <span key={i}>{part.text} </span>
        ) : (
          <button
            key={i}
            type="button"
            disabled={!onOpenSeq}
            onClick={() => onOpenSeq?.(part.from, part.to)}
            className="mr-1 inline-flex items-center rounded-md bg-secondary px-1.5 py-0.5 align-baseline text-[11px] font-medium text-secondary-foreground hover:bg-primary hover:text-primary-foreground disabled:pointer-events-none"
          >
            {part.from === part.to ? `#${part.from}` : `#${part.from}~${part.to}`}
          </button>
        ),
      )}
    </>
  );
}
