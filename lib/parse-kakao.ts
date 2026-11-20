// 담당: 이다은 | PRD 7-1 카톡 txt 파서 (모바일·PC 형식 모두)
// TODO: 구현 + 테스트

export interface ParsedKakao {
  participants: string[];
  messages: { sender: string; sentAt: string | null; text: string }[];
}

export function parseKakao(raw: string): ParsedKakao {
  void raw;
  return { participants: [], messages: [] };
}
