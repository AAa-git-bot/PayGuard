// 담당: 이다은 | PRD ⑩
// POST /api/rooms/[id]/terms  { messageId, role: "freelancer" | "client" }  →  { terms, saved }
// - terms_card 메시지의 payload.terms에 내 역할의 확인 플래그를 켠다 (Realtime UPDATE로 상대 화면에도 반영).
// - 양측이 모두 확인하면 payload.terms를 room_terms에 새 version으로 저장한다 (saved: true).
//   version은 저장 시점의 확정 version + 1 (카드가 만들어진 뒤 다른 카드가 먼저 확정됐을 수 있어서 다시 계산).
import type { TermsCardPayload } from "@/lib/agent/prevent";
import { getLatestRoomTerms, getRoom, getRoomMessage, saveRoomTerms, updateRoomMessagePayload } from "@/lib/db";
import { TermsSchema, type Terms } from "@/lib/types";
import { isUuid, jsonError } from "../../../_lib/http";

const NOT_FOUND_ROOM = "채팅방을 찾을 수 없어요. 링크를 다시 확인해 주세요.";

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id) || !(await getRoom(id))) return jsonError(404, NOT_FOUND_ROOM);

    const body = (await req.json().catch(() => null)) as { messageId?: unknown; role?: unknown } | null;
    const role = body?.role;
    if (role !== "freelancer" && role !== "client") return jsonError(400, "역할이 올바르지 않아요.");
    const messageId = typeof body?.messageId === "string" ? body.messageId : "";
    if (!isUuid(messageId)) return jsonError(400, "확인할 조건 카드를 찾을 수 없어요.");

    const card = await getRoomMessage(id, messageId);
    if (!card || card.sender !== "ai" || card.kind !== "terms_card") return jsonError(404, "확인할 조건 카드를 찾을 수 없어요.");
    const payload = (card.payload ?? {}) as Partial<TermsCardPayload>;
    const parsed = TermsSchema.safeParse(payload.terms);
    if (!parsed.success) return jsonError(422, "조건 카드 형식이 올바르지 않아요.", parsed.error.issues.slice(0, 3));
    const current = parsed.data;

    // 이미 양측이 확인한 카드면 다시 저장하지 않는다
    if (current.confirmedByFreelancer && current.confirmedByClient) return Response.json({ terms: current, saved: false });

    const next: Terms = {
      ...current,
      confirmedByFreelancer: current.confirmedByFreelancer || role === "freelancer",
      confirmedByClient: current.confirmedByClient || role === "client",
    };
    const bothConfirmed = next.confirmedByFreelancer && next.confirmedByClient;
    if (bothConfirmed) {
      const latest = await getLatestRoomTerms(id);
      next.version = (latest?.version ?? 0) + 1;
    }

    await updateRoomMessagePayload(id, messageId, { ...payload, terms: next });
    if (bothConfirmed) await saveRoomTerms(id, next);

    return Response.json({ terms: next, saved: bothConfirmed });
  } catch (e) {
    return jsonError(500, "확인을 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", e);
  }
}
