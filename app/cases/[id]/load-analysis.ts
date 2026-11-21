import fs from "node:fs";
import path from "node:path";
import sampleAnalysis from "@/data/sample/sample_analysis.json";
import { getCase } from "@/lib/db";
import { maskText } from "@/lib/mask";
import { parseKakao } from "@/lib/parse-kakao";
import { AnalysisSchema } from "@/lib/types";
import type { CaseView } from "@/components/case-view";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const SAMPLE_TITLE = "로고 디자인 외주 잔금 분쟁 (샘플)";
const SENDER_LABEL = { me: "나", counterparty: "상대방", unknown: "시스템" } as const;

// 샘플 대화 참여자 실명 → "나"/"상대방"
const SAMPLE_NAMES: [string, string][] = [
  ["온새미로카페(사장님 개인)", "상대방"],
  ["온새미로카페", "상대방"],
  ["하은", "나"],
];

function readSample(file: string) {
  let text = fs.readFileSync(path.join(process.cwd(), "data/sample", file), "utf8");
  for (const [name, alias] of SAMPLE_NAMES) text = text.replaceAll(name, alias);
  return maskText(text);
}

/**
 * 사건 하나를 화면용으로 불러온다.
 * - uuid: Supabase에 저장된 사건 (GET /api/cases/[id]와 같은 lib/db.ts getCase 사용)
 * - 그 외(예: /cases/sample): DB 없이 data/sample 파일로 보여주는 데모 화면
 */
export async function loadCase(id: string): Promise<CaseView> {
  if (!UUID.test(id)) return loadLocalSample(id);

  let detail: Awaited<ReturnType<typeof getCase>>;
  try {
    detail = await getCase(id);
  } catch (error) {
    console.error("[cases/[id]] getCase 실패:", error);
    throw new Error("사건을 불러오지 못했어요. 잠시 후 다시 시도해 주세요.");
  }
  if (!detail) throw new Error("사건을 찾을 수 없어요. 링크를 다시 확인해 주세요.");

  return {
    id,
    title: detail.case.title,
    live: true,
    analysis: detail.analysis,
    lines: detail.messages.map((message) => ({
      sourceId: message.sourceId,
      seq: message.seq,
      sender: SENDER_LABEL[message.sender] ?? "시스템",
      sentAt: message.sentAt,
      text: message.text,
    })),
    maskedCount: detail.maskedCount,
    sampleExtra: detail.case.isSample ? readSample("kakao_haeun_extra.txt").text : null,
  };
}

function loadLocalSample(id: string): CaseView {
  const parsed = AnalysisSchema.safeParse(sampleAnalysis);
  if (!parsed.success) throw new Error("샘플 분석 데이터를 읽지 못했어요.");
  const masked = readSample("kakao_haeun.txt");
  const { messages } = parseKakao(masked.text);
  return {
    id,
    title: SAMPLE_TITLE,
    live: false,
    analysis: parsed.data,
    lines: messages.map((message, index) => ({
      sourceId: "kakao-haeun",
      seq: index + 1,
      sender: message.sender === "unknown" ? "시스템" : message.sender,
      sentAt: message.sentAt,
      text: message.text,
    })),
    maskedCount: masked.count,
    sampleExtra: readSample("kakao_haeun_extra.txt").text,
  };
}
