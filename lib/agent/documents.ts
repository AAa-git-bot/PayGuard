// 담당: 민수빈 | PRD ⑬ 내용증명 초안, ⑭ 용역계약서 초안
//
//   buildNoticeDraft(analysis, dueDate)   ← DB 무관. 정산표 confirmed 미지급액이 없으면 생성 거부
//   buildContractDraft(terms)             ← DB 무관. Terms에 없는 항목은 "[협의 필요]"
//   createNoticeDraft(caseId, dueDate)    ← 최신 분석을 DB에서 읽어 buildNoticeDraft 호출 (저장은 documents API가)
//
// 규칙: 문서는 "초안"만 만든다(발송·제출 안 함). 금액·날짜는 코드가 정한 값만 쓴다 — LLM 초안에
//       다른 금액이 섞이면 버리고 코드 템플릿을 쓴다. LLM은 callStructured()로만 호출한다.
import "server-only";
import { z } from "zod";
import { getLatestAnalysis } from "../db";
import type { Analysis, CaseEvent, Terms } from "../types";
import { callStructured } from "./llm";
import { CONTRACT_DRAFT, NOTICE_DRAFT } from "./prompts";

export const NOTICE_WATERMARK = "초안 — 발송 전 사실관계를 직접 확인하세요";
export const CONTRACT_WATERMARK = "초안 — 서명 전 양측이 내용을 직접 확인하세요";
export const NEED_AGREEMENT = "[협의 필요]";
export const NO_CONFIRMED_UNPAID = "먼저 증거 요청을 해결해 주세요";

export type DraftResult =
  | { ok: true; content: string; source: "llm" | "template" }
  | { ok: false; reason: string };

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;
const md = (iso: string | null) => (iso ? `${Number(iso.slice(0, 4))}년 ${Number(iso.slice(5, 7))}월 ${Number(iso.slice(8, 10))}일` : "날짜 확인 불가");
const seqTag = (e: CaseEvent) => {
  const s = e.sources.filter((x) => x.seqFrom > 0).map((x) => (x.seqFrom === x.seqTo ? `#${x.seqFrom}` : `#${x.seqFrom}~${x.seqTo}`));
  return s.length ? ` (카톡 ${s.join(", ")})` : e.sources.length ? " (이미지 자료)" : "";
};
const DraftSchema = z.object({ markdown: z.string().describe("마크다운 문서 전체") });

// 초안에 쓰인 금액이 모두 허용된 값인지 (예: 400,000원 / 40만 원 / 400000원)
function amountsIn(text: string): number[] {
  const out: number[] = [];
  for (const m of text.matchAll(/(\d[\d,]*)\s*(만\s*)?원/g)) {
    const n = Number(m[1].replace(/,/g, ""));
    if (Number.isFinite(n)) out.push(m[2] ? n * 10_000 : n);
  }
  return out;
}

function withWatermark(markdown: string, watermark: string): string {
  const body = markdown.trim().replace(/^>?\s*\**초안[^\n]*\n+/, ""); // LLM이 쓴 워터마크 줄은 코드 문구로 통일
  return `> **${watermark}**\n\n${body}\n`;
}

// ───────────────────────── ⑬ 내용증명 초안 ─────────────────────────

interface NoticeFacts {
  unpaid: number;
  base: number | null;
  paid: number | null;
  dueDate: string;
  today: string; // 작성일 YYYY-MM-DD
  contract: CaseEvent[];
  performance: CaseEvent[];
  payments: CaseEvent[];
  requests: CaseEvent[];
}

