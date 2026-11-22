// 담당: 민수빈 | PRD 7-2 대응 모드 분석 파이프라인
//
//   analyzeMessages(messages, images, prevAnalysis)  ← DB와 무관한 순수 파이프라인 (스크립트·API 공용)
//     2 extractFromImage → 3 extractEvents → 4 normalizeEvents(검증·정렬·중복 제거)
//     → 5 detectConflicts → 6 computeSettlement → 7 analyzeIssues → 8 requestEvidence(+pending 반영)
//     → 9 summary/oneSided → 10 diffAnalysis → AnalysisSchema 검증
//   runAnalysis(caseId)  ← DB에서 읽어 analyzeMessages 호출 후 저장만 한다
//
// 규칙: LLM은 callStructured()로만 호출, 넘기는 텍스트는 이미 마스킹된 것, 금액 계산은 코드(settlement.ts)가 한다.
import "server-only";
import { z } from "zod";
import { downloadImage, getCase, getLatestAnalysis, saveAnalysis } from "../db";
import { diffAnalysis, eventSignature } from "../diff";
import { maskText } from "../mask";
import { computeSettlement, type RevisionPolicy } from "../settlement";
import {
  AnalysisSchema,
  CertaintySchema,
  EventTypeSchema,
  type Analysis,
  type CaseEvent,
  type CaseImage,
  type CaseMessage,
  type EvidenceRequest,
  type Issue,
  type SettlementLine,
  type SourceRef,
} from "../types";
import { callStructured } from "./llm";
import {
  ANALYZE_ISSUES,
  ANALYZE_ISSUES_GUIDE,
  DETECT_CONFLICTS,
  DETECT_CONFLICTS_GUIDE,
  EXTRACT_EVENTS,
  EXTRACT_EVENTS_GUIDE,
  EXTRACT_FROM_IMAGE,
  REQUEST_EVIDENCE,
  REQUEST_EVIDENCE_GUIDE,
} from "./prompts";

export const CHUNK_SIZE = 150;
// 예방 모드 → 분쟁 분석 전환 때 양측이 확인한 조건을 넣는 줄의 머리말 (app/api/rooms/[id]/to-case)
export const PAYGUARD_RECORD = "[PayGuard 기록]";
const MAX_ISSUES = 5;
const MAX_EVIDENCE_REQUESTS = 4;
const QUOTE_MAX = 80;

// ───────────────────────── 내부 타입 ─────────────────────────

const AmountKindSchema = z.enum(["total", "deposit", "balance", "per_revision", "expense", "other"]);
type AmountKind = z.infer<typeof AmountKindSchema>;

// 정산 계산에만 쓰는 보조 정보 (Analysis에는 저장하지 않는다)
export interface EventHints {
  amountKind: AmountKind | null;
  revisionsIncluded: number | null;
  fromImage: "transfer" | "receipt" | null;
}

export type ExtractedEvent = CaseEvent & { hints: EventHints };

export interface Conflicts {
  conflicts: { eventIds: string[]; description: string; involvesAmount: boolean }[];
  missing: { description: string; relatedEventIds: string[] }[];
}

export type PipelineStep = "extractFromImage" | "extractEvents" | "detectConflicts" | "analyzeIssues" | "requestEvidence";

export interface AnalyzeResult {
  analysis: Analysis;
  // 비어 있지 않으면 화면에 "일부 분석에 실패했어요. 다시 분석하기를 눌러주세요." 표시
  failedSteps: PipelineStep[];
  debug: { rawEventCount: number; conflicts: Conflicts };
}

export interface AnalyzeOptions {
  // 양측이 함께 만든 자료(예방 모드 room_chat)의 sourceId. 하나라도 있으면 oneSided=false
  sharedSourceIds?: string[];
}

// ───────────────────────── 유틸 ─────────────────────────

const KST = "Asia/Seoul";
const kstFmt = new Intl.DateTimeFormat("sv-SE", {
  timeZone: KST,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hour12: false,
});
const kstWeekday = new Intl.DateTimeFormat("ko-KR", { timeZone: KST, weekday: "short" });

function kstDateTime(iso: string | null): string {
  if (!iso) return "시각 미상";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "시각 미상";
  return `${kstFmt.format(d)} (${kstWeekday.format(d)})`;
}

function kstDate(iso: string | null): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? null : kstFmt.format(d).slice(0, 10);
}

function normalizeDate(s: string | null, fallbackIso: string | null): string | null {
  const m = s?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (m) return `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}`;
  return kstDate(fallbackIso);
}

const dayDiff = (a: string | null, b: string | null) =>
  a && b ? Math.abs(Date.parse(`${a}T00:00:00Z`) - Date.parse(`${b}T00:00:00Z`)) / 86_400_000 : Infinity;

const minSeq = (e: CaseEvent) => Math.min(...e.sources.map((s) => (s.seqFrom > 0 ? s.seqFrom : Infinity)));

const sortKey = (e: CaseEvent) =>
  `${e.eventDate ?? kstDate(e.sentAt) ?? "9999"}|${e.sentAt ?? ""}|${String(Number.isFinite(minSeq(e)) ? minSeq(e) : 0).padStart(6, "0")}`;

const won = (n: number) => n.toLocaleString("ko-KR");

const senderLabel = (s: CaseMessage["sender"]) => (s === "me" ? "나" : s === "counterparty" ? "상대방" : "기록·알 수 없음");

