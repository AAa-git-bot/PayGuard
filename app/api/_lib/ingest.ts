// 담당: 이다은 | 자료 저장 공통 로직: 분류 → 파싱 → 마스킹 → 저장
// /api/cases/[id]/sources 와 /api/sample 이 같이 쓴다. 원문은 어디에도 저장하지 않는다.
import "server-only";
import { createHash } from "node:crypto";
import { addSource, insertMessages, setMyNameHash, uploadImage, type MessageSender } from "@/lib/db";
import { maskText, type MaskNames } from "@/lib/mask";
import { parseKakao, UNKNOWN_SENDER, type ParsedKakao } from "@/lib/parse-kakao";

/** 업로드 형식(FormData·JSON)과 상관없이 정리한 입력 */
export interface UploadInput {
  texts: { filename: string | null; raw: string }[]; // 카톡 txt 파일, 붙여넣은 텍스트
  images: { filename: string; bytes: ArrayBuffer; contentType: string }[];
  myName: string; // 비어 있을 수 있음
}

export interface IngestResult {
  sourceIds: string[];
  messageCount: number;
  maskedCount: number;
}

/** 사용자에게 그대로 보여줄 수 있는 입력 오류 (400) */
export class InputError extends Error {
  constructor(
    message: string,
    public extra?: Record<string, unknown>,
  ) {
    super(message);
  }
}

export const SAMPLE_ME = "하은";
const SAMPLE_OTHERS = ["온새미로카페"]; // 샘플 사건은 이름을 알고 있으므로 메모 등 카톡이 아닌 자료에서도 가린다
const PASTE_NAME = "붙여넣은 대화";

interface KakaoFile {
  filename: string;
  raw: string;
  parsed: ParsedKakao;
}

export interface PreparedUpload {
  kakao: KakaoFile[];
  plain: { filename: string | null; raw: string }[]; // 카톡 형식이 아닌 텍스트
  images: UploadInput["images"];
  names: MaskNames;
  myNameHash: string | null; // 새로 정해진 "나"의 해시 (저장용)
}

/** "나" 이름의 해시. 사건 id를 섞어서 사건마다 다른 값이 되게 한다. */
export function hashName(caseId: string, name: string): string {
  return createHash("sha256").update(`${caseId}:${name.trim()}`).digest("hex");
}

/**
 * DB에 쓰기 전에 전부 분류·파싱·검증한다 (중간에 실패해서 일부만 저장되는 일을 줄이기 위해).
 * - 카톡 형식으로 읽히는 텍스트 → 카톡 자료, 아니면 일반 텍스트 자료
 * - "나": 요청의 myName → (없으면) 샘플 사건은 하은 → 이전 업로드 때 저장한 해시와 맞는 참여자
 */
export function prepareUpload(
  caseId: string,
  input: UploadInput,
  meta: { isSample: boolean; myNameHash: string | null },
): PreparedUpload {
  const kakao: KakaoFile[] = [];
  const plain: PreparedUpload["plain"] = [];
  for (const t of input.texts) {
    if (!t.raw.trim()) {
      if (t.filename) throw new InputError(`'${t.filename}' 파일이 비어 있어요. 다른 파일을 선택해 주세요.`);
      continue;
    }
    const parsed = parseKakao(t.raw);
    if (parsed.messages.length > 0) kakao.push({ filename: t.filename ?? PASTE_NAME, raw: t.raw, parsed });
    else plain.push(t);
  }

  if (kakao.length === 0 && plain.length === 0 && input.images.length === 0) {
    throw new InputError("채팅 파일, 이미지, 텍스트 중 하나 이상 넣어 주세요.");
  }

  const participants = [...new Set(kakao.flatMap((f) => f.parsed.participants))];
  let me = input.myName.trim();
  let myNameHash: string | null = null;

  if (kakao.length > 0) {
    if (me && !participants.includes(me)) {
      throw new InputError(`'${me}'은(는) 대화 참여자가 아니에요. 참여자 중에서 '나'를 선택해 주세요.`, { participants });
    }
    if (!me && meta.isSample && participants.includes(SAMPLE_ME)) me = SAMPLE_ME;
    if (!me && meta.myNameHash) me = participants.find((p) => hashName(caseId, p) === meta.myNameHash) ?? "";
    if (!me) throw new InputError("대화 참여자 중 '나'를 선택해 주세요.", { participants });
    const h = hashName(caseId, me);
    if (h !== meta.myNameHash) myNameHash = h;
  }

  if (!me && meta.isSample) me = SAMPLE_ME;
  const others = [...new Set([...participants, ...(meta.isSample ? SAMPLE_OTHERS : [])])].filter((p) => p !== me);
  // 한계: 샘플이 아닌 사건에서 myName 없이 카톡이 아닌 텍스트만 올리면 이름은 알 수 없어 패턴(전화번호 등)만 가린다
  const names: MaskNames = me ? { me, others } : { others };
  return { kakao, plain, images: input.images, names, myNameHash };
}