function collectFacts(analysis: Analysis, dueDate: string, today: string): NoticeFacts | { error: string } {
  const unpaidLine = analysis.settlement.find((l) => l.key === "unpaid");
  if (!unpaidLine || unpaidLine.status !== "confirmed" || unpaidLine.amount === null || unpaidLine.amount <= 0)
    return { error: NO_CONFIRMED_UNPAID };
  const line = (k: string) => analysis.settlement.find((l) => l.key === k && l.status === "confirmed")?.amount ?? null;
  const byId = new Map(analysis.events.map((e) => [e.id, e]));
  const baseIds = analysis.settlement.find((l) => l.key === "base")?.eventIds ?? [];
  const paidIds = analysis.settlement.find((l) => l.key === "paid")?.eventIds ?? [];
  return {
    unpaid: unpaidLine.amount,
    base: line("base"),
    paid: line("paid"),
    dueDate,
    today,
    contract: baseIds.map((id) => byId.get(id)).filter((e): e is CaseEvent => !!e),
    performance: analysis.events.filter((e) => e.type === "delivery" && e.who === "me"),
    payments: paidIds
      .map((id) => byId.get(id))
      .filter((e): e is CaseEvent => !!e && e.certainty === "confirmed"),
    // 나의 지급 요청(약속·입금 기록 제외)
    requests: analysis.events.filter(
      (e) => e.who === "me" && (e.type === "other" || e.type === "charge") && /잔금|입금|지급/.test(e.what),
    ),
  };
}

function noticeTemplate(f: NoticeFacts): string {
  const list = (es: CaseEvent[]) =>
    es.length ? es.map((e) => `- ${md(e.eventDate ?? e.sentAt)}: ${e.what}${seqTag(e)}`).join("\n") : "- 확인 불가";
  return [
    `# 내용증명 (미지급 대금 지급 요청)`,
    ``,
    `- 수신: 상대방`,
    `- 발신: 나`,
    ``,
    `## 1. 계약 사실`,
    f.base !== null ? `발신인과 수신인은 아래와 같이 작업 대금 ${won(f.base)}에 합의했습니다.` : `발신인과 수신인은 아래와 같이 작업에 합의했습니다.`,
    list(f.contract),
    ``,
    `## 2. 이행 사실`,
    `발신인은 아래와 같이 작업물을 전달했습니다.`,
    list(f.performance),
    ``,
    `## 3. 미지급 금액`,
    f.base !== null && f.paid !== null
      ? `합의 금액 ${won(f.base)} 중 확인된 지급액 ${won(f.paid)}을 제외한 **${won(f.unpaid)}**이 지급되지 않았습니다.`
      : `확인된 미지급 금액은 **${won(f.unpaid)}**입니다.`,
    f.payments.length ? list(f.payments) : "",
    f.requests.length ? `\n발신인은 아래와 같이 지급을 요청했습니다.\n${list(f.requests)}` : "",
    ``,
    `## 4. 지급 요청 기한`,
    `${md(f.dueDate)}까지 위 금액을 지급해 주시기 바랍니다.`,
    ``,
    `## 5. 미이행 시 조치 예정`,
    `기한까지 지급되지 않으면 관련 기관의 상담·조정 절차 등 법적 절차를 검토할 예정입니다.`,
    ``,
    `작성일: ${md(f.today)}`,
    `발신인: 나`,
  ]
    .filter((l, i, arr) => !(l === "" && arr[i - 1] === ""))
    .join("\n");
}

const kstToday = () => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(new Date());

export async function buildNoticeDraft(analysis: Analysis, dueDate: string, today = kstToday()): Promise<DraftResult> {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dueDate) || Number.isNaN(Date.parse(dueDate)))
    return { ok: false, reason: "지급 요청 기한을 날짜(YYYY-MM-DD)로 입력해 주세요" };
  const facts = collectFacts(analysis, dueDate, today);
  if ("error" in facts) return { ok: false, reason: facts.error };

  const template = noticeTemplate(facts);
  const allowed = new Set([facts.unpaid, facts.base, facts.paid].filter((n): n is number => n !== null));
  const res = await callStructured({
    schema: DraftSchema,
    instructions: NOTICE_DRAFT,
    prompt: [
      `아래 [확정 정보]만 사용해 내용증명 초안을 다듬어라. 금액·날짜·사실을 바꾸거나 더하지 않는다. "나", "상대방"으로만 부른다.`,
      `미지급 금액은 ${won(facts.unpaid)}, 지급 요청 기한은 ${md(dueDate)}다. 다른 금액(추가 수정비 등 다툼이 있는 금액)은 쓰지 않는다.`,
      `[확정 정보 — 코드가 만든 초안]\n${template}`,
    ].join("\n\n"),
    fallback: { markdown: "" },
  });

  const draft = res.data.markdown;
  const amountsOk = amountsIn(draft).every((n) => allowed.has(n));
  const hasRequired = amountsIn(draft).includes(facts.unpaid) && draft.includes(md(dueDate));
  if (res.ok && draft.trim() && amountsOk && hasRequired)
    return { ok: true, content: withWatermark(draft, NOTICE_WATERMARK), source: "llm" };
  if (res.ok) console.warn("[buildNoticeDraft] LLM 초안이 확정 금액·기한과 달라 템플릿을 씀", { amountsOk, hasRequired });
  return { ok: true, content: withWatermark(template, NOTICE_WATERMARK), source: "template" };
}

