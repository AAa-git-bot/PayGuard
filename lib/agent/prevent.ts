// 담당: 민수빈 | PRD 7-4 예방 모드 에이전트
//
//   preventAgent({ messages, terms, today })  ← DB와 무관 (스크립트·API 공용). 무엇을 게시할지 정한다.
//   onRoomMessage(roomId, messageId)          ← DB에서 읽어 preventAgent 호출 후 AI 메시지를 게시만 한다.
//
// 규칙: 사람 메시지에만 반응(sender="ai"면 바로 return, 무한 루프 방지). 할 말이 없으면 아무것도 게시하지 않는다.
//       LLM은 callStructured()로만, 넘기는 텍스트는 maskText()를 거친다. AI는 조언만 하고 대신 답하거나 막지 않는다.
import "server-only";
import { z } from "zod";
import { getLatestRoomTerms, getRecentRoomMessages, getRoomMessage, insertRoomMessage } from "../db";
import { maskText } from "../mask";
import { TermsSchema, type Terms } from "../types";
import { callStructured } from "./llm";
import { PREVENT_AGENT, PREVENT_AGENT_GUIDE } from "./prompts";

export const RECENT_LIMIT = 40;

export type RoomSender = "freelancer" | "client" | "ai";
export type RoomMessageKind = "text" | "terms_card" | "alert" | "question_suggestion";

export interface RoomMessage {
  id: string;
  sender: RoomSender;
  kind: RoomMessageKind;
  text: string;
  payload: unknown;
  createdAt: string | null;
}

export type TermsUpdate = Partial<Pick<Terms, "scope" | "revisionsIncluded" | "deadline" | "price" | "paymentTerms">>;

export interface PreventResult {
  termsUpdate: TermsUpdate | null;
  changeAlert: string | null;
  vagueQuestion: string | null;
}

// terms_card 메시지의 payload. 양측이 모두 확인하면 이 terms를 room_terms에 새 version으로 저장한다 (terms API, 이다은)
export interface TermsCardPayload {
  terms: Terms; // 확정 조건 + 이번 변경을 합친 "제안" 조건 (confirmed 플래그는 둘 다 false)
  changed: (keyof TermsUpdate)[]; // 이번에 바뀐 항목 (카드에서 강조용)
}

export interface PostPlan {
  kind: Exclude<RoomMessageKind, "text">;
  text: string;
  payload: TermsCardPayload | null;
}

const NONE: PreventResult = { termsUpdate: null, changeAlert: null, vagueQuestion: null };
const TERM_KEYS = ["scope", "revisionsIncluded", "deadline", "price", "paymentTerms"] as const;

// ───────────────────────── 유틸 ─────────────────────────

