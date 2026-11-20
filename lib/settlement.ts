// 담당: 민수빈 | 정산 계산 (PRD 7-3) — 순수 함수, LLM을 쓰지 않는다
import type { CaseEvent, SettlementLine } from "./types";

const won = (n: number) => n.toLocaleString("ko-KR");

const byDate = (e: CaseEvent) => e.eventDate ?? e.sentAt ?? "";

export function computeSettlement(
  events: CaseEvent[],
  opts: { receiptEventIds?: string[]; conflicts?: { eventIds: string[]; note: string }[] } = {},
): SettlementLine[] {
  const sorted = [...events].sort((a, b) => byDate(a).localeCompare(byDate(b)));
  const lines: SettlementLine[] = [];

  // base: 가장 최근 promise 중 금액 있고 상대 동의한 것
  const promises = sorted.filter((e) => e.type === "promise" && e.amount !== null);
  const agreed = promises.filter((e) => e.agreedByOther === "yes");
  const baseEvent = agreed.at(-1) ?? promises.at(-1) ?? null;
  const baseAgreed = baseEvent !== null && baseEvent.agreedByOther === "yes";
  const base = baseEvent?.amount ?? null;
  lines.push({
    key: "base",
    label: "기본 계약 금액",
    amount: base,
    formula: base !== null ? `${won(base)}` : "확인 불가",
    eventIds: baseEvent ? [baseEvent.id] : [],
    status: base === null ? "unverifiable" : baseAgreed ? "confirmed" : "unverifiable",
    note: base === null ? "금액 합의를 찾지 못했어요" : baseAgreed ? "" : "상대방 동의 확인 안 됨",
  });

  // paid: confirmed 입금만 합산, claimed는 note로 별도 표기
  const payments = sorted.filter((e) => e.type === "payment" && e.amount !== null);
  const confirmedPays = payments.filter((e) => e.certainty === "confirmed");
  const claimedPays = payments.filter((e) => e.certainty !== "confirmed");
  const paid = confirmedPays.length ? confirmedPays.reduce((s, e) => s + (e.amount ?? 0), 0) : null;
  const claimedSum = claimedPays.reduce((s, e) => s + (e.amount ?? 0), 0);
  lines.push({
    key: "paid",
    label: "확인된 지급액",
    amount: paid,
    formula: confirmedPays.length ? confirmedPays.map((e) => won(e.amount ?? 0)).join(" + ") : "확인 불가",
    eventIds: confirmedPays.map((e) => e.id),
    status: paid === null ? "unverifiable" : "confirmed",
    note: claimedPays.length ? `주장만 있음: ${won(claimedSum)}원 (이체 내역 필요)` : "",
  });

  // unpaid: base - paid, 납품 기록이 없으면 pending
  const hasDelivery = sorted.some((e) => e.type === "delivery");
  const unpaid = base !== null && paid !== null ? base - paid : null;
  lines.push({
    key: "unpaid",
    label: "정산상 미지급액",
    amount: unpaid,
    formula: unpaid !== null ? `${won(base!)} - ${won(paid!)} = ${won(unpaid)}` : "확인 불가",
    eventIds: [...(baseEvent ? [baseEvent.id] : []), ...confirmedPays.map((e) => e.id)],
    status: unpaid === null ? "unverifiable" : !hasDelivery ? "pending" : baseAgreed ? "confirmed" : "unverifiable",
    note: !hasDelivery ? "납품 완료 여부 확인 필요" : "",
  });

  // disputed: 상대가 동의하지 않은 추가 청구
  const charges = sorted.filter((e) => e.type === "charge" && e.agreedByOther !== "yes");
  const knownCharges = charges.filter((e) => e.amount !== null);
  const disputed = knownCharges.length ? knownCharges.reduce((s, e) => s + (e.amount ?? 0), 0) : null;
  if (charges.length) {
    lines.push({
      key: "disputed",
      label: "다툼이 있는 추가금",
      amount: disputed,
      formula: knownCharges.length ? knownCharges.map((e) => won(e.amount ?? 0)).join(" + ") : "단가 미정",
      eventIds: charges.map((e) => e.id),
      status: "unverifiable",
      note: "상대방 동의가 확인되지 않은 청구예요",
    });
  }

  // extra_expense: 영수증 이미지에서 온 지출
  const receiptIds = new Set(opts.receiptEventIds ?? []);
  const expenses = sorted.filter((e) => receiptIds.has(e.id) && e.amount !== null);
  if (expenses.length) {
    const sum = expenses.reduce((s, e) => s + (e.amount ?? 0), 0);
    lines.push({
      key: "extra_expense",
      label: "실제 추가 지출",
      amount: sum,
      formula: expenses.map((e) => won(e.amount ?? 0)).join(" + "),
      eventIds: expenses.map((e) => e.id),
      status: "confirmed",
      note: "지출 확인과 배상 가능 여부는 별개예요",
    });
  }

  // unknown: 서로 모순되는 금액
  for (const c of opts.conflicts ?? []) {
    lines.push({
      key: "unknown",
      label: "확인 불가 금액",
      amount: null,
      formula: "확인 불가",
      eventIds: c.eventIds,
      status: "unverifiable",
      note: c.note,
    });
  }

  return lines;
}
