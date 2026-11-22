// 담당: 최서은 | PRD ⑫ 사건 정리 자료 (인쇄/PDF)
import Link from "next/link";
import type { CaseEvent, SourceRef } from "@/lib/types";
import { buttonVariants } from "@/components/ui/button";
import { PrintButton } from "@/components/PrintButton";
import { CERTAINTY_LABEL, EVENT_LABEL, PARTY_LABEL, monthDay, sourceLabel, won } from "@/components/labels";
import { loadCase } from "../load-analysis";

export const dynamic = "force-dynamic";

const STATUS_LABEL = { confirmed: "확인됨", pending: "결론 보류", unverifiable: "확인 불가" } as const;
const DISCLAIMER = "본 자료는 AI가 사용자 제출 자료를 정리한 초안이며 법률 자문이 아닙니다.";

const eventDateKey = (event: CaseEvent) => event.eventDate ?? event.sentAt ?? "";

function dateCell(event: CaseEvent) {
  const sent = monthDay(event.sentAt);
  const happened = monthDay(event.eventDate);
  if (sent && happened && sent !== happened) return `${happened} (보낸 날 ${sent})`;
  return happened ?? sent ?? "날짜 없음";
}

export default async function ReportPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadCase(id);
  const analysis = view.analysis;
  const textSourceIds = new Set(view.lines.map((line) => line.sourceId));
  const today = new Date().toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" });

  if (!analysis) {
    return (
      <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col gap-3 px-4 py-10">
        <h1 className="text-xl font-semibold">사건 정리 자료</h1>
        <p className="text-sm text-muted-foreground">아직 분석 결과가 없어 자료를 만들 수 없어요. 결과 화면에서 다시 분석해 주세요.</p>
        <Link href={`/cases/${id}`} className={buttonVariants({ variant: "outline", className: "w-fit" })}>
          결과 화면으로
        </Link>
      </main>
    );
  }

  const events = [...analysis.events].sort((a, b) => eventDateKey(a).localeCompare(eventDateKey(b)));
  const eventById = new Map(analysis.events.map((event) => [event.id, event]));

  // 증거 목록: 자료(sourceId)별로 근거가 된 위치와 인용문
  const bySource = new Map<string, { source: SourceRef; event: CaseEvent }[]>();
  for (const event of events) {
    for (const source of event.sources) {
      const list = bySource.get(source.sourceId) ?? [];
      list.push({ source, event });
      bySource.set(source.sourceId, list);
    }
  }

  return (
    <main className="report mx-auto flex w-full max-w-3xl flex-1 flex-col gap-6 px-4 py-6 text-sm leading-6 sm:px-8 print:max-w-none print:px-0 print:py-0">
      {/* A4 인쇄 설정 */}
      <style>{`
        @page { size: A4; margin: 14mm 12mm; }
        @media print {
          html, body { background: #fff !important; }
          .report table { font-size: 9.5pt; }
          .report section, .report tr, .report li { break-inside: avoid; }
          .report h2 { break-after: avoid; }
        }
      `}</style>

      <div className="flex flex-wrap items-center justify-between gap-2 print:hidden">
        <Link href={`/cases/${id}`} className={buttonVariants({ variant: "outline" })}>
          결과 화면으로
        </Link>
        <PrintButton />
      </div>

      <header className="flex flex-col gap-1 border-b pb-4">
        <p className="text-xs text-muted-foreground">PayGuard 사건 정리 자료 · {today} 작성 · 분석 v{analysis.version}</p>
        <h1 className="text-2xl font-semibold">{view.title}</h1>
        <p className="rounded-md bg-muted px-3 py-2 text-xs">{DISCLAIMER} AI가 생성한 결과예요.</p>
      </header>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">1. 사건 요약</h2>
        <p>{analysis.summary}</p>
        {analysis.oneSided ? (
          <p className="text-xs text-muted-foreground">
            ※ 한쪽이 제출한 자료만으로 분석했어요. 통화·삭제된 메시지·오프라인 합의는 반영되지 않았어요.
          </p>
        ) : null}
        {view.maskedCount > 0 ? (
          <p className="text-xs text-muted-foreground">※ 개인정보 {view.maskedCount}건을 가린 자료로 정리했어요.</p>
        ) : null}
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">2. 타임라인</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[560px] border-collapse text-left">
            <thead>
              <tr className="border-b bg-muted/60">
                <th className="px-2 py-1.5 font-medium">날짜</th>
                <th className="px-2 py-1.5 font-medium">누가</th>
                <th className="px-2 py-1.5 font-medium">유형</th>
                <th className="px-2 py-1.5 font-medium">내용</th>
                <th className="px-2 py-1.5 font-medium">금액</th>
                <th className="px-2 py-1.5 font-medium">확실성</th>
                <th className="px-2 py-1.5 font-medium">출처</th>
              </tr>
            </thead>
            <tbody>
              {events.map((event) => (
                <tr
                  key={event.id}
                  className={`border-b align-top ${event.certainty === "unverified" ? "text-muted-foreground" : ""}`}
                >
                  <td className="whitespace-nowrap px-2 py-1.5">{dateCell(event)}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{PARTY_LABEL[event.who]}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{EVENT_LABEL[event.type]}</td>
                  <td className="px-2 py-1.5">{event.what}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{won(event.amount) ?? "-"}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{CERTAINTY_LABEL[event.certainty]}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {event.sources.map((source) => sourceLabel(source, textSourceIds)).join(", ")}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">3. 정산표</h2>
        <div className="overflow-x-auto">
          <table className="w-full min-w-[520px] border-collapse text-left">
            <thead>
              <tr className="border-b bg-muted/60">
                <th className="px-2 py-1.5 font-medium">항목</th>
                <th className="px-2 py-1.5 font-medium">금액</th>
                <th className="px-2 py-1.5 font-medium">계산식</th>
                <th className="px-2 py-1.5 font-medium">상태</th>
                <th className="px-2 py-1.5 font-medium">근거</th>
              </tr>
            </thead>
            <tbody>
              {analysis.settlement.map((line, index) => (
                <tr key={`${line.key}-${index}`} className="border-b align-top">
                  <td className="whitespace-nowrap px-2 py-1.5 font-medium">{line.label}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">
                    {line.status === "pending" ? "결론 보류" : (won(line.amount) ?? "확인 불가")}
                  </td>
                  <td className="px-2 py-1.5">{line.formula}</td>
                  <td className="whitespace-nowrap px-2 py-1.5">{STATUS_LABEL[line.status]}</td>
                  <td className="px-2 py-1.5">
                    {line.note ? <p>{line.note}</p> : null}
                    {line.eventIds.map((eventId) => {
                      const event = eventById.get(eventId);
                      return event ? (
                        <p key={eventId} className="text-xs text-muted-foreground">
                          {monthDay(event.eventDate ?? event.sentAt) ?? ""} {event.what}
                        </p>
                      ) : null;
                    })}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        <p className="text-xs text-muted-foreground">금액 합계·차액은 AI가 아니라 계산 코드가 계산했어요.</p>
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-base font-semibold">4. 쟁점</h2>
        {analysis.issues.map((issue, index) => (
          <article key={issue.id} className="flex flex-col gap-1.5 rounded-lg border p-3">
            <h3 className="font-semibold">
              4-{index + 1}. {issue.title}
            </h3>
            <p>
              <span className="font-medium">내 주장: </span>
              {issue.myClaim}
            </p>
            <p>
              <span className="font-medium">상대 주장: </span>
              {issue.otherClaim}
            </p>
            <div>
              <p className="font-medium">확인된 사실</p>
              <ul className="list-disc pl-5">
                {issue.facts.map((fact) => (
                  <li key={fact}>{fact}</li>
                ))}
              </ul>
            </div>
            {[
              { label: "내 주장 근거", ids: issue.supportsMe },
              { label: "상대 주장 근거", ids: issue.supportsOther },
            ].map(({ label, ids }) => {
              const texts = ids.map((value) => eventById.get(value)?.what ?? value).filter(Boolean);
              return (
                <p key={label}>
                  <span className="font-medium">{label}: </span>
                  {texts.length ? texts.join(" ") : "이 자료에는 없어요."}
                </p>
              );
            })}
            {issue.toCheck.length ? (
              <div>
                <p className="font-medium">추가 확인 필요</p>
                <ul className="list-disc pl-5">
                  {issue.toCheck.map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null}
          </article>
        ))}
        <p className="text-xs text-muted-foreground">PayGuard는 책임 비율을 판단하지 않아요. 위 근거를 상담에 활용하세요.</p>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-base font-semibold">5. 증거 목록 (자료별)</h2>
        {[...bySource.entries()].map(([sourceId, refs]) => (
          <div key={sourceId} className="flex flex-col gap-1">
            <p className="font-medium">
              {view.sourceNames[sourceId] ??
                (textSourceIds.has(sourceId) ? "카톡 대화" : "이미지 자료")}
            </p>
            <ul className="list-disc pl-5">
              {refs.map(({ source, event }) => (
                <li key={`${event.id}-${source.seqFrom}-${source.seqTo}`}>
                  <span className="text-muted-foreground">{sourceLabel(source, textSourceIds)}</span> “{source.quote}”
                </li>
              ))}
            </ul>
          </div>
        ))}
      </section>

      {analysis.evidenceRequests.length ? (
        <section className="flex flex-col gap-2">
          <h2 className="text-base font-semibold">6. 추가로 필요한 자료</h2>
          <ul className="list-disc pl-5">
            {analysis.evidenceRequests.map((request) => (
              <li key={request.id}>
                {request.question} <span className="text-muted-foreground">— {request.why}</span>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <footer className="border-t pt-3 text-xs text-muted-foreground">{DISCLAIMER}</footer>
    </main>
  );
}