const won = (n: number) => n.toLocaleString("ko-KR");
const senderLabel = (s: RoomSender) => (s === "freelancer" ? "프리랜서" : s === "client" ? "의뢰인" : "AI");
const kstDate = (d: Date) => new Intl.DateTimeFormat("sv-SE", { timeZone: "Asia/Seoul" }).format(d);
const kstDateTime = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  return new Intl.DateTimeFormat("sv-SE", {
    timeZone: "Asia/Seoul",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(d);
};

// 두 문장 이내로 자른다 (PRD: 말은 두 문장 이내)
function twoSentences(s: string | null): string | null {
  const t = s?.trim();
  if (!t) return null;
  const parts = t.match(/[^.!?。？！]+[.!?。？！]?/g) ?? [t];
  return parts.slice(0, 2).join("").trim().slice(0, 200) || null;
}

export function formatTerms(t: Partial<Terms>): string {
  const lines: string[] = [];
  if (t.scope) lines.push(`작업 범위: ${t.scope}`);
  if (t.price != null) lines.push(`금액: ${won(t.price)}원`);
  if (t.paymentTerms) lines.push(`지급: ${t.paymentTerms}`);
  if (t.revisionsIncluded != null) lines.push(`수정: ${t.revisionsIncluded}회 포함`);
  if (t.deadline) lines.push(`납기: ${t.deadline}`);
  return lines.join("\n");
}

// 모호한 표현 (LLM이 놓쳐도 시연 시나리오가 동작하도록 코드로도 잡는다)
const VAGUE_TIME = /(다음\s*주쯤|이번\s*주쯤|주말쯤|월말쯤|조만간|끝나면|여유\s*있을\s*때)/;
const VAGUE_AMOUNT = /(대충|적당히|알아서)/;

// 받침이 있으면 "은", 없으면 "는"
const topic = (word: string) => {
  const code = word.charCodeAt(word.length - 1) - 0xac00;
  return code >= 0 && code <= 11171 && code % 28 !== 0 ? "은" : "는";
};

function vagueFallback(text: string): { word: string; question: string } | null {
  const t = text.match(VAGUE_TIME)?.[0];
  if (t) return { word: t, question: `"${t}"${topic(t)} 며칠인가요? 날짜를 정해두면 좋아요.` };
  const a = text.match(VAGUE_AMOUNT)?.[0];
  if (a) return { word: a, question: `"${a}"${topic(a)} 어느 정도인가요? 범위나 금액을 정해두면 좋아요.` };
  return null;
}

// ───────────────────────── LLM 호출 ─────────────────────────

const PreventOutputSchema = z.object({
  termsUpdate: z
    .object({
      scope: z.string().nullable(),
      revisionsIncluded: z.number().int().nullable(),
      deadline: z.string().nullable().describe("YYYY-MM-DD"),
      price: z.number().int().nullable().describe("원 단위 정수"),
      paymentTerms: z.string().nullable(),
    })
    .nullable(),
  changeAlert: z.string().nullable(),
  vagueQuestion: z.string().nullable(),
});

export async function preventAgent(input: {
  messages: RoomMessage[]; // 오래된 순, 최근 RECENT_LIMIT개
  terms: Terms | null; // 양측이 확정한 최신 조건
  today?: Date;
}): Promise<PreventResult & { ok: boolean }> {
  const recent = input.messages.slice(-RECENT_LIMIT);
  const lastHuman = [...recent].reverse().find((m) => m.sender !== "ai" && m.kind === "text");
  if (!lastHuman) return { ...NONE, ok: true };

  const today = kstDate(input.today ?? new Date());
  const lines = recent.map((m) => {
    const tag = m.kind === "text" ? "" : `(${m.kind}) `;
    return `[${kstDateTime(m.createdAt)}] ${senderLabel(m.sender)}: ${tag}${maskText(m.text).text}`;
  });
  const res = await callStructured({
    schema: PreventOutputSchema,
    instructions: PREVENT_AGENT,
    prompt: [
      PREVENT_AGENT_GUIDE,
      `[오늘 날짜] ${today}`,
      `[확정된 조건] ${input.terms ? JSON.stringify(pickTerms(input.terms)) : "아직 없음"}`,
      `[최근 대화 (오래된 순)]\n${lines.join("\n")}`,
    ].join("\n\n"),
    fallback: { termsUpdate: null, changeAlert: null, vagueQuestion: null },
  });

  const raw = res.data;
  const termsUpdate = cleanUpdate(raw.termsUpdate, input.terms);
  // 확정 조건이 없으면 "확정 조건과 다른 요청"도 있을 수 없다
  const changeAlert = input.terms ? twoSentences(raw.changeAlert) : null;
  let vagueQuestion = twoSentences(raw.vagueQuestion);
  // 코드 보완: 최근 사람 메시지에 모호한 표현이 있는데 LLM이 놓쳤으면 기본 질문을 제안한다
  const vague = vagueFallback(lastHuman.text);
  if (!vagueQuestion && vague) vagueQuestion = vague.question;
  // 코드 보완: 최근 메시지에 없는 표현을 묻는 질문은 버린다 (AI가 매번 말하지 않게)
  const quoted = vagueQuestion?.match(/["“'‘]([^"”'’]{1,20})["”'’]/)?.[1];
  // 날짜·금액·범위에 대한 질문만 남긴다 (디자인 세부 표현 "둥글게", "작게"는 묻지 않음)
  const aboutTerms = /날짜|기한|납기|언제|며칠|금액|비용|얼마|범위|횟수|몇\s*번/.test(vagueQuestion ?? "");
  if (vagueQuestion && !vague && (!quoted || !lastHuman.text.includes(quoted) || !aboutTerms)) vagueQuestion = null;

  return { termsUpdate, changeAlert, vagueQuestion, ok: res.ok };
}

function pickTerms(t: Terms) {
  return {
    scope: t.scope,
    revisionsIncluded: t.revisionsIncluded,
    deadline: t.deadline,
    price: t.price,
    paymentTerms: t.paymentTerms,
  };
}

// null 항목·확정 조건과 같은 항목·형식이 틀린 항목을 버린다. 남는 게 없으면 null
function cleanUpdate(raw: z.infer<typeof PreventOutputSchema>["termsUpdate"], current: Terms | null): TermsUpdate | null {
  if (!raw) return null;
  const out: TermsUpdate = {};
  if (raw.scope?.trim() && raw.scope.trim() !== current?.scope) out.scope = raw.scope.trim();
  if (raw.revisionsIncluded != null && raw.revisionsIncluded >= 0 && raw.revisionsIncluded !== current?.revisionsIncluded)
    out.revisionsIncluded = raw.revisionsIncluded;
  const d = raw.deadline?.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (d) {
    const iso = `${d[1]}-${d[2].padStart(2, "0")}-${d[3].padStart(2, "0")}`;
    if (iso !== current?.deadline) out.deadline = iso;
  }
  if (raw.price != null && raw.price > 0 && raw.price !== current?.price) out.price = raw.price;
  if (raw.paymentTerms?.trim() && raw.paymentTerms.trim() !== current?.paymentTerms) out.paymentTerms = raw.paymentTerms.trim();
  return Object.keys(out).length ? out : null;
}

// ───────────────────────── 무엇을 게시할지 (DB 무관) ─────────────────────────

export function emptyTerms(): Terms {
  return {
    scope: null,
    revisionsIncluded: null,
    deadline: null,
    price: null,
    paymentTerms: null,
    confirmedByFreelancer: false,
    confirmedByClient: false,
    version: 0,
  };
}

// 확정 조건 + 변경 → 새 제안 조건. 확인 플래그는 둘 다 false로 초기화 (PRD 7-4 3단계)
export function proposeTerms(current: Terms | null, update: TermsUpdate): Terms {
  const base = current ?? emptyTerms();
  return TermsSchema.parse({
    ...base,
    ...update,
    confirmedByFreelancer: false,
    confirmedByClient: false,
    version: base.version + 1,
  });
}

// 직전에 올린 terms_card가 아직 확인되지 않았고 내용이 같으면 다시 올리지 않는다
function sameAsPendingCard(next: Terms, recent: RoomMessage[]): boolean {
  const lastCard = [...recent].reverse().find((m) => m.kind === "terms_card");
  const prevTerms = (lastCard?.payload as TermsCardPayload | null)?.terms;
  if (!prevTerms) return false;
  return JSON.stringify(pickTerms(prevTerms)) === JSON.stringify(pickTerms(next));
}

// 직전 AI 메시지와 같은 말을 반복하지 않는다
function alreadySaid(kind: PostPlan["kind"], text: string, recent: RoomMessage[]): boolean {
  return recent.slice(-6).some((m) => m.sender === "ai" && m.kind === kind && m.text.trim() === text.trim());
}

export function planPosts(result: PreventResult, current: Terms | null, recent: RoomMessage[]): PostPlan[] {
  const posts: PostPlan[] = [];
  if (result.termsUpdate) {
    const terms = proposeTerms(current, result.termsUpdate);
    if (!sameAsPendingCard(terms, recent)) {
      const changed = Object.keys(result.termsUpdate) as (keyof TermsUpdate)[];
      posts.push({
        kind: "terms_card",
        text: `조건을 정리했어요. 맞으면 두 분 모두 확인을 눌러 주세요.\n${formatTerms(terms)}`,
        payload: { terms, changed: TERM_KEYS.filter((k) => changed.includes(k)) },
      });
    }
  }
  if (result.changeAlert && !alreadySaid("alert", result.changeAlert, recent))
    posts.push({ kind: "alert", text: result.changeAlert, payload: null });
  if (result.vagueQuestion && !alreadySaid("question_suggestion", result.vagueQuestion, recent))
    posts.push({ kind: "question_suggestion", text: result.vagueQuestion, payload: null });
  return posts;
}

// ───────────────────────── DB 연결 ─────────────────────────
// 쿼리는 lib/db.ts (이다은): getRoomMessage · getRecentRoomMessages · getLatestRoomTerms · insertRoomMessage

async function insertAiMessage(roomId: string, post: PostPlan): Promise<void> {
  await insertRoomMessage(roomId, { sender: "ai", kind: post.kind, text: post.text, payload: post.payload });
}

// 메시지 API(POST /api/rooms/[id]/messages)가 사람 메시지를 저장한 뒤 부른다.
// 응답을 늦추지 않으려면 await 없이 실행해도 된다: `void onRoomMessage(roomId, id).catch(console.error)`
export async function onRoomMessage(roomId: string, messageId: string): Promise<PreventResult> {
  const message = await getRoomMessage(roomId, messageId);
  if (!message || message.sender === "ai" || message.kind !== "text") return NONE; // 사람 메시지에만 반응

  const [recent, terms] = await Promise.all([getRecentRoomMessages(roomId, RECENT_LIMIT), getLatestRoomTerms(roomId)]);
  const { ok, ...result } = await preventAgent({ messages: recent, terms });
  if (!ok) console.error("[onRoomMessage] 에이전트 호출 실패 — 이번 메시지는 건너뜀");

  for (const post of planPosts(result, terms, recent)) await insertAiMessage(roomId, post);
  return result;
}
