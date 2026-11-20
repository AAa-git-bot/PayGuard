// 담당: 민수빈 | PRD 4-1 공통 타입·zod 스키마
// 타입을 바꾸면 PRD.md 4-1도 같이 고친다. 다른 담당자는 수정 요청만 한다.
import { z } from "zod";

export const PartySchema = z.enum(["me", "counterparty", "ai", "unknown"]);
export type Party = z.infer<typeof PartySchema>;

export const EventTypeSchema = z.enum([
  "promise", // 약속·합의 (금액, 범위, 납기 등)
  "change_request", // 조건 변경 요청
  "change_accept", // 변경 동의
  "delivery", // 납품·이행
  "revision_request", // 수정 요청
  "payment", // 입금
  "charge", // 추가 비용 청구
  "cancel_refund", // 취소·환불 요청
  "complaint", // 불만 제기
  "other",
]);
export type EventType = z.infer<typeof EventTypeSchema>;

export const CertaintySchema = z.enum(["confirmed", "claimed", "unverified"]);
export type Certainty = z.infer<typeof CertaintySchema>;

export const SourceRefSchema = z.object({
  sourceId: z.string(),
  seqFrom: z.number().int(),
  seqTo: z.number().int(),
  quote: z.string().describe("원문 일부(마스킹된 텍스트, 80자 이내)"),
});
export type SourceRef = z.infer<typeof SourceRefSchema>;

export const CaseEventSchema = z.object({
  id: z.string(),
  who: PartySchema,
  type: EventTypeSchema,
  what: z.string().describe("한 문장 요약"),
  sentAt: z.string().nullable().describe("메시지를 보낸 시각 (ISO)"),
  eventDate: z
    .string()
    .nullable()
    .describe("메시지가 말하는 사건 날짜 (ISO date). '어제 입금' → 전날"),
  amount: z.number().int().nullable().describe("원 단위 정수"),
  agreedByOther: z.enum(["yes", "no", "unknown"]),
  certainty: CertaintySchema,
  sources: z.array(SourceRefSchema).min(1),
  // 정산 계산용 보조 정보 (선택, 화면 표시용 아님). 재분석 때 이전 사건을 다시 쓰기 위해 함께 저장한다.
  amountKind: z.enum(["total", "deposit", "balance", "per_revision", "expense", "other"]).nullable().optional(),
  revisionsIncluded: z.number().int().nullable().optional(),
});
export type CaseEvent = z.infer<typeof CaseEventSchema>;

export const SettlementLineSchema = z.object({
  key: z.enum(["base", "paid", "unpaid", "disputed", "extra_expense", "unknown"]),
  label: z.string(),
  amount: z.number().int().nullable(),
  formula: z.string(),
  eventIds: z.array(z.string()),
  status: z.enum(["confirmed", "pending", "unverifiable"]),
  note: z.string(),
});
export type SettlementLine = z.infer<typeof SettlementLineSchema>;

export const IssueSchema = z.object({
  id: z.string(),
  title: z.string(),
  myClaim: z.string(),
  otherClaim: z.string(),
  facts: z.array(z.string()),
  supportsMe: z.array(z.string()),
  supportsOther: z.array(z.string()),
  toCheck: z.array(z.string()),
  eventIds: z.array(z.string()),
});
export type Issue = z.infer<typeof IssueSchema>;

export const EvidenceRequestSchema = z.object({
  id: z.string(),
  question: z.string(),
  why: z.string(),
  blocks: z.array(z.enum(["settlement", "issue"])),
  relatedIssueId: z.string().nullable(),
});
export type EvidenceRequest = z.infer<typeof EvidenceRequestSchema>;

export const AnalysisSchema = z.object({
  version: z.number().int(),
  events: z.array(CaseEventSchema),
  settlement: z.array(SettlementLineSchema),
  issues: z.array(IssueSchema),
  evidenceRequests: z.array(EvidenceRequestSchema),
  summary: z.string(),
  oneSided: z.boolean(),
  changedFromPrev: z.array(z.string()),
});
export type Analysis = z.infer<typeof AnalysisSchema>;

export const TermsSchema = z.object({
  scope: z.string().nullable(),
  revisionsIncluded: z.number().int().nullable(),
  deadline: z.string().nullable(),
  price: z.number().int().nullable(),
  paymentTerms: z.string().nullable(),
  confirmedByFreelancer: z.boolean(),
  confirmedByClient: z.boolean(),
  version: z.number().int(),
});
export type Terms = z.infer<typeof TermsSchema>;

// 파이프라인 내부에서 쓰는 메시지 형태 (DB messages 테이블과 대응)
export interface CaseMessage {
  sourceId: string;
  seq: number;
  sender: "me" | "counterparty" | "unknown";
  sentAt: string | null;
  text: string; // 마스킹된 텍스트
}

// 파이프라인에 넘기는 이미지 자료 (이체 내역·영수증). 실제 이름·계좌는 업로드 전에 가려져 있어야 한다.
export interface CaseImage {
  sourceId: string;
  data: Uint8Array | string; // 바이트 또는 base64
  mediaType: string; // 예: "image/png"
  filename?: string;
}
