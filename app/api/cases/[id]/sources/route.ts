// 담당: 이다은 | PRD ②⑦
// POST /api/cases/[id]/sources — 두 형식 모두 받는다.
//
// ① JSON (현재 화면이 쓰는 형식, components/file-payload.ts)
//    { myName?, paste?, text?, requestId?, files?: [{ name, kind: "kakao"|"image"|"text", text, dataUrl? }] }
//    이미지는 dataUrl("data:image/png;base64,...")로 보낸다.
// ② multipart/form-data
//    kakao: File(여러 개) · images: File(여러 개) · text: string · myName: string
//
// → { sourceIds, messageCount, maskedCount }
// - 텍스트는 카톡 형식으로 읽히면 카톡 자료, 아니면 일반 텍스트 자료로 저장한다.
// - myName이 없으면: 샘플 사건은 "하은", 그 외에는 처음 올릴 때 고른 "나"를 자동으로 찾는다.
// - 모든 텍스트는 parse-kakao → mask를 거친 뒤에만 저장한다.
import { getCaseMeta } from "@/lib/db";
import { isUuid, jsonError, NOT_FOUND_CASE } from "../../../_lib/http";
import { InputError, prepareUpload, saveUpload, type UploadInput } from "../../../_lib/ingest";

const MAX_TXT_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 10 * 1024 * 1024;
const MAX_TEXT_CHARS = 50_000;
const IMAGE_TYPES = ["image/png", "image/jpeg", "image/webp", "image/gif"];

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await ctx.params;
    const meta = isUuid(id) ? await getCaseMeta(id) : null;
    if (!meta) return jsonError(404, NOT_FOUND_CASE);

    const isJson = (req.headers.get("content-type") ?? "").includes("application/json");
    const input = isJson ? await readJson(req) : await readForm(req);
    validate(input);

    const prepared = prepareUpload(id, input, meta);
    const result = await saveUpload(id, prepared);
    return Response.json(result);
  } catch (e) {
    if (e instanceof InputError) return jsonError(400, e.message, undefined, e.extra);
    return jsonError(500, "자료를 저장하지 못했어요. 잠시 후 다시 시도해 주세요.", e);
  }
}

// ── 입력 읽기 ───────────────────────────────────────────────

interface JsonFile {
  name?: unknown;
  kind?: unknown;
  text?: unknown;
  dataUrl?: unknown;
}

async function readJson(req: Request): Promise<UploadInput> {
  const body = (await req.json().catch(() => null)) as {
    myName?: unknown;
    paste?: unknown;
    text?: unknown;
    files?: unknown;
  } | null;
  if (!body || typeof body !== "object") throw new InputError("자료를 읽지 못했어요. 파일을 다시 선택해 주세요.");

  const input: UploadInput = { texts: [], images: [], myName: str(body.myName) };
  for (const pasted of [str(body.paste), str(body.text)]) {
    if (pasted.trim()) input.texts.push({ filename: null, raw: pasted });
  }
  const files = Array.isArray(body.files) ? (body.files as JsonFile[]) : [];
  for (const f of files) {
    const name = str(f?.name) || "파일";
    if (f?.kind === "image" || str(f?.dataUrl)) {
      input.images.push({ filename: name, ...decodeDataUrl(name, str(f?.dataUrl)) });
    } else {
      input.texts.push({ filename: f?.kind === "text" && !str(f?.name) ? null : name, raw: str(f?.text) });
    }
  }
  return input;
}

async function readForm(req: Request): Promise<UploadInput> {
  const form = await req.formData().catch(() => null);
  if (!form) throw new InputError("자료를 읽지 못했어요. 파일을 다시 선택해 주세요.");

  const input: UploadInput = { texts: [], images: [], myName: str(form.get("myName")) };
  for (const f of form.getAll("kakao").filter(isFile)) {
    if (!/\.txt$/i.test(f.name) && f.type !== "text/plain") {
      throw new InputError(`'${f.name}'은(는) txt 파일이 아니에요. 카톡 '대화 내보내기' txt를 올려 주세요.`);
    }
    if (f.size > MAX_TXT_BYTES) throw new InputError(`'${f.name}'이(가) 너무 커요 (5MB까지).`);
    input.texts.push({ filename: f.name, raw: await f.text() });
  }
  const text = str(form.get("text"));
  if (text.trim()) input.texts.push({ filename: null, raw: text });
  for (const f of form.getAll("images").filter(isFile)) {
    if (f.size === 0) throw new InputError(`'${f.name}' 파일이 비어 있어요. 다른 파일을 선택해 주세요.`);
    input.images.push({ filename: f.name, bytes: await f.arrayBuffer(), contentType: f.type });
  }
  return input;
}

function decodeDataUrl(name: string, dataUrl: string): { bytes: ArrayBuffer; contentType: string } {
  const m = /^data:([^;,]+);base64,([\s\S]*)$/.exec(dataUrl);
  if (!m) throw new InputError(`'${name}' 이미지를 읽지 못했어요. 다른 파일을 선택해 주세요.`);
  const buf = Buffer.from(m[2], "base64");
  if (buf.byteLength === 0) throw new InputError(`'${name}' 파일이 비어 있어요. 다른 파일을 선택해 주세요.`);
  return {
    bytes: buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer,
    contentType: m[1].toLowerCase(),
  };
}

// ── 검증 ────────────────────────────────────────────────────

function validate(input: UploadInput) {
  for (const t of input.texts) {
    const limit = t.filename ? MAX_TXT_BYTES : MAX_TEXT_CHARS;
    const size = t.filename ? Buffer.byteLength(t.raw, "utf8") : t.raw.length;
    if (size > limit) {
      throw new InputError(t.filename ? `'${t.filename}'이(가) 너무 커요 (5MB까지).` : "붙여넣은 텍스트가 너무 길어요 (5만 자까지).");
    }
  }
  for (const img of input.images) {
    if (!IMAGE_TYPES.includes(img.contentType)) {
      throw new InputError(`'${img.filename}'은(는) 지원하지 않는 이미지 형식이에요 (PNG·JPG·WEBP).`);
    }
    if (img.bytes.byteLength > MAX_IMAGE_BYTES) throw new InputError(`'${img.filename}'이(가) 너무 커요 (10MB까지).`);
  }
}

function str(v: unknown): string {
  return typeof v === "string" ? v : "";
}

function isFile(v: FormDataEntryValue): v is File {
  // 파일을 고르지 않은 input은 이름 없는 빈 File로 오므로 제외
  return typeof v !== "string" && !(v.size === 0 && !v.name);
}
