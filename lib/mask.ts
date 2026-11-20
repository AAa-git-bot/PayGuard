// 담당: 이다은 | PRD ③ 개인정보 마스킹
// LLM 호출 전, DB 저장 전에 반드시 실행한다. 단위 테스트 10개 이상 (각 패턴 2개 이상).
// TODO: 이름 치환(나/상대방), 이메일 정규식 다듬기, 테스트 추가

export interface MaskResult {
  text: string;
  count: number; // 가린 개수 → 결과 화면 "개인정보 n건을 가렸어요"
}

const RULES: [RegExp, string][] = [
  [/\d{6}[- ]?[1-4]\d{6}/g, "[주민번호]"],
  [/01[016789][-. ]?\d{3,4}[-. ]?\d{4}/g, "[전화번호]"],
  [/\d{2,6}-\d{2,6}-\d{2,6}(-\d{1,6})?/g, "[계좌번호]"],
  [/[\w.+-]+@[\w-]+\.[\w.-]+/g, "[이메일]"],
];

export function maskText(input: string, names: { me?: string; others?: string[] } = {}): MaskResult {
  let text = input;
  let count = 0;
  for (const [re, label] of RULES) {
    text = text.replace(re, () => {
      count++;
      return label;
    });
  }
  // TODO: names.me → "나", names.others → "상대방"/"상대방1"... 치환
  void names;
  return { text, count };
}
