// 담당: 민수빈 | PRD 7-4 예방 모드 에이전트
import "server-only";
import type { Terms } from "../types";

export interface PreventResult {
  termsUpdate: Partial<Terms> | null;
  changeAlert: string | null;
  vagueQuestion: string | null;
}

// TODO: 최근 메시지 40개 + 확정 Terms 로드 → PREVENT_AGENT 호출 → 카드/경고/질문 게시
// 사람 메시지에만 반응한다 (sender="ai"면 바로 return)
export async function onRoomMessage(roomId: string, messageId: string): Promise<PreventResult> {
  void roomId;
  void messageId;
  return { termsUpdate: null, changeAlert: null, vagueQuestion: null };
}
