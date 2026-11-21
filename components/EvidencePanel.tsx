"use client";

import { useState } from "react";
import type { EvidenceRequest } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiBadge } from "@/components/AiBadge";
import { toUploadFile, type UploadFile } from "@/components/file-payload";

const BLOCK_LABEL = {
  settlement: "정산표",
  issue: "쟁점",
} as const;

export function EvidencePanel({
  caseId,
  requests,
  changedIds,
  sampleExtra,
}: {
  caseId: string;
  requests: EvidenceRequest[];
  changedIds: Set<string>;
  sampleExtra?: string;
}) {
  const [message, setMessage] = useState<string | null>(null);
  const [pendingId, setPendingId] = useState<string | null>(null);

  async function addSource(requestId: string | null, files: UploadFile[]) {
    if (files.length === 0) return;
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
      const analyze = await fetch(`/api/cases/${caseId}/analyze`, { method: "POST" });
      const analyzeBody = (await analyze.json().catch(() => ({}))) as { error?: string };
      if (!analyze.ok) {
        setMessage(analyzeBody.error ?? "자료는 올렸지만 다시 분석하지 못했어요. 다시 분석하기를 눌러주세요.");
        return;
      }
      setMessage("자료를 추가하고 다시 분석했어요.");
    } catch {
      setMessage("서버에 연결하지 못했어요. 화면은 그대로 둘게요.");
    } finally {
      setPendingId(null);
    }
  }

  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">증거 요청</h2>
        <AiBadge />
      </div>
      {sampleExtra ? (
        <div className="flex flex-col gap-2 rounded-xl bg-muted/60 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <p>샘플 사건의 추가 대화(6/2 수정 횟수·추가 단가 합의)를 한 번에 넣어 볼 수 있어요.</p>
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
        {requests.map((request) => {
          const changed = changedIds.has(request.id);
          const busy = pendingId === request.id;
          return (
            <Card key={request.id} className={changed ? "ring-2 ring-yellow-400" : ""}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2 text-sm leading-6">
                  {request.question}
                  {changed ? <Badge className="bg-yellow-200 text-yellow-950">새로 바뀜</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p className="text-sm leading-6">{request.why}</p>
                <div className="flex flex-wrap gap-1.5">
                  <span className="text-sm text-muted-foreground">결론 보류:</span>
                  {request.blocks.map((block) => (
                    <Badge key={block} variant="outline">
                      {BLOCK_LABEL[block]}
                    </Badge>
                  ))}
                </div>
                <label
                  className={`inline-flex h-8 w-fit cursor-pointer items-center rounded-lg bg-primary px-2.5 text-sm font-medium text-primary-foreground focus-within:ring-2 focus-within:ring-ring ${
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
                      void addSource(request.id, await Promise.all(files.map(toUploadFile)));
                    }}
                  />
                  {busy ? "올리는 중" : "자료 추가"}
                </label>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
