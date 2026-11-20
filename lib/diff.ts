// 담당: 민수빈 | PRD ⑦ 분석 버전 간 바뀐 부분 계산
// LLM은 매번 문장을 조금씩 다르게 쓰므로, 문장 자체가 아니라 "구조"가 바뀐 항목만 잡는다.
//  - 이벤트: 유형·누가·금액·사건일·동의·확실성·근거 seq
//  - 쟁점: 연결된 이벤트, 근거 문장에 달린 seq 번호, 추가 확인 항목 수
//  - 정산: 금액·계산식·상태·근거 이벤트
import type { Analysis, CaseEvent, Issue, SettlementLine } from "./types";

const sortedUniq = (xs: (string | number)[]) => [...new Set(xs.map(String))].sort();

// "(#12)", "(#12~14)", "#12-14" 같은 출처 표시에서 seq 번호를 뽑는다
function citedSeqs(lines: string[]): string[] {
  const out: number[] = [];
  for (const line of lines) {
    for (const m of line.matchAll(/#(\d+)(?:\s*[~\-–]\s*#?(\d+))?/g)) {
      const a = Number(m[1]);
      const b = m[2] ? Number(m[2]) : a;
      for (let s = Math.min(a, b); s <= Math.max(a, b) && s - a < 50; s++) out.push(s);
    }
  }
  return sortedUniq(out);
}

export function eventSignature(e: CaseEvent): string {
  return JSON.stringify({
    who: e.who,
    type: e.type,
    amount: e.amount,
    eventDate: e.eventDate,
    agreedByOther: e.agreedByOther,
    certainty: e.certainty,
    seqs: sortedUniq(e.sources.map((s) => `${s.seqFrom}-${s.seqTo}`)),
  });
}

function issueSignature(i: Issue): string {
  return JSON.stringify({
    eventIds: sortedUniq(i.eventIds),
    facts: citedSeqs(i.facts),
    supportsMe: citedSeqs(i.supportsMe),
    supportsOther: citedSeqs(i.supportsOther),
    toCheck: i.toCheck.length,
  });
}

function lineSignature(l: SettlementLine): string {
  return JSON.stringify({
    amount: l.amount,
    formula: l.formula,
    status: l.status,
    eventIds: sortedUniq(l.eventIds),
  });
}

// 이전 버전 대비 새로 생기거나 내용이 바뀐 항목의 id 목록
// 정산 줄은 "settlement:<key>", 증거 요청은 새로 생긴 것만 id 그대로 넣는다.
export function diffAnalysis(prev: Analysis | null, next: Analysis): string[] {
  if (!prev) return [];
  const changed: string[] = [];

  const prevEvents = new Map(prev.events.map((e) => [e.id, eventSignature(e)]));
  for (const e of next.events) if (prevEvents.get(e.id) !== eventSignature(e)) changed.push(e.id);

  const prevIssues = new Map(prev.issues.map((i) => [i.id, issueSignature(i)]));
  for (const i of next.issues) if (prevIssues.get(i.id) !== issueSignature(i)) changed.push(i.id);

  const prevLines = new Map(prev.settlement.map((l) => [l.key, lineSignature(l)]));
  for (const l of next.settlement) {
    const id = `settlement:${l.key}`;
    if (prevLines.get(l.key) !== lineSignature(l) && !changed.includes(id)) changed.push(id);
  }

  const prevReqs = new Set(prev.evidenceRequests.map((r) => r.id));
  for (const r of next.evidenceRequests) if (!prevReqs.has(r.id)) changed.push(r.id);

  return changed;
}