// 시스템 메시지(사진·이모티콘·입장 알림)는 분석에서 제외 (PRD 7-1)
const SYSTEM_TEXT = /^(사진|사진 \d+장|이모티콘|동영상|음성메시지|삭제된 메시지입니다\.?)$|님이 (들어왔습니다|나갔습니다)/;
// 붙여넣은 텍스트 자료는 sender "unknown"으로 저장되므로, sender가 아니라 내용으로 시스템 메시지만 거른다.
export function analyzableMessages(messages: CaseMessage[]): CaseMessage[] {
  return messages.filter((m) => m.text.trim() !== "" && !SYSTEM_TEXT.test(m.text.trim()));
}

function formatMessages(messages: CaseMessage[]): string {
  return messages.map((m) => `[${m.seq}] ${kstDateTime(m.sentAt)} ${senderLabel(m.sender)}: ${m.text}`).join("\n");
}

function eventsForPrompt(events: CaseEvent[]) {
  return events.map((e) => ({
    id: e.id,
    who: e.who,
    type: e.type,
    what: e.what,
    sentAt: kstDateTime(e.sentAt),
    eventDate: e.eventDate,
    amount: e.amount,
    agreedByOther: e.agreedByOther,
    certainty: e.certainty,
    seq: e.sources.map((s) => (s.seqFrom > 0 ? (s.seqFrom === s.seqTo ? `#${s.seqFrom}` : `#${s.seqFrom}~${s.seqTo}`) : "이미지")),
    quotes: e.sources.map((s) => s.quote),
  }));
}

// 저장용: 보조 정보 중 amountKind·revisionsIncluded는 CaseEvent의 선택 필드로 남긴다 (재분석 때 재사용)
const stripHints = (e: ExtractedEvent): CaseEvent => {
  const { hints, ...event } = e;
  return { ...event, amountKind: hints.amountKind, revisionsIncluded: hints.revisionsIncluded };
};

// 이전 버전의 사건을 다시 쓸 때 보조 정보를 복원한다. 필드가 없으면(사람이 고친 JSON 등) 문장으로 추정한다.
function fromPrevEvent(e: CaseEvent): ExtractedEvent {
  const text = `${e.what} ${e.sources.map((s) => s.quote).join(" ")}`;
  const imageOnly = e.sources.every((s) => s.seqFrom === 0);
  let amountKind: AmountKind | null = e.amountKind ?? null;
  if (e.amountKind === undefined && e.amount !== null) {
    amountKind = /회당|1회\s*당|추가\s*수정/.test(text)
      ? "per_revision"
      : /선금|계약금/.test(text)
        ? "deposit"
        : /잔금/.test(text)
          ? "balance"
          : null;
  }
  let revisionsIncluded = e.revisionsIncluded ?? null;
  if (e.revisionsIncluded === undefined) {
    const m = text.match(/수정[은는이가]?\s*(\d+)\s*(번|회)[^.]{0,8}포함/);
    revisionsIncluded = m ? Number(m[1]) : null;
  }
  const rest: CaseEvent = { ...e };
  delete rest.amountKind;
  delete rest.revisionsIncluded;
  return {
    ...rest,
    hints: {
      amountKind,
      revisionsIncluded,
      fromImage: imageOnly ? (e.type === "payment" ? "transfer" : "receipt") : null,
    },
  };
}

// ───────────────────────── 2. 이미지 추출 ─────────────────────────

const ImageOutputSchema = z.object({
  transactions: z.array(
    z.object({
      date: z.string().nullable().describe("거래 날짜 YYYY-MM-DD, 읽을 수 없으면 null"),
      amount: z.number().int().nullable().describe("원 단위 정수, 읽을 수 없으면 null"),
      direction: z.enum(["income", "expense", "unknown"]).describe("income=받은 돈(입금), expense=쓴 돈(지출·출금)"),
      kind: z.enum(["transfer", "receipt"]).describe("transfer=이체 내역, receipt=영수증"),
      memo: z.string().nullable().describe("메모·적요. 이름·계좌번호는 쓰지 않는다"),
    }),
  ),
});

export async function extractFromImage(
  image: CaseImage,
  failed?: Set<PipelineStep>,
): Promise<ExtractedEvent[]> {
  const res = await callStructured({
    schema: ImageOutputSchema,
    instructions: EXTRACT_FROM_IMAGE,
    prompt: "첨부한 이미지에서 거래 내역을 모두 읽어 주세요. 금액을 읽을 수 없는 거래는 amount를 null로 두세요.",
    images: [{ data: image.data, mediaType: image.mediaType }],
    fallback: { transactions: [] },
  });
  if (!res.ok) failed?.add("extractFromImage");

  const label = image.filename ? `이미지 ${image.filename}` : "이미지 자료";
  return res.data.transactions
    .filter((t) => t.amount !== null && t.amount > 0)
    .map((t): ExtractedEvent => {
      const isIncome = t.direction === "income";
      const memo = t.memo ? maskText(t.memo).text : "";
      const kindLabel = t.kind === "receipt" ? "영수증" : "이체 내역";
      const what = isIncome
        ? `${kindLabel}상 ${won(t.amount!)}원 입금${memo ? ` (메모: ${memo})` : ""}`
        : `${kindLabel}상 ${won(t.amount!)}원 지출${memo ? ` (메모: ${memo})` : ""}`;
      return {
        id: "",
        who: isIncome ? "counterparty" : "me",
        type: isIncome ? "payment" : "other",
        what,
        sentAt: null,
        eventDate: normalizeDate(t.date, null),
        amount: t.amount,
        agreedByOther: "unknown",
        certainty: "confirmed", // 이미지(이체 내역·영수증)로 확인됨
        sources: [{ sourceId: image.sourceId, seqFrom: 0, seqTo: 0, quote: `${label}: ${what}`.slice(0, QUOTE_MAX) }],
        hints: {
          amountKind: isIncome ? null : "expense",
          revisionsIncluded: null,
          fromImage: isIncome ? "transfer" : "receipt",
        },
      };
    });
}