// ───────────────────────── ⑭ 용역계약서 초안 ─────────────────────────

function contractTemplate(t: Partial<Terms>): string {
  const v = (x: string | number | null | undefined, f: (y: never) => string = (y) => String(y)) =>
    x === null || x === undefined || x === "" ? NEED_AGREEMENT : f(x as never);
  return [
    `# 용역계약서`,
    ``,
    `프리랜서(이하 "수급인")와 의뢰인(이하 "도급인")은 아래와 같이 용역 계약을 맺는다.`,
    ``,
    `## 제1조 (작업 범위)`,
    v(t.scope),
    ``,
    `## 제2조 (수정 횟수)`,
    `기본 포함 수정: ${v(t.revisionsIncluded, (n: number) => `${n}회`)}`,
    `기본 횟수를 넘는 수정의 1회 단가: ${NEED_AGREEMENT}`,
    ``,
    `## 제3조 (납기)`,
    v(t.deadline, (d: string) => md(d)),
    ``,
    `## 제4조 (대금과 지급 시기)`,
    `대금: ${v(t.price, (n: number) => won(n))}`,
    `지급 시기: ${v(t.paymentTerms)}`,
    ``,
    `## 제5조 (중도 취소 시 정산)`,
    NEED_AGREEMENT,
    ``,
    `## 제6조 (저작권 귀속)`,
    NEED_AGREEMENT,
    ``,
    `수급인: 프리랜서 (서명)          도급인: 의뢰인 (서명)`,
  ].join("\n");
}

export async function buildContractDraft(terms: Partial<Terms>): Promise<DraftResult> {
  const template = contractTemplate(terms);
  const allowed = new Set([terms.price].filter((n): n is number => typeof n === "number"));
  const res = await callStructured({
    schema: DraftSchema,
    instructions: CONTRACT_DRAFT,
    prompt: [
      `아래 [확정 조건 초안]을 자연스러운 계약서 문장으로 다듬어라. 값이 "${NEED_AGREEMENT}"인 항목은 그대로 "${NEED_AGREEMENT}"로 둔다.`,
      `금액·횟수·날짜를 바꾸거나 새로 만들지 않는다. 항목 순서와 조 번호는 유지한다.`,
      `[확정 조건]\n${JSON.stringify(terms)}`,
      `[확정 조건 초안]\n${template}`,
    ].join("\n\n"),
    fallback: { markdown: "" },
  });
  const draft = res.data.markdown;
  const needCount = (s: string) => s.split(NEED_AGREEMENT).length - 1;
  const ok =
    res.ok &&
    draft.trim() !== "" &&
    amountsIn(draft).every((n) => allowed.has(n)) &&
    needCount(draft) >= needCount(template); // 빈 항목을 지어내지 않았는지
  if (ok) return { ok: true, content: withWatermark(draft, CONTRACT_WATERMARK), source: "llm" };
  if (res.ok) console.warn("[buildContractDraft] LLM 초안이 확정 조건과 달라 템플릿을 씀");
  return { ok: true, content: withWatermark(template, CONTRACT_WATERMARK), source: "template" };
}

// ───────────────────────── DB 연결 ─────────────────────────
// documents API(POST /api/cases/[id]/documents {kind:"notice_draft", dueDate})가 부른다.
// ok=false면 reason을 그대로 화면에 보여 주고(예: "먼저 증거 요청을 해결해 주세요"), ok=true면 content를 documents 테이블에 저장한다.
// 저장: lib/db.ts saveDocument(caseId, kind, content) (이다은)

export async function createNoticeDraft(caseId: string, dueDate: string): Promise<DraftResult> {
  const analysis = await getLatestAnalysis(caseId);
  if (!analysis) return { ok: false, reason: "먼저 분석을 실행해 주세요" };
  return buildNoticeDraft(analysis, dueDate);
}
