// 담당: 이다은 | Supabase 클라이언트·쿼리 함수
// 서버(API 라우트)에서는 getServerDb(), 브라우저(실시간 채팅)에서는 getBrowserDb()를 쓴다.
// SUPABASE_SERVICE_ROLE_KEY는 서버 전용. 클라이언트 컴포넌트에서 getServerDb나 아래 쿼리 함수를 import하지 않는다.
// 여기 저장하는 텍스트는 모두 lib/mask.ts를 거친 것이어야 한다 (PRD 1장 규칙 1).
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { AnalysisSchema, TermsSchema, type Analysis, type CaseMessage, type Terms } from "./types";
import type { RoomMessage, RoomMessageKind, RoomSender } from "./agent/prevent"; // 타입만 (런타임 순환 없음)

let serverDb: SupabaseClient | null = null;
let browserDb: SupabaseClient | null = null;

export function getServerDb(): SupabaseClient {
  if (!serverDb) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase 서버 환경변수가 없어요 (.env.local 확인)");
    serverDb = createClient(url, key, { auth: { persistSession: false } });
  }
  return serverDb;
}

export function getBrowserDb(): SupabaseClient {
  if (!browserDb) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase 공개 환경변수가 없어요 (.env.local 확인)");
    browserDb = createClient(url, key);
  }
  return browserDb;
}

// ─────────────────────────────────────────────────────────────
// 타입 (DB는 snake_case, 앱은 camelCase)
// ─────────────────────────────────────────────────────────────

export type SourceKind = "kakao_txt" | "image" | "text" | "room_chat";
export type MessageSender = CaseMessage["sender"];

export interface CaseRecord {
  id: string;
  title: string;
  myNameAlias: string;
  isSample: boolean;
  roomId: string | null;
  createdAt: string;
}

export interface SourceRecord {
  id: string;
  kind: SourceKind;
  filename: string | null; // 이미지는 Storage 경로(IMAGE_BUCKET 안), 그 외는 원본 파일명 또는 null
  maskCount: number; // 이 자료에서 가린 개인정보 수
  createdAt: string;
}

export interface CaseDetail {
  case: CaseRecord;
  sources: SourceRecord[];
  messages: CaseMessage[]; // seq 오름차순
  analysis: Analysis | null; // 최신 버전
  maskedCount: number; // 사건 전체에서 가린 개인정보 수 → "개인정보 n건을 가렸어요"
}

/** 이미지(이체 내역·영수증)를 넣는 Storage 버킷. supabase/schema.sql에서 만든다. */
export const IMAGE_BUCKET = "evidence";

const PAGE = 1000; // Supabase 기본 최대 행 수

// ─────────────────────────────────────────────────────────────
// 사건
// ─────────────────────────────────────────────────────────────

export async function createCase(input: {
  title: string;
  myNameAlias?: string;
  isSample?: boolean;
  roomId?: string | null;
  myNameHash?: string | null;
}): Promise<string> {
  const { data, error } = await getServerDb()
    .from("cases")
    .insert({
      title: input.title,
      my_name_alias: input.myNameAlias ?? "나",
      is_sample: input.isSample ?? false,
      room_id: input.roomId ?? null,
      my_name_hash: input.myNameHash ?? null,
    })
    .select("id")
    .single();
  if (error) throw dbError("사건 생성", error);
  return data.id as string;
}

export async function caseExists(caseId: string): Promise<boolean> {
  const { data, error } = await getServerDb().from("cases").select("id").eq("id", caseId).maybeSingle();
  if (error) throw dbError("사건 조회", error);
  return data !== null;
}

/** 자료 추가에 필요한 사건 정보. 사건이 없으면 null. */
export async function getCaseMeta(caseId: string): Promise<{ isSample: boolean; myNameHash: string | null } | null> {
  const { data, error } = await getServerDb()
    .from("cases")
    .select("is_sample, my_name_hash")
    .eq("id", caseId)
    .maybeSingle();
  if (error) throw dbError("사건 조회", error);
  return data ? { isSample: data.is_sample ?? false, myNameHash: data.my_name_hash ?? null } : null;
}

/** "나"의 이름 해시 저장 (실명은 저장하지 않는다). 나중에 자료를 추가할 때 이름 없이도 "나"를 찾는 데 쓴다. */
export async function setMyNameHash(caseId: string, hash: string): Promise<void> {
  const { error } = await getServerDb().from("cases").update({ my_name_hash: hash }).eq("id", caseId);
  if (error) throw dbError("사건 정보 저장", error);
}

