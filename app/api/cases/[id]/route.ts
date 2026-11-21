// 담당: 이다은 | PRD ④
// GET /api/cases/[id]  →  { case, sources, messages, analysis, maskedCount }  (lib/db.ts CaseDetail)
import { getCase } from "@/lib/db";
import { isUuid, jsonError, NOT_FOUND_CASE } from "../../_lib/http";

export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id)) return jsonError(404, NOT_FOUND_CASE);
    const detail = await getCase(id);
    if (!detail) return jsonError(404, NOT_FOUND_CASE);
    return Response.json(detail);
  } catch (e) {
    return jsonError(500, "사건을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.", e);
  }
}
