// 담당: 민수빈 | 정산 계산 (PRD 7-3) — 순수 함수, LLM을 쓰지 않는다
import type { CaseEvent, SettlementLine } from "./types";

const won = (n: number) => n.toLocaleString("ko-KR");

// eventDate(사건일) 우선, 같은 날이면 보낸 시각 순
const sortKey = (e: CaseEvent) => `${e.eventDate ?? e.sentAt?.slice(0, 10) ?? ""}|${e.sentAt ?? ""}`;

export interface RevisionPolicy {
  included: number | null; // 기본 포함 수정 횟수
  includedEventIds: string[];
  includedAgreed: boolean; // 기본 포함 횟수에 상대방이 명시적으로 동의했는지
  unitPrice: number | null; // 추가 수정 1회 단가
  unitPriceEventIds: string[];
  unitPriceAgreed: boolean; // 단가에 상대방이 명시적으로 동의했는지
}

export interface SettlementOptions {
  receiptEventIds?: string[]; // 영수증 이미지에서 온 지출 이벤트
  conflicts?: { eventIds: string[]; note: string }[]; // 서로 모순되는 금액
  baseCandidateIds?: string[]; // 주어지면 이 promise들 중에서만 base를 고른다 (선금·단가 약속 제외용)
  revisionPolicy?: RevisionPolicy; // 수정 횟수 초과분 계산용 (곱셈도 코드가 한다)
}

export function computeSettlement(events: CaseEvent[], opts: SettlementOptions = {}): SettlementLine[] {
  const sorted = [...events].sort((a, b) => sortKey(a).localeCompare(sortKey(b)));
  const lines: SettlementLine[] = [];

  // base: 가장 최근 promise 중 금액 있고 상대 동의한 것
  const baseIds = opts.baseCandidateIds ? new Set(opts.baseCandidateIds) : null;
  const promises = sorted.filter(
    (e) => e.type === "promise" && e.amount !== null && (baseIds === null || baseIds.has(e.id)),
  );
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
    eventIds: [...confirmedPays, ...claimedPays].map((e) => e.id),
    status: paid === null ? "unverifiable" : "confirmed",
    note: claimedPays.length ? `주장만 있음: ${won(claimedSum)}원 (이체 내역 필요)` : "",
  });

  // unpaid: base - paid, 납품 기록이 없으면 pending
  const hasDelivery = sorted.some((e) => e.type === "delivery");
  const unpaid = base !== null && paid !== null ? base - paid : null;
  const unpaidNotes: string[] = [];
  if (!hasDelivery) unpaidNotes.push("납품 완료 여부 확인 필요");
  if (base !== null && !baseAgreed) unpaidNotes.push("기본 금액에 대한 상대방 동의 확인 안 됨");
  if (paid === null) unpaidNotes.push("확인된 입금 내역이 없어 계산할 수 없어요");
  lines.push({
    key: "unpaid",
    label: "정산상 미지급액",
    amount: unpaid,
    formula: unpaid !== null ? `${won(base!)} - ${won(paid!)} = ${won(unpaid)}` : "확인 불가",
    eventIds: [...(baseEvent ? [baseEvent.id] : []), ...confirmedPays.map((e) => e.id)],
    status: unpaid === null ? "unverifiable" : !hasDelivery ? "pending" : baseAgreed ? "confirmed" : "unverifiable",
    note: unpaidNotes.join(" · "),
  });

  // disputed: 상대가 동의하지 않은 추가 청구 + 기본 포함 횟수를 넘은 수정분
  const charges = sorted.filter((e) => e.type === "charge" && e.agreedByOther !== "yes");
  const knownCharges = charges.filter((e) => e.amount !== null);
  const policy = opts.revisionPolicy;
  // 수정 회차: 같은 날 연달아 온 수정 요청(사이에 납품 없음)은 1회차로 묶고, 날짜가 바뀌거나 납품이 있었으면 새 회차.
  // 첫 납품 뒤 상대방의 금액 없는 변경 요청(예: "방향을 바꿔볼게요")도 완성 시안에 대한 수정으로 센다.
  const day = (e: CaseEvent) => e.eventDate ?? e.sentAt?.slice(0, 10) ?? "";
  const rounds: CaseEvent[][] = [];
  let open = false;
  let delivered = false;
  for (const e of sorted) {
    if (e.type === "delivery") {
      open = false;
      delivered = true;
      continue;
    }
    const isRevision =
      e.type === "revision_request" ||
      (e.type === "change_request" && e.who === "counterparty" && e.amount === null && delivered);
    if (!isRevision) continue;
    const last = rounds.at(-1);
    if (open && last && day(last[0]) === day(e)) last.push(e);
    else {
      rounds.push([e]);
      open = true;
    }
  }
  const extraRounds = policy?.included != null && rounds.length > policy.included ? rounds.slice(policy.included) : [];
  const extraRevisions = extraRounds.map((r) => r[0]);

  if (charges.length || extraRevisions.length) {
    const parts: string[] = [];
    let total: number | null = 0;
    const notes: string[] = [];

    if (extraRevisions.length) {
      const n = extraRevisions.length;
      const from = policy!.included! + 1;
      const range = n === 1 ? `${from}회차` : `${from}~${from + n - 1}회차`;
      if (policy!.unitPrice !== null) {
        const sub = n * policy!.unitPrice;
        parts.push(`${n}회 × ${won(policy!.unitPrice)} = ${won(sub)}`);
        total += sub;
        notes.push(
          policy!.unitPriceAgreed
            ? `기본 ${policy!.included}회를 넘은 수정 ${range} 기준이에요. 단가 합의 기록은 있지만, 이 수정을 추가 작업으로 볼지는 쟁점이에요`
            : `기본 ${policy!.included}회를 넘은 수정 ${range} 기준이에요. 단가에 대한 상대방 동의는 확인되지 않았어요`,
        );
      } else {
        parts.push(`${n}회 × 단가 미정`);
        total = null;
        notes.push(`기본 ${policy!.included}회를 넘은 수정 ${range}가 있지만 추가 수정 단가를 정한 기록이 없어요`);
      }
    }
    if (extraRevisions.length && !policy!.includedAgreed) notes.push("기본 포함 수정 횟수에 대한 상대방 동의는 확인되지 않았어요");
    if (knownCharges.length) {
      parts.push(knownCharges.map((e) => won(e.amount ?? 0)).join(" + "));
      if (total !== null) total += knownCharges.reduce((s, e) => s + (e.amount ?? 0), 0);
    }
    if (charges.length && !knownCharges.length && !extraRevisions.length) {
      parts.push("단가 미정");
      total = null;
    }
    if (charges.length) notes.push("상대방 동의가 확인되지 않은 청구예요");

    const ids = [
      ...extraRounds.flat().map((e) => e.id),
      ...(extraRevisions.length ? (policy?.includedEventIds ?? []) : []),
      ...(extraRevisions.length ? (policy?.unitPriceEventIds ?? []) : []),
      ...charges.map((e) => e.id),
    ];
    lines.push({
      key: "disputed",
      label: "다툼이 있는 추가금",
      amount: total,
      formula: parts.join(" / ") + (parts.length > 1 && total !== null ? ` → ${won(total)}` : ""),
      eventIds: [...new Set(ids)],
      status: "unverifiable",
      note: notes.join(" · "),
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
