"use client";

import { useState } from "react";
import type { Analysis, SourceRef } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import Link from "next/link";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiBadge } from "@/components/AiBadge";
import { EvidencePanel } from "@/components/EvidencePanel";
import { IssueCard } from "@/components/IssueCard";
import { SettlementTable } from "@/components/SettlementTable";
import { SourceModal } from "@/components/SourceModal";
import { Timeline } from "@/components/Timeline";

export function CaseResult({
  id,
  analysis,
  transcript,
  maskedCount,
  sampleExtra,
}: {
  id: string;
  analysis: Analysis;
  transcript: string;
  maskedCount: number;
  sampleExtra?: string;
}) {
  const [tab, setTab] = useState("timeline");
  const [source, setSource] = useState<SourceRef | null>(null);
  const [reanalyzeNote, setReanalyzeNote] = useState<string | null>(null);
  const changedIds = new Set(analysis.changedFromPrev);

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
      <header className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">분석 v{analysis.version}</p>
            <h1 className="mt-1 text-xl font-semibold leading-snug">로고 디자인 외주 잔금</h1>
          </div>
          <AiBadge />
        </div>
        <p className="text-sm leading-6">{analysis.summary}</p>
        {analysis.oneSided ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            한쪽이 제출한 자료만으로 분석했어요. 통화·삭제된 메시지·오프라인 합의는 반영되지 않았어요.
          </p>
        ) : null}
        {maskedCount > 0 ? (
          <p className="text-xs text-muted-foreground">개인정보 {maskedCount}건을 가렸어요</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">
          <Button type="button" variant="outline" onClick={() => setReanalyzeNote("다시 분석은 곧 연결돼요.")}>
            다시 분석하기
          </Button>
          <Badge variant="outline">사건 {id}</Badge>
          {reanalyzeNote ? <span className="text-sm text-muted-foreground">{reanalyzeNote}</span> : null}
        </div>
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="timeline">타임라인</TabsTrigger>
          <TabsTrigger value="settlement">정산표</TabsTrigger>
          <TabsTrigger value="issues">쟁점</TabsTrigger>
          <TabsTrigger value="evidence">증거 요청</TabsTrigger>
          <TabsTrigger value="documents">문서</TabsTrigger>
        </TabsList>
        <TabsContent value="timeline" className="pt-3">
          <Timeline events={analysis.events} changedIds={changedIds} onOpenSource={setSource} />
        </TabsContent>
        <TabsContent value="settlement" className="pt-3">
          <SettlementTable
            lines={analysis.settlement}
            events={analysis.events}
            changedIds={changedIds}
            onGoToEvidence={() => setTab("evidence")}
          />
        </TabsContent>
        <TabsContent value="issues" className="pt-3">
          <IssueCard issues={analysis.issues} events={analysis.events} changedIds={changedIds} />
        </TabsContent>
        <TabsContent value="evidence" className="pt-3">
          <EvidencePanel
            caseId={id}
            requests={analysis.evidenceRequests}
            changedIds={changedIds}
            sampleExtra={sampleExtra}
          />
        </TabsContent>
        <TabsContent value="documents" className="pt-3">
          <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="text-base font-semibold">문서</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              내용증명 초안은 분석 API가 연결되면 이 탭에서 만들 수 있어요. 발송 전 사실관계는 직접 확인해야 해요.
            </p>
            <Link href={`/cases/${id}/report`} className={buttonVariants({ variant: "outline", className: "w-fit" })}>
              사건 정리 자료 보기
            </Link>
          </section>
        </TabsContent>
      </Tabs>

      <SourceModal source={source} transcript={transcript} onClose={() => setSource(null)} />
    </main>
  );
}
