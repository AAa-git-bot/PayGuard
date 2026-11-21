// 담당: 이다은 | PRD ②⑦
// POST /api/cases/[id]/sources  (multipart/form-data)
//   kakao  : File (여러 개 가능) — 카톡 내보내기 txt
//   images : File (여러 개 가능) — 이체 내역·영수증 이미지
//   text   : string            — 붙여넣은 텍스트
//   myName : string            — 카톡 참여자 중 "나"의 이름 (kakao가 있으면 필수)
// → { sourceIds, messageCount, maskedCount }
// 텍스트는 parse-kakao → mask를 거친 뒤에만 저장한다.
import { caseExists } from "@/lib/db";
import { isUuid, jsonError, NOT_FOUND_CASE } from "../../../_lib/http";
import { InputError, prepareKakao, saveImage, saveKakao, saveText, type IngestResult } from "../../../_lib/ingest";

const MAX_TXT_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 50_000;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    if (!isUuid(id) || !(await caseExists(id))) return jsonError(404, NOT_FOUND_CASE);

    const form = await req.formData().catch(() => null);
    if (!form) return jsonError(400, "자료를 읽지 못했어요. 파일을 다시 선택해 주세요.");

    const kakaoFiles = form.getAll("kakao").filter(isFile);
    const imageFiles = form.getAll("images").filter(isFile);
    const text = String(form.get("text") ?? "").trim();
    const myName = String(form.get("myName") ?? "");

    if (kakaoFiles.length === 0 && imageFiles.length === 0 && !text) {
      return jsonError(400, "카톡 파일, 이미지, 텍스트 중 하나 이상 넣어 주세요.");
    }

    // ── 1) 검증 (DB에 쓰기 전에 전부) ──
    for (const f of [...kakaoFiles, ...imageFiles]) {
      if (f.size === 0) return jsonError(400, `'${f.name}' 파일이 비어 있어요. 다른 파일을 선택해 주세요.`);
    }
    for (const f of kakaoFiles) {
      if (!/\.txt$/i.test(f.name) && f.type !== "text/plain") {
        return jsonError(400, `'${f.name}'은(는) txt 파일이 아니에요. 카톡 '대화 내보내기' txt를 올려 주세요.`);
      }
      if (f.size > MAX_TXT_BYTES) return jsonError(400, `'${f.name}'이(가) 너무 커요 (5MB까지).`);
    }
    for (const f of imageFiles) {
      if (!IMAGE_TYPES.includes(f.type)) return jsonError(400, `'${f.name}'은(는) 지원하지 않는 이미지 형식이에요 (PNG·JPG·WEBP).`);
      if (f.size > MAX_IMAGE_BYTES) return jsonError(400, `'${f.name}'이(가) 너무 커요 (10MB까지).`);
    }
    if (text.length > MAX_TEXT_CHARS) return jsonError(400, "붙여넣은 텍스트가 너무 길어요 (5만 자까지).");

    const kakao =
      kakaoFiles.length > 0
        ? prepareKakao(
            await Promise.all(kakaoFiles.map(async (f) => ({ filename: f.name, raw: await f.text() }))),
            myName,
          )
        : null;
    // 텍스트만 올릴 때도 "나" 이름이 오면 가린다
    const names = kakao?.names ?? (myName.trim() ? { me: myName.trim() } : {});

    // ── 2) 저장 ──
    const results: IngestResult[] = [];
    if (kakao) results.push(await saveKakao(id, kakao));
    if (text) results.push(await saveText(id, text, names));
    for (const f of imageFiles) results.push(await saveImage(id, await f.arrayBuffer(), f.type));

    return Response.json({
      sourceIds: results.flatMap((r) => r.sourceIds),
      messageCount: results.reduce((s, r) => s + r.messageCount, 0),
      maskedCount: results.reduce((s, r) => s + r.maskedCount, 0),
    });
  } catch (e) {
    if (e instanceof InputError) return jsonError(400, e.message, undefined, e.extra);
    return jsonError(500, "자료를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", e);
  }
}

function isFile(v: FormDataEntryValue): v is File {
  // 파일을 고르지 않은 input은 이름 없는 빈 File로 오므로 제외
  return typeof v !== "string" && !(v.size === 0 && !v.name);
}