export async function saveUpload(caseId: string, p: PreparedUpload): Promise<IngestResult> {
  const results: IngestResult[] = [];
  if (p.myNameHash) await setMyNameHash(caseId, p.myNameHash);
  for (const f of p.kakao) results.push(await saveKakaoFile(caseId, f, p.names));
  for (const t of p.plain) results.push(await saveText(caseId, t.raw, p.names, t.filename));
  for (const img of p.images) results.push(await saveImage(caseId, img.bytes, img.contentType));
  return {
    sourceIds: results.flatMap((r) => r.sourceIds),
    messageCount: results.reduce((s, r) => s + r.messageCount, 0),
    maskedCount: results.reduce((s, r) => s + r.maskedCount, 0),
  };
}

async function saveKakaoFile(caseId: string, f: KakaoFile, names: MaskNames): Promise<IngestResult> {
  let count = 0;
  const messages = f.parsed.messages.map((m) => {
    const masked = maskText(m.text, names);
    count += masked.count;
    return { sender: toSender(m.sender, names.me ?? ""), sentAt: m.sentAt, text: masked.text };
  });
  const sourceId = await addSource({
    caseId,
    kind: "kakao_txt",
    filename: maskText(f.filename, names).text, // 파일명에도 상대 이름이 들어가는 경우가 많음
    maskedText: maskText(f.raw, names).text,
    maskCount: count,
  });
  const inserted = await insertMessages(caseId, sourceId, messages);
  return { sourceIds: [sourceId], messageCount: inserted.count, maskedCount: count };
}

/** 카톡 형식이 아닌 텍스트: 마스킹 후 source 1개 + 메시지 1개(sender unknown)로 저장해 출처 seq를 붙일 수 있게 한다. */
async function saveText(caseId: string, raw: string, names: MaskNames, filename: string | null): Promise<IngestResult> {
  const masked = maskText(raw.trim(), names);
  const sourceId = await addSource({
    caseId,
    kind: "text",
    filename: filename ? maskText(filename, names).text : null,
    maskedText: masked.text,
    maskCount: masked.count,
  });
  const inserted = await insertMessages(caseId, sourceId, [{ sender: "unknown", sentAt: null, text: masked.text }]);
  return { sourceIds: [sourceId], messageCount: inserted.count, maskedCount: masked.count };
}

/** 이미지: Storage에 저장하고 source(kind image, filename = Storage 경로)만 만든다. 메시지는 파이프라인이 이미지에서 추출. */
export async function saveImage(caseId: string, bytes: ArrayBuffer, contentType: string): Promise<IngestResult> {
  const path = await uploadImage(caseId, bytes, contentType);
  const sourceId = await addSource({ caseId, kind: "image", filename: path, maskedText: null, maskCount: 0 });
  return { sourceIds: [sourceId], messageCount: 0, maskedCount: 0 };
}

function toSender(name: string, me: string): MessageSender {
  if (name === UNKNOWN_SENDER) return "unknown";
  return name === me ? "me" : "counterparty";
}