// ───────────────────────── 3. 메시지 추출 ─────────────────────────

const ExtractOutputSchema = z.object({
  events: z.array(
    z.object({
      who: z.enum(["me", "counterparty", "unknown"]),
      type: EventTypeSchema,
      what: z.string().describe("한 문장 요약. 참여자는 나/상대방으로 부른다"),
      eventDate: z.string().nullable().describe("사건 날짜 YYYY-MM-DD"),
      amount: z.number().int().nullable().describe("원 단위 정수"),
      amountKind: AmountKindSchema.nullable(),
      revisionsIncluded: z.number().int().nullable(),
      agreedByOther: z.enum(["yes", "no", "unknown"]),
      certainty: CertaintySchema,
      sources: z.array(
        z.object({
          seqFrom: z.number().int(),
          seqTo: z.number().int(),
          quote: z.string(),
        }),
      ),
    }),
  ),
});
type RawEvent = z.infer<typeof ExtractOutputSchema>["events"][number];

// 메시지를 150개씩 나눠 추출하고, 코드로 검증한다 (정렬·중복 제거는 normalizeEvents)
export async function extractEvents(
  messages: CaseMessage[],
  failed?: Set<PipelineStep>,
): Promise<ExtractedEvent[]> {
  const usable = analyzableMessages(messages);
  const chunks: CaseMessage[][] = [];
  for (let i = 0; i < usable.length; i += CHUNK_SIZE) chunks.push(usable.slice(i, i + CHUNK_SIZE));

  const results = await Promise.all(
    chunks.map((chunk) =>
      callStructured({
        schema: ExtractOutputSchema,
        instructions: EXTRACT_EVENTS,
        prompt: `${EXTRACT_EVENTS_GUIDE}\n\n[대화]\n${formatMessages(chunk)}`,
        fallback: { events: [] },
      }),
    ),
  );

  const out: ExtractedEvent[] = [];
  results.forEach((res, i) => {
    if (!res.ok) failed?.add("extractEvents");
    out.push(...validateEvents(res.data.events, chunks[i]));
  });
  return out;
}

// 코드 검증: seq가 실제 메시지 범위 밖이면 그 출처를 버리고, 출처가 하나도 없으면 사건을 버린다
export function validateEvents(raw: RawEvent[], messages: CaseMessage[]): ExtractedEvent[] {
  const bySeq = new Map(messages.map((m) => [m.seq, m]));
  const out: ExtractedEvent[] = [];
  for (const r of raw) {
    const sources: SourceRef[] = [];
    for (const s of r.sources ?? []) {
      const from = Math.min(s.seqFrom, s.seqTo);
      const to = Math.max(s.seqFrom, s.seqTo);
      const first = bySeq.get(from);
      if (!first || !bySeq.has(to)) continue;
      sources.push({
        sourceId: first.sourceId,
        seqFrom: from,
        seqTo: to,
        quote: (s.quote?.trim() || first.text).slice(0, QUOTE_MAX),
      });
    }
    if (!sources.length) continue;

    // 보낸 시각은 LLM이 아니라 원문 메시지에서 가져온다
    const firstMsg = bySeq.get(Math.min(...sources.map((s) => s.seqFrom)))!;
    // 예방 모드에서 양측이 확인한 조건 기록이 근거면 확인된 사실이다 (PRD ⑪: Terms 이력은 confirmed 근거)
    const fromRecord = sources.some((s) => {
      for (let q = s.seqFrom; q <= s.seqTo; q++) if (bySeq.get(q)?.text.startsWith(PAYGUARD_RECORD)) return true;
      return false;
    });
    out.push({
      id: "",
      who: r.who,
      type: r.type,
      what: r.what.trim(),
      sentAt: firstMsg.sentAt,
      eventDate: normalizeDate(r.eventDate, firstMsg.sentAt),
      amount: r.amount !== null && r.amount > 0 ? r.amount : null,
      agreedByOther: fromRecord && r.type === "promise" ? "yes" : r.agreedByOther,
      certainty: fromRecord && r.type === "promise" ? "confirmed" : r.certainty,
      sources,
      hints: {
        amountKind: r.amount !== null ? r.amountKind : null,
        revisionsIncluded: r.revisionsIncluded !== null && r.revisionsIncluded >= 0 ? r.revisionsIncluded : null,
        fromImage: null,
      },
    });
  }
  return out;
}

// ───────────────────────── 4. 정렬·중복 제거·id ─────────────────────────

const CERTAINTY_RANK = { confirmed: 2, claimed: 1, unverified: 0 } as const;

