"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { SourceRef } from "@/lib/types";
import type { CaseView } from "@/components/case-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiBadge } from "@/components/AiBadge";
import { EvidencePanel } from "@/components/EvidencePanel";
import { IssueCard } from "@/components/IssueCard";
import { SettlementTable } from "@/components/SettlementTable";
import { SourceModal } from "@/components/SourceModal";
import { Timeline } from "@/components/Timeline";

const DEMO_ONLY_NOTE = "DB 없이 보는 데모 화면이에요. 첫 화면의 '샘플 사건으로 체험하기'로 시작하면 다시 분석할 수 있어요.";

export function CaseResult({ view }: { view: CaseView }) {
  const router = useRouter();
  const { id, analysis } = view;
  const [tab, setTab] = useState("timeline");
  const [source, setSource] = useState<SourceRef | null>(null);
  const [reanalyzing, setReanalyzing] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  async function reanalyze() {
    if (!view.live) {
      setNote(DEMO_ONLY_NOTE);
      return;
    }
    setReanalyzing(true);
    setNote(null);
    try {
      const response = await fetch(`/api/cases/${id}/analyze`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; version?: number };
      if (!response.ok) {
        setNote(body.error ?? "일부 분석에 실패했어요. 다시 분석하기를 눌러주세요.");
        return;
      }
      setNote(body.version ? `분석 v${body.version}을 만들었어요.` : "다시 분석했어요.");
      router.refresh();
    } catch {
      setNote("서버에 연결하지 못했어요. 화면은 그대로 둘게요.");
    } finally {
      setReanalyzing(false);
    }
  }

  const reanalyzeButton = (
    <Button type="button" variant="outline" disabled={reanalyzing} onClick={() => void reanalyze()}>
      {reanalyzing ? "분석하는 중이에요" : "다시 분석하기"}
    </Button>
  );
  const noteLine = note ? (
    <p className="text-sm text-muted-foreground" role="status">
      {note}
    </p>
  ) : null;
  const reanalyzeHint = reanalyzing ? (
    <p className="text-sm text-muted-foreground">AI가 자료를 다시 읽고 있어요. 1~2분 걸릴 수 있어요.</p>
  ) : null;

  if (!analysis) {
    return (
      <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
        <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
          <h1 className="text-xl font-semibold leading-snug">{view.title}</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            아직 분석 결과가 없어요. 분석이 중간에 멈췄다면 다시 분석하기를 눌러주세요.
          </p>
          {view.maskedCount > 0 ? (
            <p className="text-xs text-muted-foreground">개인정보 {view.maskedCount}건을 가렸어요</p>
          ) : null}
          <div className="flex flex-wrap items-center gap-2">{reanalyzeButton}</div>
          {reanalyzeHint}
          {noteLine}
        </section>
      </main>
    );
  }

  const changedIds = new Set(analysis.changedFromPrev);
  const versionLabel = analysis.version > 1 ? `분석 v${analysis.version - 1} → v${analysis.version}` : `분석 v${analysis.version}`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
      <header className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-sm text-muted-foreground">
              {versionLabel}
              {changedIds.size > 0 ? ` · 바뀐 항목 ${changedIds.size}개` : ""}
            </p>
            <h1 className="mt-1 text-xl font-semibold leading-snug">{view.title}</h1>
          </div>
          <AiBadge />
        </div>
        <p className="text-sm leading-6">{analysis.summary}</p>
        {analysis.oneSided ? (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950">
            한쪽이 제출한 자료만으로 분석했어요. 통화·삭제된 메시지·오프라인 합의는 반영되지 않았어요.
          </p>
        ) : null}
        {view.maskedCount > 0 ? (
          <p className="text-xs text-muted-foreground">개인정보 {view.maskedCount}건을 가렸어요</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-2">{reanalyzeButton}</div>
        {reanalyzeHint}
        {noteLine}
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
          <Timeline
            events={analysis.events}
            changedIds={changedIds}
            textSourceIds={new Set(view.lines.map((line) => line.sourceId))}
            onOpenSource={setSource}
          />
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
            live={view.live}
            requests={analysis.evidenceRequests}
            changedIds={changedIds}
            sampleExtra={view.sampleExtra}
            onReanalyzed={() => router.refresh()}
          />
        </TabsContent>
        <TabsContent value="documents" className="pt-3">
          <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="text-base font-semibold">문서</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              내용증명 초안과 사건 정리 자료(인쇄/PDF)는 준비 중이에요. 발송 전 사실관계는 직접 확인해야 해요.
            </p>
            <Link href={`/cases/${id}/report`} className={buttonVariants({ variant: "outline", className: "w-fit" })}>
              사건 정리 자료 보기
            </Link>
          </section>
        </TabsContent>
      </Tabs>

      <SourceModal source={source} lines={view.lines} onClose={() => setSource(null)} />
    </main>
  );
}
