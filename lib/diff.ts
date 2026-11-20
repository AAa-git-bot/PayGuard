// 담당: 민수빈 | PRD ⑦ 분석 버전 간 바뀐 부분 계산
import type { Analysis } from "./types";

// 이전 버전 대비 새로 생기거나 내용이 바뀐 항목의 id 목록
export function diffAnalysis(prev: Analysis | null, next: Analysis): string[] {
  if (!prev) return [];
  const key = (o: unknown) => JSON.stringify(o);
  const changed: string[] = [];
  const prevEvents = new Map(prev.events.map((e) => [e.id, key(e)]));
  for (const e of next.events) if (prevEvents.get(e.id) !== key(e)) changed.push(e.id);
  const prevIssues = new Map(prev.issues.map((i) => [i.id, key(i)]));
  for (const i of next.issues) if (prevIssues.get(i.id) !== key(i)) changed.push(i.id);
  const prevLines = new Map(prev.settlement.map((l) => [l.key, key(l)]));
  for (const l of next.settlement) if (prevLines.get(l.key) !== key(l)) changed.push(`settlement:${l.key}`);
  return changed;
}