function overlaps(a: CaseEvent, b: CaseEvent): boolean {
  return a.sources.some((x) =>
    b.sources.some((y) => x.sourceId === y.sourceId && x.seqFrom <= y.seqTo && y.seqFrom <= x.seqTo),
  );
}

// 같은 사건 = 같은 type + 같은 금액 + 사건일 1일 이내.
// 금액이 없는 사건은 근거 메시지가 겹칠 때만 같은 사건으로 본다 (같은 날의 서로 다른 약속을 합치지 않도록).
function isDuplicate(a: ExtractedEvent, b: ExtractedEvent): boolean {
  if (a.type !== b.type || a.amount !== b.amount) return false;
  if (dayDiff(a.eventDate ?? kstDate(a.sentAt), b.eventDate ?? kstDate(b.sentAt)) > 1) return false;
  if (a.amount === null && !overlaps(a, b)) return false;
  // 수정 횟수·단가처럼 성격이 다른 약속은 합치지 않는다
  if (a.hints.revisionsIncluded !== b.hints.revisionsIncluded) return false;
  if (a.amount !== null && a.hints.amountKind && b.hints.amountKind && a.hints.amountKind !== b.hints.amountKind) return false;
  return true;
}

function merge(a: ExtractedEvent, b: ExtractedEvent): ExtractedEvent {
  const [primary, other] = CERTAINTY_RANK[b.certainty] > CERTAINTY_RANK[a.certainty] ? [b, a] : [a, b];
  const seen = new Set<string>();
  const sources = [...primary.sources, ...other.sources].filter((s) => {
    const k = `${s.sourceId}:${s.seqFrom}-${s.seqTo}`;
    return seen.has(k) ? false : (seen.add(k), true);
  });
  const agreed = [a.agreedByOther, b.agreedByOther];
  const sentAts = [a.sentAt, b.sentAt].filter((x): x is string => !!x).sort();
  return {
    ...primary,
    id: primary.id || other.id, // 이전 버전에서 온 사건이 있으면 그 id를 이어 간다
    sentAt: sentAts[0] ?? null,
    eventDate: primary.eventDate ?? other.eventDate,
    agreedByOther: agreed.includes("yes") ? "yes" : agreed.includes("no") ? "no" : "unknown",
    sources,
    hints: {
      amountKind: primary.hints.amountKind ?? other.hints.amountKind,
      revisionsIncluded: primary.hints.revisionsIncluded ?? other.hints.revisionsIncluded,
      fromImage: primary.hints.fromImage ?? other.hints.fromImage,
    },
  };
}

export function normalizeEvents(events: ExtractedEvent[]): ExtractedEvent[] {
  const sorted = [...events].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const kept: ExtractedEvent[] = [];
  for (const e of sorted) {
    const idx = kept.findIndex((k) => isDuplicate(k, e));
    if (idx >= 0) kept[idx] = merge(kept[idx], e);
    else kept.push(e);
  }
  kept.sort((a, b) => sortKey(a).localeCompare(sortKey(b)));

  // id는 근거 seq 기반으로 만들어 재분석 때도 같은 사건이 같은 id를 갖게 한다 (diff 비교용)
  // 이전 버전에서 재사용한 사건(사람이 고친 샘플 JSON 포함)은 원래 id를 그대로 쓴다
  const used = new Map<string, number>();
  const taken = new Set(kept.map((e) => e.id).filter(Boolean));
  const kept2 = kept.map((e, i) => (e.id && kept.findIndex((k) => k.id === e.id) === i ? e : { ...e, id: "" }));
  return kept2.map((e) => {
    if (e.id) return e;
    const s = minSeq(e);
    const imageSource = e.sources.find((x) => x.seqFrom === 0)?.sourceId ?? "x";
    const base = Number.isFinite(s) ? `ev-${s}-${e.type}` : `ev-img-${imageSource}-${e.type}`;
    let n = used.get(base) ?? 0;
    let id = "";
    do {
      n++;
      id = n === 1 ? base : `${base}-${n}`;
    } while (taken.has(id));
    used.set(base, n);
    taken.add(id);
    return { ...e, id };
  });
}

// ───────────────────────── 5. 충돌·누락 ─────────────────────────

const ConflictsOutputSchema = z.object({
  conflicts: z.array(
    z.object({
      eventIds: z.array(z.string()),
      description: z.string(),
      involvesAmount: z.boolean(),
    }),
  ),
  missing: z.array(
    z.object({
      description: z.string(),
      relatedEventIds: z.array(z.string()),
    }),
  ),
});

export async function detectConflicts(events: CaseEvent[], failed?: Set<PipelineStep>): Promise<Conflicts> {
  const empty: Conflicts = { conflicts: [], missing: [] };
  if (!events.length) return empty;
  const res = await callStructured({
    schema: ConflictsOutputSchema,
    instructions: DETECT_CONFLICTS,
    prompt: `${DETECT_CONFLICTS_GUIDE}\n\n[사건 목록]\n${JSON.stringify(eventsForPrompt(events), null, 1)}`,
    fallback: empty,
  });
  if (!res.ok) failed?.add("detectConflicts");
  const ids = new Set(events.map((e) => e.id));
  return {
    conflicts: res.data.conflicts
      .map((c) => ({ ...c, eventIds: c.eventIds.filter((id) => ids.has(id)) }))
      .filter((c) => c.eventIds.length >= 2),
    missing: res.data.missing.map((m) => ({ ...m, relatedEventIds: m.relatedEventIds.filter((id) => ids.has(id)) })),
  };
}

