"use client";

// 담당: 최서은 | PRD ⑬ 내용증명 초안 (생성만, 발송은 사용자가 직접)
import { useState } from "react";
import Link from "next/link";
import type { SettlementLine } from "@/lib/types";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { AiBadge } from "@/components/AiBadge";

const WATERMARK = "초안 — 발송 전 사실관계를 직접 확인하세요";
const NO_CONFIRMED_UNPAID = "먼저 증거 요청을 해결해 주세요";

function defaultDueDate() {
  const date = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);
  return date.toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" }); // YYYY-MM-DD
}

export function NoticeDraftPanel({
  caseId,
  live,
  settlement,
  onGoToEvidence,
}: {
  caseId: string;
  live: boolean;
  settlement: SettlementLine[];
  onGoToEvidence: () => void;
}) {
  const [dueDate, setDueDate] = useState(defaultDueDate);
  const [content, setContent] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  const unpaid = settlement.find((line) => line.key === "unpaid");
  const hasConfirmedUnpaid = unpaid?.status === "confirmed" && (unpaid.amount ?? 0) > 0;

  async function generate() {
    setMessage(null);
    if (!hasConfirmedUnpaid) {
      setMessage(NO_CONFIRMED_UNPAID);
      return;
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate)) {
      setMessage("지급 요청 기한을 날짜로 입력해 주세요.");
      return;
    }
    if (!live) {
      setMessage("DB 없이 보는 데모 화면이에요. 첫 화면의 '샘플 사건 분석'으로 시작하면 초안을 만들 수 있어요.");
      return;
    }
    setLoading(true);
    try {
      const response = await fetch(`/api/cases/${caseId}/documents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "notice_draft", dueDate }),
      });
      const body = (await response.json().catch(() => ({}))) as {
        error?: string;
        reason?: string;
        content?: string;
      };
      if (!response.ok || !body.content) {
        setMessage(body.error ?? body.reason ?? "초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setContent(body.content);
    } catch {
      setMessage("서버에 연결하지 못했어요.");
    } finally {
      setLoading(false);
    }
  }

  function download() {
    if (!content) return;
    const text = content.startsWith(WATERMARK) || content.includes(WATERMARK) ? content : `${WATERMARK}\n\n${content}`;
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "내용증명_초안.md";
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">내용증명 초안</h2>
        <AiBadge />
      </div>
      <p className="text-sm leading-6 text-muted-foreground">
        정산표에서 확인된 미지급액만 넣어 초안을 만들어요. PayGuard는 보내지 않아요. 내려받아 직접 확인한 뒤 사용하세요.
      </p>

      {hasConfirmedUnpaid ? (
        <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
          <div className="flex flex-col gap-1.5">
            <Label htmlFor="due-date">지급 요청 기한</Label>
            <Input id="due-date" type="date" value={dueDate} onChange={(event) => setDueDate(event.target.value)} className="w-full sm:w-44" />
          </div>
          <Button type="button" disabled={loading} onClick={() => void generate()}>
            {loading ? "만드는 중" : "내용증명 초안 만들기"}
          </Button>
        </div>
      ) : (
        <div className="flex flex-col gap-2 rounded-lg bg-muted/60 p-3 text-sm">
          <p>{NO_CONFIRMED_UNPAID}. 정산표에 확인된 미지급액이 있어야 초안을 만들 수 있어요.</p>
          <Button type="button" variant="outline" className="w-fit" onClick={onGoToEvidence}>
            증거 요청 보기
          </Button>
        </div>
      )}

      {message ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm" role="status">
          {message}
        </p>
      ) : null}

      {content ? (
        <div className="flex flex-col gap-2">
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm font-medium text-amber-950">{WATERMARK}</p>
          <pre className="max-h-[60vh] overflow-auto whitespace-pre-wrap rounded-lg bg-muted/60 p-3 font-sans text-sm leading-6">
            {content}
          </pre>
          <Button type="button" variant="outline" className="w-fit" onClick={download}>
            초안 내려받기 (.md)
          </Button>
        </div>
      ) : null}

      <Link href={`/cases/${caseId}/report`} className={buttonVariants({ variant: "ghost", className: "w-fit" })}>
        사건 정리 자료 보기 (인쇄/PDF)
      </Link>
    </section>
  );
}
