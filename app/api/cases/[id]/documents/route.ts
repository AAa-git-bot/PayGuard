// 담당: 이다은 → 민수빈(lib/agent/documents) | PRD ⑬⑭
// POST /api/cases/[id]/documents  { kind: "notice_draft", dueDate: "YYYY-MM-DD" }
//   → 200 { id, kind, content, source }   (content = 마크다운, 워터마크 포함)
//   → 422 { error, reason }               (확인된 미지급액이 없음 등. reason을 그대로 화면에 보여 준다)
// 초안만 만들고 저장한다. 발송·제출은 하지 않는다 (PRD 1장 규칙 7).
import { createNoticeDraft } from "@/lib/agent/documents";
import { caseExists, saveDocument } from "@/lib/db";
import { isUuid, jsonError, NOT_FOUND_CASE } from "../../../_lib/http";

export const maxDuration = 60;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id) || !(await caseExists(id))) return jsonError(404, NOT_FOUND_CASE);

    const body = (await req.json().catch(() => null)) as { kind?: unknown; dueDate?: unknown } | null;
    if (body?.kind !== "notice_draft") return jsonError(400, "지원하지 않는 문서 종류예요.");
    const dueDate = typeof body.dueDate === "string" ? body.dueDate : "";
    if (!DATE_RE.test(dueDate) || Number.isNaN(Date.parse(dueDate))) return jsonError(400, "지급 요청 기한을 날짜로 입력해 주세요.");

    const result = await createNoticeDraft(id, dueDate);
    if (!result.ok) return jsonError(422, result.reason, undefined, { reason: result.reason });

    const docId = await saveDocument(id, "notice_draft", result.content);
    return Response.json({ id: docId, kind: "notice_draft", content: result.content, source: result.source });
  } catch (e) {
    return jsonError(500, "초안을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", e);
  }
}
