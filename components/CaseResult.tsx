"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { CalendarClock, FileText, FileSearch, ListChecks, LockKeyhole, RefreshCw, Scale, TriangleAlert, Wallet } from "lucide-react";
import type { SettlementLine, SourceRef } from "@/lib/types";
import type { CaseView } from "@/components/case-view";
import { Button, buttonVariants } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AiBadge } from "@/components/AiBadge";
import { EvidencePanel } from "@/components/EvidencePanel";
import { IssueCard } from "@/components/IssueCard";
import { NoticeDraftPanel } from "@/components/NoticeDraftPanel";
import { SettlementTable } from "@/components/SettlementTable";
import { SourceModal } from "@/components/SourceModal";
import { Timeline } from "@/components/Timeline";
import { STATUS_LABEL, won } from "@/components/labels";

const KPI_KEYS: { key: SettlementLine["key"]; label: string }[] = [
  { key: "base", label: "계약 금액" },
  { key: "paid", label: "확인된 지급액" },
  { key: "unpaid", label: "미지급액" },
  { key: "disputed", label: "다툼 있는 추가금" },
];
const KPI_TONE = {
  confirmed: "text-foreground",
  pending: "text-amber-700",
  unverifiable: "text-muted-foreground",
} as const;

function Kpis({ lines, onOpen }: { lines: SettlementLine[]; onOpen: () => void }) {
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
      {KPI_KEYS.map(({ key, label }) => {
        const line = lines.find((l) => l.key === key);
        const highlight = key === "unpaid";
        return (
          <button
            key={key}
            type="button"
            onClick={onOpen}
            className={`rounded-xl p-3 text-left ring-1 transition-colors hover:ring-brand/50 ${
              highlight ? "bg-secondary ring-brand/25" : "bg-muted/60 ring-foreground/5"
            }`}
          >
            <p className="text-xs text-muted-foreground">{label}</p>
            <p className={`mt-1 text-lg font-bold tabular-nums ${line ? (highlight && line.status === "confirmed" ? "text-brand-strong" : KPI_TONE[line.status]) : "text-muted-foreground"}`}>
              {line ? (line.amount != null ? won(line.amount) : line.status === "pending" ? "결론 보류" : "확인 불가") : "-"}
            </p>
            <p className="mt-0.5 text-[11px] text-muted-foreground">{line ? STATUS_LABEL[line.status] : "해당 없음"}</p>
          </button>
        );
      })}
    </div>
  );
}

const DEMO_ONLY_NOTE = "DB 없이 보는 데모 화면이에요. 첫 화면의 '샘플 사건 분석'으로 시작하면 다시 분석할 수 있어요.";

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
      <RefreshCw className={`size-4 ${reanalyzing ? "animate-spin" : ""}`} aria-hidden />
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
  // 쟁점 문장 속 "#12" → 그 seq가 있는 자료의 원문 모달
  const openSeq = (from: number, to: number) => {
    const line = view.lines.find((l) => l.seq === from);
    if (line) setSource({ sourceId: line.sourceId, seqFrom: from, seqTo: to, quote: "" });
  };
  const versionLabel = analysis.version > 1 ? `분석 v${analysis.version - 1} → v${analysis.version}` : `분석 v${analysis.version}`;

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-1 flex-col gap-4 px-4 py-6 sm:px-8">
      <header className="flex flex-col gap-4 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 sm:p-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-1.5 text-xs">
              <span className="rounded-full bg-secondary px-2 py-0.5 font-medium text-secondary-foreground">{versionLabel}</span>
              {changedIds.size > 0 ? (
                <span className="rounded-full bg-yellow-200 px-2 py-0.5 font-medium text-yellow-950">바뀐 항목 {changedIds.size}개</span>
              ) : null}
              {view.maskedCount > 0 ? (
                <span className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-muted-foreground">
                  <LockKeyhole className="size-3" aria-hidden />
                  개인정보 {view.maskedCount}건을 가렸어요
                </span>
              ) : null}
            </div>
            <h1 className="mt-2 text-xl font-bold leading-snug sm:text-2xl">{view.title}</h1>
          </div>
          <AiBadge />
        </div>
        <p className="text-sm leading-7 text-foreground/85 sm:text-base sm:leading-7">{analysis.summary}</p>
        {analysis.oneSided ? (
          <p className="flex items-start gap-2 rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-950 ring-1 ring-amber-600/15">
            <TriangleAlert className="mt-0.5 size-4 shrink-0" aria-hidden />
            한쪽이 제출한 자료만으로 분석했어요. 통화·삭제된 메시지·오프라인 합의는 반영되지 않았어요.
          </p>
        ) : null}
        <Kpis lines={analysis.settlement} onOpen={() => setTab("settlement")} />
        <div className="flex flex-wrap items-center gap-2">
          {reanalyzeButton}
          <Link href={`/cases/${id}/report`} className={buttonVariants({ variant: "ghost" })}>
            <FileText className="size-4" aria-hidden />
            사건 정리 자료 보기
          </Link>
        </div>
        {reanalyzeHint}
        {noteLine}
      </header>

      <Tabs value={tab} onValueChange={setTab}>
        <TabsList className="h-auto w-full flex-wrap justify-start">
          <TabsTrigger value="timeline">
            <CalendarClock className="size-4" aria-hidden />
            타임라인 <Count n={analysis.events.length} />
          </TabsTrigger>
          <TabsTrigger value="settlement">
            <Wallet className="size-4" aria-hidden />
            정산표
          </TabsTrigger>
          <TabsTrigger value="issues">
            <Scale className="size-4" aria-hidden />
            쟁점 <Count n={analysis.issues.length} />
          </TabsTrigger>
          <TabsTrigger value="evidence">
            <FileSearch className="size-4" aria-hidden />
            증거 요청 <Count n={analysis.evidenceRequests.length} warn />
          </TabsTrigger>
          <TabsTrigger value="documents">
            <ListChecks className="size-4" aria-hidden />
            문서
          </TabsTrigger>
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
          <IssueCard issues={analysis.issues} events={analysis.events} changedIds={changedIds} onOpenSeq={openSeq} />
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
          <NoticeDraftPanel
            caseId={id}
            live={view.live}
            settlement={analysis.settlement}
            onGoToEvidence={() => setTab("evidence")}
          />
        </TabsContent>
      </Tabs>

      <SourceModal source={source} lines={view.lines} onClose={() => setSource(null)} />
    </main>
  );
}

function Count({ n, warn }: { n: number; warn?: boolean }) {
  if (!n) return null;
  return (
    <span
      className={`ml-0.5 rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
        warn ? "bg-amber-100 text-amber-800" : "bg-muted text-muted-foreground"
      }`}
    >
      {n}
    </span>
  );
}
