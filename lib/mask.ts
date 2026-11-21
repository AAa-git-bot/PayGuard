// 담당: 이다은 | PRD ③ 개인정보 마스킹
// LLM 호출 전, DB 저장 전에 반드시 실행한다. 테스트: lib/mask.test.ts (npm test)

export interface MaskResult {
  text: string;
  count: number; // 가린 개수(패턴 + 이름) → 결과 화면 "개인정보 n건을 가렸어요"
}

export interface MaskNames {
  me?: string; // 업로드 시 "나"로 선택한 이름 → "나"
  others?: string[]; // 그 외 참여자 → "상대방" (여러 명이면 "상대방1", "상대방2" …)
}

// 숫자 앞뒤에 다른 숫자가 붙어 있으면(더 긴 숫자열의 일부) 치환하지 않는다.
const D_START = "(?<!\\d)";
const D_END = "(?!\\d)";

// 순서가 중요하다: 주민번호 → 전화번호 → 계좌번호 → 이메일
// (계좌번호 정규식이 하이픈 전화번호도 잡기 때문에 전화번호를 먼저 처리)
const RULES: { re: RegExp; label: string; skip?: (m: string) => boolean }[] = [
  { re: new RegExp(`${D_START}\\d{6}[- ]?[1-4]\\d{6}${D_END}`, "g"), label: "[주민번호]" },
  { re: new RegExp(`${D_START}01[016789][-. ]?\\d{3,4}[-. ]?\\d{4}${D_END}`, "g"), label: "[전화번호]" },
  {
    re: new RegExp(`${D_START}\\d{2,6}-\\d{2,6}-\\d{2,6}(?:-\\d{1,6})?${D_END}`, "g"),
    label: "[계좌번호]",
    skip: isDateLike, // "2026-06-10" 같은 날짜는 계좌번호가 아님
  },
  { re: /[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}/g, label: "[이메일]" },
];

function isDateLike(s: string): boolean {
  const m = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(s);
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return y >= 1900 && y <= 2100 && mo >= 1 && mo <= 12 && d >= 1 && d <= 31;
}

/** 실명 → 가명 대응표. 파서의 sender 변환 등에도 같은 규칙을 쓰도록 export. */
export function buildNameMap(names: MaskNames = {}): Map<string, string> {
  const map = new Map<string, string>();
  const me = names.me?.trim();
  if (me) map.set(me, "나");
  const others = [...new Set((names.others ?? []).map((n) => n.trim()))].filter((n) => n && n !== me);
  others.forEach((n, i) => map.set(n, others.length === 1 ? "상대방" : `상대방${i + 1}`));
  return map;
}

export function maskText(input: string, names: MaskNames = {}): MaskResult {
  let text = input ?? "";
  let count = 0;

  for (const { re, label, skip } of RULES) {
    text = text.replace(re, (m) => {
      if (skip?.(m)) return m;
      count++;
      return label;
    });
  }

  // 긴 이름부터 치환해서 "김하은"이 "하은" 때문에 "김나"가 되는 일을 막는다.
  const entries = [...buildNameMap(names)].sort((a, b) => b[0].length - a[0].length);
  if (entries.length > 0) {
    const pattern = new RegExp(entries.map(([n]) => escapeRegExp(n)).join("|"), "g");
    const lookup = new Map(entries);
    text = text.replace(pattern, (m) => {
      count++;
      return lookup.get(m)!;
    });
  }

  return { text, count };
}

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
