// 담당: 이다은 | PRD ⑨
// POST /api/rooms  { title }  →  { id }
// 화면(/rooms/new)이 id로 ?as=freelancer, ?as=client 링크 두 개를 만든다.
import { createRoom } from "@/lib/db";
import { maskText } from "@/lib/mask";
import { jsonError } from "../_lib/http";

const MAX_TITLE_CHARS = 100;

export async function POST(req: Request) {
  try {
    const body = (await req.json().catch(() => null)) as { title?: unknown } | null;
    const title = typeof body?.title === "string" ? body.title.trim() : "";
    if (!title) return jsonError(400, "방 제목을 입력해 주세요.");
    if (title.length > MAX_TITLE_CHARS) return jsonError(400, `방 제목은 ${MAX_TITLE_CHARS}자까지 쓸 수 있어요.`);

    const id = await createRoom(maskText(title).text);
    return Response.json({ id });
  } catch (e) {
    return jsonError(500, "방을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", e);
  }
}