/** 사건 + 자료 목록 + 메시지 전체 + 최신 분석. 사건이 없으면 null. */
export async function getCase(caseId: string): Promise<CaseDetail | null> {
  const db = getServerDb();
  const { data: c, error } = await db.from("cases").select("*").eq("id", caseId).maybeSingle();
  if (error) throw dbError("사건 조회", error);
  if (!c) return null;

  const [sourcesRes, messages, analysis] = await Promise.all([
    db
      .from("sources")
      .select("id, kind, filename, mask_count, created_at")
      .eq("case_id", caseId)
      .order("created_at", { ascending: true }),
    getMessages(caseId),
    getLatestAnalysis(caseId),
  ]);
  if (sourcesRes.error) throw dbError("자료 조회", sourcesRes.error);

  const sources: SourceRecord[] = (sourcesRes.data ?? []).map((s) => ({
    id: s.id,
    kind: s.kind,
    filename: s.filename,
    maskCount: s.mask_count ?? 0,
    createdAt: s.created_at,
  }));

  return {
    case: {
      id: c.id,
      title: c.title,
      myNameAlias: c.my_name_alias ?? "나",
      isSample: c.is_sample ?? false,
      roomId: c.room_id,
      createdAt: c.created_at,
    },
    sources,
    messages,
    analysis,
    maskedCount: sources.reduce((sum, s) => sum + s.maskCount, 0),
  };
}

// ─────────────────────────────────────────────────────────────
// 자료·메시지
// ─────────────────────────────────────────────────────────────

export async function addSource(input: {
  caseId: string;
  kind: SourceKind;
  filename?: string | null;
  maskedText?: string | null; // 마스킹 후 텍스트만 (원문 저장 금지)
  maskCount?: number;
}): Promise<string> {
  const { data, error } = await getServerDb()
    .from("sources")
    .insert({
      case_id: input.caseId,
      kind: input.kind,
      filename: input.filename ?? null,
      masked_text: input.maskedText ?? null,
      mask_count: input.maskCount ?? 0,
    })
    .select("id")
    .single();
  if (error) throw dbError("자료 저장", error);
  return data.id as string;
}

/**
 * 메시지 저장. seq는 사건 전체에서 1부터 이어진다 (기존 최대 seq + 1부터).
 * 텍스트는 이미 마스킹된 것이어야 한다. 반환: 새로 붙은 seq 범위.
 */
