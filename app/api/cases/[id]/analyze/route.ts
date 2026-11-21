// 담당: 이다은 → 민수빈(lib/agent/pipeline) | PRD ⑦
// POST /api/cases/[id]/analyze  →  Analysis (새 버전)
import { runAnalysis } from "@/lib/agent/pipeline";
import { caseExists } from "@/lib/db";
import { isUuid, jsonError, NOT_FOUND_CASE } from "../../../_lib/http";

// LLM을 여러 번 호출하므로 실행 시간을 넉넉히 (Vercel 플랜 한도 안에서 적용됨)
export const maxDuration = 300;

export async function POST(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id) || !(await caseExists(id))) return jsonError(404, NOT_FOUND_CASE);
    const analysis = await runAnalysis(id);
    return Response.json(analysis);
  } catch (e) {
    return jsonError(500, "분석 중 오류가 났어요. 잠시 후 '다시 분석하기'를 눌러 주세요.", e);
  }
}
