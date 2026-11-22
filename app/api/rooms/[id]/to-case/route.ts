// 담당: 이다은 | PRD ⑪
// POST /api/rooms/[id]/to-case  →  { caseId, analyzed }
// 채팅 기록 + 양측이 확인한 조건(Terms) 이력으로 사건을 만들고 분석까지 실행한다.
// - 자료는 room_chat 하나. 사람 메시지와 조건 확정 기록을 시간순으로 섞어 seq를 붙인다.
//   · 프리랜서 → "me"(나), 의뢰인 → "counterparty"(상대방). PRD 4-1: me = 보통 프리랜서
//   · 양측 확인 조건 → sender "unknown"의 "[PayGuard 기록] 양측 확인 완료 조건 vN" 줄 (certainty confirmed 근거)
//   · AI의 조건 카드·알림·질문 제안은 조언이라 증거로 넣지 않는다 (확정된 조건만 위 기록으로 들어감)
// - room_chat 자료가 있으면 파이프라인이 oneSided=false로 본다 (양측이 함께 만든 자료).
// - 분석이 실패해도 사건은 만들어졌으므로 caseId를 돌려준다 (결과 화면에서 "다시 분석하기" 가능).
import { runAnalysis } from "@/lib/agent/pipeline";
import { formatTerms } from "@/lib/agent/prevent";
import { addSource, createCase, getAllRoomMessages, getRoom, getRoomTermsHistory, insertMessages } from "@/lib/db";
import { maskText } from "@/lib/mask";
import type { CaseMessage } from "@/lib/types";
import { isUuid, jsonError } from "../../../_lib/http";

export const maxDuration = 300; // 분석(LLM 여러 번)까지 포함

const NOT_FOUND_ROOM = "채팅방을 찾을 수 없어요. 링크를 다시 확인해 주세요.";

type Line = { sender: CaseMessage["sender"]; sentAt: string | null; text: string };

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const room = isUuid(id) ? await getRoom(id) : null;
    if (!room) return jsonError(404, NOT_FOUND_ROOM);

    const [messages, history] = await Promise.all([getAllRoomMessages(id), getRoomTermsHistory(id)]);

    const chat: Line[] = messages
      .filter((m) => m.kind === "text" && (m.sender === "freelancer" || m.sender === "client"))
      .map((m) => ({ sender: m.sender === "freelancer" ? "me" : "counterparty", sentAt: m.createdAt, text: m.text }));
    if (chat.length === 0) return jsonError(400, "아직 대화가 없어서 분쟁 분석으로 보낼 수 없어요.");

    const termsLines: Line[] = history.map(({ terms, createdAt }) => ({
      sender: "unknown",
      sentAt: createdAt,
      text: `[PayGuard 기록] 프리랜서·의뢰인 양측 확인 완료 조건 v${terms.version}\n${formatTerms(terms) || "(정리된 항목 없음)"}`,
    }));

    // 시간순 정렬. 같은 시각이면 대화가 먼저 (확정 기록은 대화 뒤에 생기므로)
    const lines = [...chat.map((l) => ({ l, o: 0 })), ...termsLines.map((l) => ({ l, o: 1 }))]
      .sort((a, b) => (Date.parse(a.l.sentAt ?? "") || 0) - (Date.parse(b.l.sentAt ?? "") || 0) || a.o - b.o)
      .map(({ l }) => ({ ...l, text: maskText(l.text).text })); // 저장 시 이미 가렸지만 한 번 더

    const caseId = await createCase({ title: `${room.title} (예방 모드 채팅)`, roomId: id });
    const sourceId = await addSource({
      caseId,
      kind: "room_chat",
      filename: null,
      maskedText: lines.map((l) => `${l.sentAt ?? ""} ${l.sender}: ${l.text}`).join("\n"),
      maskCount: 0,
    });
    await insertMessages(caseId, sourceId, lines);

    let analyzed = true;
    try {
      await runAnalysis(caseId);
    } catch (e) {
      analyzed = false;
      console.error("[to-case] 분석 실패 — 결과 화면에서 다시 분석하기로 이어갈 수 있음", e);
    }

    return Response.json({ caseId, analyzed });
  } catch (e) {
    return jsonError(500, "분쟁 분석으로 보내지 못했어요. 잠시 후 다시 시도해 주세요.", e);
  }
}
