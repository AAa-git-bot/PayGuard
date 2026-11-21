// 담당: 이다은 | 자료 저장 공통 로직: 파싱 → 마스킹 → 저장
// /api/cases/[id]/sources 와 /api/sample 이 같이 쓴다. 원문은 어디에도 저장하지 않는다.
import "server-only";
import { addSource, insertMessages, uploadImage, type MessageSender } from "@/lib/db";
import { maskText, type MaskNames } from "@/lib/mask";
import { parseKakao, UNKNOWN_SENDER, type ParsedKakao } from "@/lib/parse-kakao";

export interface KakaoInput {
  filename: string;
  raw: string;
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

export interface PreparedKakao {
  files: (KakaoInput & { parsed: ParsedKakao })[];
  participants: string[];
  names: MaskNames;
}

/** DB에 쓰기 전에 모든 카톡 파일을 파싱·검증한다 (중간에 실패해서 일부만 저장되는 일을 줄이기 위해). */
export function prepareKakao(inputs: KakaoInput[], myName: string): PreparedKakao {
  const files = inputs.map((f) => ({ ...f, parsed: parseKakao(f.raw) }));
  for (const f of files) {
    if (f.parsed.messages.length === 0) {
      throw new InputError(
        `'${f.filename}'에서 카톡 대화를 읽지 못했어요. 카카오톡 '대화 내보내기'로 저장한 txt 파일인지 확인해 주세요.`,
      );
    }
  }
  const participants = [...new Set(files.flatMap((f) => f.parsed.participants))];
  const me = myName.trim();
  if (!me) throw new InputError("대화 참여자 중 '나'를 선택해 주세요.", { participants });
  if (!participants.includes(me)) {
    throw new InputError(`'${me}'은(는) 대화 참여자가 아니에요. 참여자 중에서 '나'를 선택해 주세요.`, { participants });
  }
  return { files, participants, names: { me, others: participants.filter((p) => p !== me) } };
}

export async function saveKakao(caseId: string, prepared: PreparedKakao): Promise<IngestResult> {
  const result: IngestResult = { sourceIds: [], messageCount: 0, maskedCount: 0 };
  const { names } = prepared;

  for (const f of prepared.files) {
    let count = 0;
    const messages = f.parsed.messages.map((m) => {
      const masked = maskText(m.text, names);
      count += masked.count;
      return { sender: toSender(m.sender, names.me!), sentAt: m.sentAt, text: masked.text };
    });

    const sourceId = await addSource({
      caseId,
      kind: "kakao_txt",
      filename: maskText(f.filename, names).text, // 파일명에도 상대 이름이 들어가는 경우가 많음
      maskedText: maskText(f.raw, names).text,
      maskCount: count,
    });
    const inserted = await insertMessages(caseId, sourceId, messages);

    result.sourceIds.push(sourceId);
    result.messageCount += inserted.count;
    result.maskedCount += count;
  }
  return result;
}

/** 붙여넣은 텍스트: 마스킹 후 source 1개 + 메시지 1개(sender unknown)로 저장해 출처 seq를 붙일 수 있게 한다. */
export async function saveText(caseId: string, raw: string, names: MaskNames): Promise<IngestResult> {
  const masked = maskText(raw.trim(), names);
  const sourceId = await addSource({ caseId, kind: "text", filename: null, maskedText: masked.text, maskCount: masked.count });
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
