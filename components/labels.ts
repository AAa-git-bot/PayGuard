import type { Certainty, EventType, Party } from "@/lib/types";

export const PARTY_LABEL: Record<Party, string> = {
  me: "나",
  counterparty: "상대방",
  ai: "AI",
  unknown: "확인 불가",
};

export const EVENT_LABEL: Record<EventType, string> = {
  promise: "약속",
  change_request: "변경 요청",
  change_accept: "변경 동의",
  delivery: "납품",
  revision_request: "수정 요청",
  payment: "입금",
  charge: "청구",
  cancel_refund: "취소·환불",
  complaint: "불만",
  other: "기타",
};

export const CERTAINTY_LABEL: Record<Certainty, string> = {
  confirmed: "확인됨",
  claimed: "주장",
  unverified: "확인 불가",
};

export function won(amount: number | null) {
  if (amount == null) return null;
  return `${amount.toLocaleString("ko-KR")}원`;
}

export function monthDay(iso: string | null) {
  if (!iso) return null;
  const [year, month, day] = iso.slice(0, 10).split("-");
  if (!year || !month || !day) return null;
  return `${Number(month)}/${Number(day)}`;
}

export function sourceChip(seqFrom: number, seqTo: number) {
  return seqFrom === seqTo ? `채팅 #${seqFrom}` : `채팅 #${seqFrom}~${seqTo}`;
}

// 이미지 자료(이체 내역·영수증)에서 온 출처는 seqFrom이 0이다 → "이미지"
export function isImageSource(source: { sourceId: string; seqFrom: number }, textSourceIds?: Set<string>) {
  return source.seqFrom <= 0 || (textSourceIds != null && !textSourceIds.has(source.sourceId));
}

export function sourceLabel(
  source: { sourceId: string; seqFrom: number; seqTo: number },
  textSourceIds?: Set<string>,
) {
  return isImageSource(source, textSourceIds) ? "이미지" : sourceChip(source.seqFrom, source.seqTo);
}

// ───────── 날짜·시간 (한국 시간 기준) ─────────
const KST = "Asia/Seoul";
const WEEKDAY = ["일", "월", "화", "수", "목", "금", "토"];

// "2026-06-02" (날짜만) 또는 ISO 시각 → 한국 날짜 "2026-06-02"
export function kstDayKey(value: string | null): string | null {
  if (!value) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return value;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Intl.DateTimeFormat("sv-SE", { timeZone: KST }).format(date);
}

// "2026-06-02" → "6월 2일 (화)"
export function dayHeading(dayKey: string) {
  const [y, m, d] = dayKey.split("-").map(Number);
  const weekday = WEEKDAY[new Date(Date.UTC(y, m - 1, d)).getUTCDay()];
  return `${m}월 ${d}일 (${weekday})`;
}

// ISO 시각 → "오후 2:15" (한국 시간)
export function kstTime(iso: string | null): string | null {
  if (!iso || /^\d{4}-\d{2}-\d{2}$/.test(iso)) return null;
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return null;
  // 서버(Node)와 브라우저의 지역 설정이 달라도 같은 글자가 나오도록 숫자만 받아 직접 만든다 (hydration 불일치 방지)
  const parts = new Intl.DateTimeFormat("en-US", { timeZone: KST, hour: "numeric", minute: "2-digit", hour12: false }).formatToParts(date);
  const hour = Number(parts.find((p) => p.type === "hour")?.value ?? 0) % 24;
  const minute = parts.find((p) => p.type === "minute")?.value ?? "00";
  return `${hour < 12 ? "오전" : "오후"} ${hour % 12 === 0 ? 12 : hour % 12}:${minute}`;
}

// ISO 시각 또는 날짜 → "6/2" (한국 날짜)
export function kstMonthDay(value: string | null) {
  return monthDay(kstDayKey(value));
}

// ───────── 색 ─────────
export const CERTAINTY_STYLE: Record<Certainty, string> = {
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  claimed: "bg-amber-50 text-amber-800 ring-amber-600/20",
  unverified: "bg-muted text-muted-foreground ring-foreground/10",
};

export const STATUS_LABEL = { confirmed: "확인됨", pending: "결론 보류", unverifiable: "확인 불가" } as const;
export const STATUS_STYLE = {
  confirmed: "bg-emerald-50 text-emerald-700 ring-emerald-600/20",
  pending: "bg-amber-50 text-amber-800 ring-amber-600/20",
  unverifiable: "bg-muted text-muted-foreground ring-foreground/10",
} as const;

export const PILL = "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset";

// ───────── 정산 메모 ─────────
// note는 " · "로 이어진 문장들. "결론 보류(…): 질문" / "결론 보류: 질문" 부분은 필요한 자료(증거 요청)로 따로 뺀다.
// 괄호 안의 내부 id(req-…, evreq-…)는 화면에 보이지 않게 한다.
export function splitNote(note: string): { notes: string[]; needs: string[] } {
  const notes: string[] = [];
  const needs: string[] = [];
  for (const part of note.split(" · ").map((p) => p.trim()).filter(Boolean)) {
    const m = part.match(/^결론 보류(?:\s*\([^)]*\))?\s*:\s*(.+)$/);
    if (m) needs.push(m[1]);
    else notes.push(part);
  }
  return { notes, needs };
}

// ───────── 출처 표시 "(#12)", "(#12~14)", "(채팅 #3~4, #6)" ─────────
export type CitedPart = { text: string } | { from: number; to: number };
export function splitCitations(text: string): CitedPart[] {
  const out: CitedPart[] = [];
  const re = /\((?:(?:카톡|채팅)\s*)?(#\d+(?:\s*[~\-–]\s*#?\d+)?(?:\s*,\s*#?\d+(?:\s*[~\-–]\s*#?\d+)?)*)\)/g;
  let last = 0;
  for (const m of text.matchAll(re)) {
    const before = text.slice(last, m.index).trimEnd();
    if (before) out.push({ text: before });
    for (const piece of m[1].split(",")) {
      const r = piece.match(/#?(\d+)(?:\s*[~\-–]\s*#?(\d+))?/);
      if (r) out.push({ from: Number(r[1]), to: Number(r[2] ?? r[1]) });
    }
    last = (m.index ?? 0) + m[0].length;
  }
  const rest = text.slice(last).trim();
  if (rest) out.push({ text: rest });
  return out.length ? out : [{ text }];
}
