// 담당: 이다은 | PRD ②
// POST /api/cases  body: { title: string }  →  { id }
import { createCase } from "@/lib/db";
import { maskText } from "@/lib/mask";
import { jsonError } from "../_lib/http";

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { title?: unknown } | null;
    const rawTitle = typeof body?.title === "string" ? body.title.trim() : "";
    if (!rawTitle) return jsonError(400, "사건 제목을 입력해 주세요.");
    if (rawTitle.length > 100) return jsonError(400, "사건 제목은 100자 이내로 입력해 주세요.");

    // 제목에도 전화번호 등이 들어갈 수 있으니 저장 전에 마스킹
    const id = await createCase({ title: maskText(rawTitle).text });
    return Response.json({ id });
  } catch (e) {
    return jsonError(500, "사건을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", e);
  }
}