export async function insertMessages(
  caseId: string,
  sourceId: string,
  messages: { sender: MessageSender; sentAt: string | null; text: string }[],
): Promise<{ seqFrom: number; seqTo: number; count: number }> {
  const db = getServerDb();
  const { data: last, error: maxErr } = await db
    .from("messages")
    .select("seq")
    .eq("case_id", caseId)
    .order("seq", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (maxErr) throw dbError("메시지 순번 조회", maxErr);

  const start = ((last?.seq as number | undefined) ?? 0) + 1;
  if (messages.length === 0) return { seqFrom: start, seqTo: start - 1, count: 0 };

  const rows = messages.map((m, i) => ({
    case_id: caseId,
    source_id: sourceId,
    seq: start + i,
    sender: m.sender,
    sent_at: m.sentAt,
    text: m.text,
  }));
  for (let i = 0; i < rows.length; i += 500) {
    const { error } = await db.from("messages").insert(rows.slice(i, i + 500));
    if (error) throw dbError("메시지 저장", error);
  }
  return { seqFrom: start, seqTo: start + messages.length - 1, count: messages.length };
}

/** 사건의 메시지 전체 (seq 오름차순, 1000개 넘어도 전부) */
export async function getMessages(caseId: string): Promise<CaseMessage[]> {
  const db = getServerDb();
  const out: CaseMessage[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("messages")
      .select("source_id, seq, sender, sent_at, text")
      .eq("case_id", caseId)
      .order("seq", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw dbError("메시지 조회", error);
    for (const m of data ?? []) {
      out.push({ sourceId: m.source_id, seq: m.seq, sender: m.sender ?? "unknown", sentAt: m.sent_at, text: m.text });
    }
    if (!data || data.length < PAGE) break;
  }
  return out;
}

// ─────────────────────────────────────────────────────────────
// 이미지 (Supabase Storage)
// ─────────────────────────────────────────────────────────────

/** 이미지를 Storage에 올리고 경로를 돌려준다. 경로에 원본 파일명은 넣지 않는다(실명이 들어 있을 수 있음). */
export async function uploadImage(caseId: string, bytes: ArrayBuffer | Uint8Array, contentType: string): Promise<string> {
  const ext = (contentType.split("/")[1] ?? "bin").replace(/[^a-z0-9]/gi, "").slice(0, 5) || "bin";
  const path = `${caseId}/${crypto.randomUUID()}.${ext}`;
  const { error } = await getServerDb().storage.from(IMAGE_BUCKET).upload(path, bytes, { contentType, upsert: false });
  if (error) throw new Error(`이미지 저장 실패: ${error.message}`);
  return path;
}

/** 파이프라인용: 이미지 source의 filename(Storage 경로)으로 바이트를 읽는다. callStructured의 images에 그대로 넣을 수 있다. */
export async function downloadImage(path: string): Promise<{ data: Uint8Array; mediaType: string }> {
  const { data, error } = await getServerDb().storage.from(IMAGE_BUCKET).download(path);
  if (error || !data) throw new Error(`이미지 읽기 실패: ${error?.message ?? "빈 파일"}`);
  return { data: new Uint8Array(await data.arrayBuffer()), mediaType: data.type || "image/png" };
}

// ─────────────────────────────────────────────────────────────
// 분석
// ─────────────────────────────────────────────────────────────

/** 분석 저장. analysis.version을 그대로 쓴다 (파이프라인은 최신 version + 1로 채워서 넘긴다). */
export async function saveAnalysis(caseId: string, analysis: Analysis): Promise<void> {
  const { error } = await getServerDb()
    .from("analyses")
    .insert({ case_id: caseId, version: analysis.version, data: analysis });
  if (error) throw dbError("분석 저장", error);
}

/** 최신 버전 분석. 없으면 null. 저장된 JSON이 스키마에 안 맞아도 앱이 멈추지 않게 그대로 돌려주고 경고만 남긴다. */
export async function getLatestAnalysis(caseId: string): Promise<Analysis | null> {
  const { data, error } = await getServerDb()
    .from("analyses")
    .select("version, data")
    .eq("case_id", caseId)
    .order("version", { ascending: false })
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("분석 조회", error);
  if (!data) return null;
  const parsed = AnalysisSchema.safeParse(data.data);
  if (!parsed.success) console.warn("[getLatestAnalysis] 스키마 불일치:", parsed.error.issues.slice(0, 3));
  return (parsed.success ? parsed.data : data.data) as Analysis;
}

// ─────────────────────────────────────────────────────────────
// 문서 (내용증명·계약서 초안)
// ─────────────────────────────────────────────────────────────

export type DocumentKind = "notice_draft" | "contract_draft";

/** 초안 저장 (마크다운). 반환: 문서 id */
export async function saveDocument(caseId: string, kind: DocumentKind, content: string): Promise<string> {
  const { data, error } = await getServerDb()
    .from("documents")
    .insert({ case_id: caseId, kind, content })
    .select("id")
    .single();
  if (error) throw dbError("문서 저장", error);
  return data.id as string;
}

// ─────────────────────────────────────────────────────────────
// 예방 모드 채팅방
// ─────────────────────────────────────────────────────────────

/** room_messages 행 그대로 (화면 RoomChat의 MessageRow와 같은 모양) */
export interface RoomMessageRow {
  id: string;
  sender: RoomSender;
  kind: RoomMessageKind | null;
  text: string;
  payload: unknown;
  created_at: string | null;
}

const ROOM_MESSAGE_COLUMNS = "id, sender, kind, text, payload, created_at";

export function toRoomMessage(r: RoomMessageRow): RoomMessage {
  return { id: r.id, sender: r.sender, kind: r.kind ?? "text", text: r.text, payload: r.payload, createdAt: r.created_at };
}

export async function createRoom(title: string): Promise<string> {
  const { data, error } = await getServerDb().from("rooms").insert({ title }).select("id").single();
  if (error) throw dbError("채팅방 생성", error);
  return data.id as string;
}

/** 방 정보. 없으면 null. */
export async function getRoom(roomId: string): Promise<{ id: string; title: string; createdAt: string } | null> {
  const { data, error } = await getServerDb().from("rooms").select("id, title, created_at").eq("id", roomId).maybeSingle();
  if (error) throw dbError("채팅방 조회", error);
  return data ? { id: data.id, title: data.title, createdAt: data.created_at } : null;
}

/** 메시지 저장. 텍스트는 이미 마스킹된 것이어야 한다. 반환: 저장된 행 (화면에 바로 넣을 수 있게) */
export async function insertRoomMessage(
  roomId: string,
  message: { sender: RoomSender; kind?: RoomMessageKind; text: string; payload?: unknown },
): Promise<RoomMessageRow> {
  const { data, error } = await getServerDb()
    .from("room_messages")
    .insert({
      room_id: roomId,
      sender: message.sender,
      kind: message.kind ?? "text",
      text: message.text,
      payload: message.payload ?? null,
    })
    .select(ROOM_MESSAGE_COLUMNS)
    .single();
  if (error) throw dbError("채팅 메시지 저장", error);
  return data as RoomMessageRow;
}

export async function getRoomMessage(roomId: string, messageId: string): Promise<RoomMessage | null> {
  const { data, error } = await getServerDb()
    .from("room_messages")
    .select(ROOM_MESSAGE_COLUMNS)
    .eq("room_id", roomId)
    .eq("id", messageId)
    .maybeSingle();
  if (error) throw dbError("채팅 메시지 조회", error);
  return data ? toRoomMessage(data as RoomMessageRow) : null;
}

/** 최근 메시지 limit개 (오래된 순) */
export async function getRecentRoomMessages(roomId: string, limit = 40): Promise<RoomMessage[]> {
  const { data, error } = await getServerDb()
    .from("room_messages")
    .select(ROOM_MESSAGE_COLUMNS)
    .eq("room_id", roomId)
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw dbError("최근 채팅 조회", error);
  return ((data ?? []) as RoomMessageRow[]).map(toRoomMessage).reverse();
}

/** 방의 메시지 전체 (오래된 순, 1000개 넘어도 전부) — 분쟁 분석 전환용 */
export async function getAllRoomMessages(roomId: string): Promise<RoomMessage[]> {
  const db = getServerDb();
  const out: RoomMessage[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await db
      .from("room_messages")
      .select(ROOM_MESSAGE_COLUMNS)
      .eq("room_id", roomId)
      .order("created_at", { ascending: true })
      .range(from, from + PAGE - 1);
    if (error) throw dbError("채팅 조회", error);
    out.push(...((data ?? []) as RoomMessageRow[]).map(toRoomMessage));
    if (!data || data.length < PAGE) break;
  }
  return out;
}

/** 카드 메시지의 payload 교체 (조건 카드 확인 표시). Realtime UPDATE로 양쪽 화면에 반영된다. */
export async function updateRoomMessagePayload(roomId: string, messageId: string, payload: unknown): Promise<void> {
  const { error } = await getServerDb()
    .from("room_messages")
    .update({ payload })
    .eq("room_id", roomId)
    .eq("id", messageId);
  if (error) throw dbError("조건 카드 저장", error);
}

/** 양측이 확인한 최신 조건 (room_terms version 최댓값). 없거나 형식이 틀리면 null */
export async function getLatestRoomTerms(roomId: string): Promise<Terms | null> {
  const { data, error } = await getServerDb()
    .from("room_terms")
    .select("data")
    .eq("room_id", roomId)
    .order("version", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (error) throw dbError("확정 조건 조회", error);
  const parsed = TermsSchema.safeParse(data?.data);
  return parsed.success ? parsed.data : null;
}

/** 확정 조건 이력 전체 (version 오름차순) — 분쟁 분석 전환용 */
export async function getRoomTermsHistory(roomId: string): Promise<{ terms: Terms; createdAt: string }[]> {
  const { data, error } = await getServerDb()
    .from("room_terms")
    .select("data, created_at")
    .eq("room_id", roomId)
    .order("version", { ascending: true });
  if (error) throw dbError("조건 이력 조회", error);
  return (data ?? []).flatMap((r) => {
    const parsed = TermsSchema.safeParse(r.data);
    return parsed.success ? [{ terms: parsed.data, createdAt: r.created_at as string }] : [];
  });
}

/** 양측이 확인한 조건을 새 version으로 저장 (terms.version을 그대로 쓴다) */
export async function saveRoomTerms(roomId: string, terms: Terms): Promise<void> {
  const { error } = await getServerDb().from("room_terms").insert({ room_id: roomId, version: terms.version, data: terms });
  if (error) throw dbError("확정 조건 저장", error);
}

// ─────────────────────────────────────────────────────────────

function dbError(action: string, error: { message: string; code?: string }): Error {
  return new Error(`${action} 실패: ${error.message}${error.code ? ` (${error.code})` : ""}`);
}