// ───────────────────────── 6. 정산 (코드) ─────────────────────────

function latestPreferAgreed(events: ExtractedEvent[]): ExtractedEvent | null {
  const agreed = events.filter((e) => e.agreedByOther === "yes");
  return agreed.at(-1) ?? events.at(-1) ?? null;
}

export function buildRevisionPolicy(events: ExtractedEvent[]): RevisionPolicy {
  const includedEvent = latestPreferAgreed(events.filter((e) => e.hints.revisionsIncluded !== null));
  const unitEvent = latestPreferAgreed(
    events.filter((e) => e.hints.amountKind === "per_revision" && e.amount !== null && e.type !== "charge"),
  );
  return {
    included: includedEvent?.hints.revisionsIncluded ?? null,
    includedEventIds: includedEvent ? [includedEvent.id] : [],
    includedAgreed: includedEvent?.agreedByOther === "yes",
    unitPrice: unitEvent?.amount ?? null,
    unitPriceEventIds: unitEvent ? [unitEvent.id] : [],
    unitPriceAgreed: unitEvent?.agreedByOther === "yes",
  };
}

// 증거 요청 프롬프트에 넣을 "코드로 확인된 조건" (이미 확인된 것을 다시 요청하지 않게)
function confirmedTermsText(events: ExtractedEvent[], settlement: SettlementLine[]): string {
  const p = buildRevisionPolicy(events);
  const seqOf = (ids: string[]) =>
    events
      .filter((e) => ids.includes(e.id))
      .flatMap((e) =>
        e.sources.filter((s) => s.seqFrom > 0).map((s) => (s.seqFrom === s.seqTo ? `#${s.seqFrom}` : `#${s.seqFrom}~${s.seqTo}`)),
      )
      .join(", ");
  const agreedText = (ok: boolean) => (ok ? "상대방 동의 확인됨" : "상대방 동의 확인 안 됨");
  const lines: string[] = [];
  const base = settlement.find((l) => l.key === "base");
  if (base?.amount != null)
    lines.push(`- 기본 계약 금액 ${won(base.amount)}원: ${agreedText(base.status === "confirmed")} (${seqOf(base.eventIds)})`);
  if (p.included !== null)
    lines.push(`- 기본 포함 수정 ${p.included}회: ${agreedText(p.includedAgreed)} (${seqOf(p.includedEventIds)})`);
  if (p.unitPrice !== null)
    lines.push(`- 추가 수정 1회 단가 ${won(p.unitPrice)}원: ${agreedText(p.unitPriceAgreed)} (${seqOf(p.unitPriceEventIds)})`);
  return lines.length ? lines.join("\n") : "- 없음";
}

export function settle(events: ExtractedEvent[], conflicts: Conflicts): SettlementLine[] {
  const baseCandidateIds = events
    .filter((e) => e.type === "promise" && e.amount !== null)
    .filter((e) => e.hints.amountKind === null || e.hints.amountKind === "total")
    .map((e) => e.id);
  const revisionPolicy = buildRevisionPolicy(events);

  return computeSettlement(events.map(stripHints), {
    baseCandidateIds,
    revisionPolicy,
    receiptEventIds: events.filter((e) => e.hints.fromImage === "receipt").map((e) => e.id),
    // "서로 모순되는 금액"만: 같은 대상(같은 type·같은 금액 성격)에 서로 다른 금액이 있을 때 (코드 검증)
    // 예: 총액 80만 원과 선금 40만 원은 금액이 달라도 모순이 아니다
    conflicts: conflicts.conflicts
      .filter((c) => {
        if (!c.involvesAmount) return false;
        const withAmount = events.filter((e) => c.eventIds.includes(e.id) && e.amount !== null);
        return withAmount.some((a) =>
          withAmount.some(
            (b) =>
              a !== b && a.type === b.type && (a.hints.amountKind ?? "total") === (b.hints.amountKind ?? "total") && a.amount !== b.amount,
          ),
        );
      })
      .map((c) => ({ eventIds: c.eventIds, note: c.description })),
  });
}

// ───────────────────────── 7. 쟁점 ─────────────────────────

const IssuesOutputSchema = z.object({
  summary: z.string().describe("사건 요약 3문장 이내, 사실만"),
  issues: z.array(
    z.object({
      id: z.string(),
      title: z.string(),
      myClaim: z.string(),
      otherClaim: z.string(),
      facts: z.array(z.string()),
      supportsMe: z.array(z.string()),
      supportsOther: z.array(z.string()),
      toCheck: z.array(z.string()),
      eventIds: z.array(z.string()),
    }),
  ),
});

