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
  return seqFrom === seqTo ? `카톡 #${seqFrom}` : `카톡 #${seqFrom}~${seqTo}`;
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
