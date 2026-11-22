// 담당: 이다은 → 민수빈(lib/agent/prevent) | PRD ⑨⑩⑪
// POST /api/rooms/[id]/messages  { sender: "freelancer" | "client", text }  →  { message: room_messages 행 }
// - 텍스트는 마스킹한 뒤에만 저장한다 (PRD 1장 규칙 1).
// - 사람 메시지를 저장하고 바로 응답한다. 예방 모드 에이전트(onRoomMessage)는 응답 뒤에 실행되고,
//   AI 메시지는 Realtime으로 양쪽 화면에 올라간다. (Vercel에서도 끝까지 돌도록 next/server의 after 사용)
import { after } from "next/server";
import { onRoomMessage } from "@/lib/agent/prevent";
import { getRoom, insertRoomMessage } from "@/lib/db";
import { maskText } from "@/lib/mask";
import { isUuid, jsonError } from "../../../_lib/http";

export const maxDuration = 60; // after()로 도는 에이전트 호출 시간까지 포함

const MAX_TEXT_CHARS = 2000;
const NOT_FOUND_ROOM = "채팅방을 찾을 수 없어요. 링크를 다시 확인해 주세요.";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id) || !(await getRoom(id))) return jsonError(404, NOT_FOUND_ROOM);

    const body = (await req.json().catch(() => null)) as { sender?: unknown; text?: unknown } | null;
    const sender = body?.sender;
    if (sender !== "freelancer" && sender !== "client") return jsonError(400, "보내는 사람 역할이 올바르지 않아요.");
    const text = typeof body?.text === "string" ? body.text.trim() : "";
    if (!text) return jsonError(400, "메시지를 입력해 주세요.");
    if (text.length > MAX_TEXT_CHARS) return jsonError(400, `메시지는 ${MAX_TEXT_CHARS.toLocaleString("ko-KR")}자까지 보낼 수 있어요.`);

    const message = await insertRoomMessage(id, { sender, kind: "text", text: maskText(text).text });

    after(() => onRoomMessage(id, message.id).then(() => undefined).catch((e) => console.error("[onRoomMessage]", e)));

    return Response.json({ message });
  } catch (e) {
    return jsonError(500, "메시지를 보내지 못했어요. 잠시 후 다시 시도해 주세요.", e);
  }
}