export async function analyzeIssues(
  events: CaseEvent[],
  settlement: SettlementLine[],
  conflicts: Conflicts,
  prevIssues: Issue[] = [],
  failed?: Set<PipelineStep>,
): Promise<{ issues: Issue[]; summary: string }> {
  const fallback = { summary: "", issues: [] };
  if (!events.length) return fallback;
  const prev = prevIssues.map((i) => ({ id: i.id, title: i.title }));
  const res = await callStructured({
    schema: IssuesOutputSchema,
    instructions: ANALYZE_ISSUES,
    prompt: [
      ANALYZE_ISSUES_GUIDE,
      `[사건 목록]\n${JSON.stringify(eventsForPrompt(events), null, 1)}`,
      `[정산표 (코드 계산)]\n${JSON.stringify(settlement, null, 1)}`,
      `[충돌·누락]\n${JSON.stringify(conflicts, null, 1)}`,
      prev.length ? `[이전 쟁점 목록]\n${JSON.stringify(prev, null, 1)}` : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    fallback,
  });
  if (!res.ok) failed?.add("analyzeIssues");

  const ids = new Set(events.map((e) => e.id));
  const used = new Set<string>();
  const issues = res.data.issues.slice(0, MAX_ISSUES).map((i, n): Issue => {
    let id = /^[\w-]{1,60}$/.test(i.id) ? i.id : "";
    if (!id || used.has(id)) id = `issue-${n + 1}`;
    while (used.has(id)) id = `${id}-b`;
    used.add(id);
    return { ...i, id, eventIds: i.eventIds.filter((e) => ids.has(e)) };
  });
  return { issues, summary: res.data.summary.trim() };
}

// ───────────────────────── 8. 증거 요청 ─────────────────────────

const SettlementKeySchema = z.enum(["base", "paid", "unpaid", "disputed", "extra_expense", "unknown"]);
const EvidenceOutputSchema = z.object({
  requests: z.array(
    z.object({
      id: z.string(),
      question: z.string(),
      why: z.string(),
      blocks: z.array(z.enum(["settlement", "issue"])),
      relatedIssueId: z.string().nullable(),
      settlementKeys: z.array(SettlementKeySchema),
    }),
  ),
});

export interface EvidenceResult {
  requests: EvidenceRequest[];
  // 요청 id → 보류시키는 정산 줄 key
  blockedLines: Map<string, SettlementLine["key"][]>;
}

export async function requestEvidence(
  events: CaseEvent[],
  settlement: SettlementLine[],
  issues: Issue[],
  conflicts: Conflicts,
  prevRequests: EvidenceRequest[] = [],
  failed?: Set<PipelineStep>,
  newEventIds: string[] = [],
  confirmedTerms = "",
): Promise<EvidenceResult> {
  const empty: EvidenceResult = { requests: [], blockedLines: new Map() };
  if (!events.length) return empty;
  const prev = prevRequests.map((r) => ({ id: r.id, question: r.question }));
  const res = await callStructured({
    schema: EvidenceOutputSchema,
    instructions: REQUEST_EVIDENCE,
    prompt: [
      REQUEST_EVIDENCE_GUIDE,
      prev.length
        ? `- "이전 증거 요청"과 같은 내용을 다시 요청하면 같은 id를 쓴다. 새 요청은 새 id("req-영문소문자")를 만든다.`
        : `- id는 "req-영문소문자" 형식으로 만든다.`,
      `[사건 목록]\n${JSON.stringify(eventsForPrompt(events), null, 1)}`,
      `[정산표 (코드 계산)]\n${JSON.stringify(settlement, null, 1)}`,
      confirmedTerms ? `[코드로 확인된 조건]\n${confirmedTerms}` : "",
      `[쟁점]\n${JSON.stringify(issues.map((i) => ({ id: i.id, title: i.title, toCheck: i.toCheck })), null, 1)}`,
      `[충돌·누락]\n${JSON.stringify(conflicts, null, 1)}`,
      prev.length ? `[이전 증거 요청]\n${JSON.stringify(prev, null, 1)}` : "",
      prev.length && newEventIds.length
        ? `[이번에 새로 추가된 사건]\n${JSON.stringify(eventsForPrompt(events.filter((e) => newEventIds.includes(e.id))), null, 1)}`
        : "",
    ]
      .filter(Boolean)
      .join("\n\n"),
    fallback: { requests: [] },
  });
  if (!res.ok) failed?.add("requestEvidence");

  const issueIds = new Set(issues.map((i) => i.id));
  const lineKeys = new Set(settlement.map((l) => l.key));
  const used = new Set<string>();
  const blockedLines = new Map<string, SettlementLine["key"][]>();
  const requests = res.data.requests.slice(0, MAX_EVIDENCE_REQUESTS).map((r, n): EvidenceRequest => {
    let id = /^[\w-]{1,60}$/.test(r.id) ? r.id : "";
    if (!id || used.has(id)) id = `req-${n + 1}`;
    while (used.has(id)) id = `${id}-b`;
    used.add(id);
    const blocks = [...new Set(r.blocks)];
    if (blocks.includes("settlement")) {
      const keys = r.settlementKeys.filter((k) => lineKeys.has(k));
      // 어떤 줄인지 지정하지 않았으면 미지급액 결론을 보류한다
      blockedLines.set(id, keys.length ? [...new Set(keys)] : lineKeys.has("unpaid") ? ["unpaid"] : []);
    }
    return {
      id,
      question: r.question,
      why: r.why,
      blocks,
      relatedIssueId: r.relatedIssueId && issueIds.has(r.relatedIssueId) ? r.relatedIssueId : null,
    };
  });
  return { requests, blockedLines };
}

// 코드 검증: 미지급액이 이미 확인된 값(확인된 기본 금액 − 이체 내역으로 확인된 지급액, 납품 기록 있음)으로 계산됐으면
// "그 뒤로 입금됐는지" 같은 요청이 지급액·미지급액을 보류시키지 않는다.
// 상대가 돈을 보내지 않았다는 것(없는 사실)은 사용자가 증명할 수 없고, 추가 입금이 확인되면 그때 paid가 바뀐다.
// 질문 자체는 남기고(쟁점 확인용), 정산을 보류시키는 연결만 푼다.
const PAYMENT_TOPIC = /입금|이체|송금|지급|잔금|선금|거래\s*내역|계좌/;
export function releasePaymentBlocks(settlement: SettlementLine[], evidence: EvidenceResult): void {
  const paid = settlement.find((l) => l.key === "paid");
  const unpaid = settlement.find((l) => l.key === "unpaid");
  if (paid?.status !== "confirmed" || unpaid?.status !== "confirmed" || unpaid.amount === null) return;
  for (const r of evidence.requests) {
    if (!PAYMENT_TOPIC.test(`${r.question} ${r.why}`)) continue;
    const keys = (evidence.blockedLines.get(r.id) ?? []).filter((k) => k !== "paid" && k !== "unpaid");
    if (keys.length) evidence.blockedLines.set(r.id, keys);
    else {
      evidence.blockedLines.delete(r.id);
      r.blocks = r.blocks.filter((b) => b !== "settlement");
      if (!r.blocks.length) r.blocks = ["issue"];
    }
  }
}

// 증거 요청이 정산을 막으면 해당 줄을 pending으로 (PRD 7-2 8단계)
export function applyPending(
  settlement: SettlementLine[],
  requests: EvidenceRequest[],
  blockedLines: Map<string, SettlementLine["key"][]>,
): SettlementLine[] {
  return settlement.map((line) => {
    const blockers = requests.filter((r) => blockedLines.get(r.id)?.includes(line.key));
    if (!blockers.length) return line;
    const extra = blockers.map((r) => `결론 보류(증거 요청 ${r.id}): ${r.question}`).join(" · ");
    return { ...line, status: "pending", note: [line.note, extra].filter(Boolean).join(" · ") };
  });
}

// ───────────────────────── 판단 표현 점검 ─────────────────────────

// PRD 1장 규칙 5: 과실 비율·승소 가능성·"누가 잘못했다" 단정이 섞였는지 점검 (발견 시 경고만)
const VERDICT_PATTERNS = [
  /과실\s*(비율|비중)?/,
  /책임\s*(비율|비중)/,
  /\d+\s*(%|퍼센트)\s*(책임|과실)/,
  /승소|패소|소송에서\s*(이길|질)\s*수/,
  /(잘못|귀책)(했|이다|입니다|이에요|은\s*(나|상대방))/,
  /(나|상대방)(의|에게)\s*(잘못|책임)이\s*(있|크)/,
];
export function findVerdictLanguage(analysis: Analysis): string[] {
  const texts = [
    analysis.summary,
    ...analysis.issues.flatMap((i) => [i.title, i.myClaim, i.otherClaim, ...i.facts, ...i.supportsMe, ...i.supportsOther, ...i.toCheck]),
    ...analysis.evidenceRequests.flatMap((r) => [r.question, r.why]),
    ...analysis.settlement.map((l) => l.note),
  ];
  return texts.filter((t) => VERDICT_PATTERNS.some((re) => re.test(t)));
}

// ───────────────────────── 전체 (DB 무관) ─────────────────────────

export async function analyzeMessages(
  messages: CaseMessage[],
  images: CaseImage[],
  prevAnalysis: Analysis | null,
  opts: AnalyzeOptions = {},
): Promise<AnalyzeResult> {
  const failed = new Set<PipelineStep>();

  // 2~3. 이미지·메시지 추출 (동시에)
  // 재분석이면 이전 버전에서 이미 사건을 뽑은 자료(sourceId)는 그 사건을 그대로 쓰고, 새 자료만 추출한다.
  // (같은 대화를 다시 뽑으면 LLM 분류가 조금씩 흔들려 changedFromPrev가 의미를 잃기 때문)
  const prevSourceIds = new Set((prevAnalysis?.events ?? []).flatMap((e) => e.sources.map((s) => s.sourceId)));
  const newMessages = messages.filter((m) => !prevSourceIds.has(m.sourceId));
  const newImages = images.filter((i) => !prevSourceIds.has(i.sourceId));
  const knownSeqs = new Set(messages.map((m) => `${m.sourceId}:${m.seq}`));
  const knownImages = new Set(images.map((i) => i.sourceId));
  const reused = (prevAnalysis?.events ?? [])
    // 지금 자료에 없는 출처를 가리키는 이전 사건은 버린다 (자료가 삭제된 경우)
    .filter((e) => e.sources.every((s) => (s.seqFrom === 0 ? knownImages.has(s.sourceId) : knownSeqs.has(`${s.sourceId}:${s.seqFrom}`))))
    .map(fromPrevEvent);
  const [imageEvents, messageEvents] = await Promise.all([
    Promise.all(newImages.map((img) => extractFromImage(img, failed))).then((x) => x.flat()),
    newMessages.length ? extractEvents(newMessages, failed) : Promise.resolve([]),
  ]);
  const rawEventCount = reused.length + imageEvents.length + messageEvents.length;

  // 4. 정렬·중복 제거·id 부여. 이전 버전과 구조가 같은 사건은 이전 문장을 그대로 써서 화면이 덜 흔들리게 한다
  const prevById = new Map((prevAnalysis?.events ?? []).map((e) => [e.id, e]));
  const events = normalizeEvents([...reused, ...imageEvents, ...messageEvents]).map((e) => {
    const p = prevById.get(e.id);
    return p && eventSignature(p) === eventSignature(e) ? { ...e, what: p.what, sources: p.sources } : e;
  });
  const plainEvents = events.map(stripHints);

  // 5. 충돌·누락
  const conflicts = await detectConflicts(plainEvents, failed);

  // 6. 정산 (코드)
  const settlement0 = settle(events, conflicts);

  // 7. 쟁점 + 요약
  const { issues, summary } = await analyzeIssues(plainEvents, settlement0, conflicts, prevAnalysis?.issues, failed);

  // 8. 증거 요청 → 정산 pending 반영
  const evidence = await requestEvidence(
    plainEvents,
    settlement0,
    issues,
    conflicts,
    prevAnalysis?.evidenceRequests,
    failed,
    prevAnalysis ? plainEvents.filter((e) => !prevById.has(e.id)).map((e) => e.id) : [],
    confirmedTermsText(events, settlement0),
  );
  // 코드 검증: 기본 포함 횟수·추가 수정 단가가 모두 상대방 동의로 확인됐으면 그 합의 자료를 다시 요청하지 않는다
  const policy = buildRevisionPolicy(events);
  if (policy.includedAgreed && policy.unitPriceAgreed) {
    evidence.requests = evidence.requests.filter((r) => {
      const keys = evidence.blockedLines.get(r.id) ?? [];
      const aboutRevisionTerms = /단가|수정\s*횟수|추가\s*수정|회당|포함\s*수정/.test(`${r.question} ${r.why}`);
      const onlyDisputed = keys.length > 0 && keys.every((k) => k === "disputed");
      return !(aboutRevisionTerms && onlyDisputed);
    });
  }
  releasePaymentBlocks(settlement0, evidence);
  const settlement = applyPending(settlement0, evidence.requests, evidence.blockedLines);

  // 9. oneSided: 양측이 함께 만든 자료(room_chat)가 없으면 한쪽 제출 자료
  const shared = new Set(opts.sharedSourceIds ?? []);
  const sourceIds = new Set([...messages.map((m) => m.sourceId), ...images.map((i) => i.sourceId)]);
  const oneSided = ![...sourceIds].some((id) => shared.has(id));

  const draft: Analysis = {
    version: (prevAnalysis?.version ?? 0) + 1,
    events: plainEvents,
    settlement,
    issues,
    evidenceRequests: evidence.requests,
    summary: summary || (plainEvents.length ? "요약을 만들지 못했어요." : "분석할 거래 대화를 찾지 못했어요."),
    oneSided,
    changedFromPrev: [],
  };

  // 10. 이전 버전과 비교
  draft.changedFromPrev = diffAnalysis(prevAnalysis, draft);

  const verdicts = findVerdictLanguage(draft);
  if (verdicts.length) console.warn("[analyzeMessages] 판단 표현 의심:", verdicts);

  return { analysis: AnalysisSchema.parse(draft), failedSteps: [...failed], debug: { rawEventCount, conflicts } };
}

// ───────────────────────── DB 연결 ─────────────────────────
// lib/db.ts(이다은)의 함수로 읽고 쓴다. 이 함수는 저장만 하고 분석은 analyzeMessages가 한다.

export async function runAnalysisDetailed(caseId: string): Promise<AnalyzeResult> {
  const [detail, prev] = await Promise.all([getCase(caseId), getLatestAnalysis(caseId)]);
  if (!detail) throw new Error(`사건을 찾지 못했어요: ${caseId}`);

  // 이미지 source: filename에 Storage 경로가 들어 있다. 하나를 못 읽어도 나머지 분석은 계속한다.
  const imageSources = detail.sources.filter((s) => s.kind === "image" && s.filename);
  const images = (
    await Promise.all(
      imageSources.map(async (s): Promise<CaseImage | null> => {
        try {
          const img = await downloadImage(s.filename!);
          return { sourceId: s.id, data: img.data, mediaType: img.mediaType };
        } catch (e) {
          console.error("[runAnalysis] 이미지 읽기 실패:", s.id, e);
          return null;
        }
      }),
    )
  ).filter((x): x is CaseImage => x !== null);

  // prev가 스키마에 안 맞으면(사람이 고친 JSON 등) 이전 버전 없이 새로 분석하되 version은 이어 간다
  const prevOk = prev && AnalysisSchema.safeParse(prev).success ? prev : null;
  const result = await analyzeMessages(detail.messages, images, prevOk, {
    sharedSourceIds: detail.sources.filter((s) => s.kind === "room_chat").map((s) => s.id),
  });
  if (prev && !prevOk) result.analysis.version = (prev.version ?? 0) + 1;
  if (imageSources.length > images.length) result.failedSteps.push("extractFromImage");

  await saveAnalysis(caseId, result.analysis);
  return result;
}

// analyze API용: 저장한 Analysis(새 버전)를 돌려준다.
// 실패한 단계 목록이 필요하면 runAnalysisDetailed(caseId).failedSteps를 쓴다.
export async function runAnalysis(caseId: string): Promise<Analysis> {
  return (await runAnalysisDetailed(caseId)).analysis;
}
