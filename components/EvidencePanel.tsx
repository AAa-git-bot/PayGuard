"use client";

import { useState } from "react";
import type { EvidenceRequest } from "@/lib/types";
import { FileSearch, Sparkles, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { AiBadge } from "@/components/AiBadge";
import { PILL } from "@/components/labels";
import { toUploadFile, type UploadFile } from "@/components/file-payload";

const BLOCK_LABEL = {
  settlement: "정산표",
  issue: "쟁점",
} as const;

export function EvidencePanel({
  caseId,
  live,
  requests,
  changedIds,
  sampleExtra,
  onReanalyzed,
}: {
  caseId: string;
  live: boolean;
  requests: EvidenceRequest[];
  changedIds: Set<string>;
  sampleExtra?: string | null;
  onReanalyzed: () => void;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function addSource(requestId: string | null, files: UploadFile[]) {
    if (files.length === 0) return;
    if (!live) {
      setMessage("DB 없이 보는 데모 화면이에요. 첫 화면의 '샘플 사건 분석'으로 시작하면 자료를 추가할 수 있어요.");
      return;
    }
    setPendingId(requestId ?? "sample");
    setMessage(null);
    try {
      const sources = await fetch(`/api/cases/${caseId}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ requestId, files }),
      });
      const sourceBody = (await sources.json().catch(() => ({}))) as { error?: string };
      if (!sources.ok) {
        setMessage(sourceBody.error ?? "자료를 올리지 못했어요. 잠시 후 다시 시도해 주세요.");
        return;
      }
      setMessage("자료를 올렸어요. AI가 다시 분석하는 중이에요(1~2분 걸릴 수 있어요).");
      const analyze = await fetch(`/api/cases/${caseId}/analyze`, { method: "POST" });
      const analyzeBody = (await analyze.json().catch(() => ({}))) as { error?: string };
      if (!analyze.ok) {
        setMessage(analyzeBody.error ?? "자료는 올렸지만 다시 분석하지 못했어요. 다시 분석하기를 눌러주세요.");
        return;
      }
      setMessage("자료를 추가하고 다시 분석했어요. 바뀐 부분은 노란 테두리로 표시돼요.");
      onReanalyzed();
    } catch {
      setMessage("서버에 연결하지 못했어요. 화면은 그대로 둘게요.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h2 className="text-base font-semibold">증거 요청</h2>
          <p className="mt-0.5 text-xs text-muted-foreground">이 자료가 있으면 보류된 결론을 확정할 수 있어요. 자료를 추가하면 AI가 다시 분석해요.</p>
        </div>
        <AiBadge />
      </div>
      {sampleExtra ? (
        <div className="flex flex-col gap-2 rounded-xl bg-secondary/60 p-3.5 text-sm ring-1 ring-primary/10 sm:flex-row sm:items-center sm:justify-between">
          <p className="flex items-start gap-2">
            <Sparkles className="mt-0.5 size-4 shrink-0 text-primary" aria-hidden />
            샘플 사건의 추가 대화(6/2 수정 횟수·추가 단가 합의)를 한 번에 넣어 볼 수 있어요.
          </p>
          <Button
            type="button"
            variant="outline"
            className="w-full sm:w-auto"
            disabled={pendingId !== null}
            onClick={() =>
              void addSource(null, [{ name: "kakao_haeun_extra.txt", kind: "kakao", text: sampleExtra }])
            }
          >
            {pendingId === "sample" ? "넣는 중" : "샘플 추가 증거 넣기"}
          </Button>
        </div>
      ) : null}
      {message ? (
        <p className="rounded-lg bg-muted px-3 py-2 text-sm" role="status">
          {message}
        </p>
      ) : null}
      <div className="flex flex-col gap-3">
        {requests.length === 0 ? (
          <p className="rounded-xl bg-card p-4 text-sm text-muted-foreground ring-1 ring-foreground/10">
            지금 자료로 정리할 수 있는 건 모두 정리했어요. 요청할 추가 자료가 없어요.
          </p>
        ) : null}
        {requests.map((request, index) => {
          const changed = changedIds.has(request.id);
          const busy = pendingId === request.id;
          return (
            <article
              key={request.id}
              className={`rounded-2xl bg-card p-4 ring-1 ring-foreground/10 ${changed ? "ring-2 ring-yellow-400" : ""}`}
            >
              <div className="flex items-start gap-3">
                <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-amber-100 text-amber-800">
                  <FileSearch className="size-4" aria-hidden />
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-xs font-medium text-muted-foreground">요청 {index + 1}</span>
                    {request.blocks.map((block) => (
                      <span key={block} className={`${PILL} bg-amber-50 text-amber-800 ring-amber-600/20`}>
                        {BLOCK_LABEL[block]} 결론 보류
                      </span>
                    ))}
                    {changed ? <span className={`${PILL} bg-yellow-200 text-yellow-950 ring-yellow-500/30`}>새로 바뀜</span> : null}
                  </div>
                  <p className="mt-1.5 font-semibold leading-6">{request.question}</p>
                  <p className="mt-1 text-sm leading-6 text-muted-foreground">{request.why}</p>
                  <label
                    className={`mt-3 inline-flex h-9 w-fit cursor-pointer items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 focus-within:ring-2 focus-within:ring-ring ${
                      pendingId !== null ? "pointer-events-none opacity-50" : ""
                    }`}
                  >
                    <input
                      className="sr-only"
                      type="file"
                      multiple
                      accept=".txt,text/plain,image/*"
                      disabled={pendingId !== null}
                      onChange={async (event) => {
                        const files = [...(event.target.files ?? [])];
                        event.target.value = "";
                        if (files.some((file) => file.size > 3 * 1024 * 1024)) {
                          setMessage("이미지는 한 장에 3MB 이하로 올려 주세요.");
                          return;
                        }
                        void addSource(request.id, await Promise.all(files.map(toUploadFile)));
                      }}
                    />
                    <Upload className="size-4" aria-hidden />
                    {busy ? "올리는 중" : "자료 추가"}
                  </label>
                </div>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
