// 담당: 이다은 | PRD ①
// POST /api/sample  →  { id }
// data/sample/kakao_haeun.txt를 파싱·마스킹해 새 사건으로 저장("나" = 하은)하고,
// sample_analysis.json을 version 1 분석으로 저장한다. LLM을 부르지 않으므로 3초 안에 끝나야 한다.
//
// sample_analysis.json의 sources[].sourceId 규칙 (하이픈·밑줄 둘 다 가능):
//   "kakao-haeun"    → 이번에 저장한 카톡 source id로 바뀜 (모르는 값도 전부 카톡 source로)
//   "transfer-haeun" → 이체 내역 이미지 source id로 바뀜 (이미지 파일이 있을 때)
// seq는 kakao_haeun.txt를 lib/parse-kakao.ts로 파싱한 순서(1부터)와 같아야 한다.
import { readFile } from "node:fs/promises";
import path from "node:path";
import { createCase, saveAnalysis } from "@/lib/db";
import { AnalysisSchema, type Analysis } from "@/lib/types";
import { jsonError } from "../_lib/http";
import { prepareUpload, SAMPLE_ME, saveUpload } from "../_lib/ingest";

const SAMPLE_DIR = path.join(process.cwd(), "data", "sample");
const SAMPLE_TITLE = "로고 디자인 외주 잔금 분쟁 (샘플)";

export async function POST() {
  try {
    // ── 1) 파일 읽기·검증 (DB에 쓰기 전에) ──
    const [kakaoRaw, analysisRaw, transfer] = await Promise.all([
      readFile(path.join(SAMPLE_DIR, "kakao_haeun.txt"), "utf8"),
      readFile(path.join(SAMPLE_DIR, "sample_analysis.json"), "utf8"),
      readFile(path.join(SAMPLE_DIR, "transfer_haeun.png")).catch(() => null),
    ]);

    let analysisJson: unknown;
    try {
      analysisJson = JSON.parse(analysisRaw);
    } catch (e) {
      return jsonError(503, "샘플 분석 결과가 아직 준비되지 않았어요. 잠시 후 다시 시도해 주세요.", e);
    }
    const parsed = AnalysisSchema.safeParse(analysisJson);
    if (!parsed.success) {
      // 데모가 멈추지 않도록 저장은 하되, 고쳐야 할 곳을 서버 로그에 남긴다
      console.warn("[api/sample] sample_analysis.json 스키마 불일치:", parsed.error.issues.slice(0, 5));
    }
    const analysis = (parsed.success ? parsed.data : analysisJson) as Analysis;
    const hasImage = transfer !== null && transfer.byteLength > 0;

    // ── 2) 저장 ──
    const caseId = await createCase({ title: SAMPLE_TITLE, isSample: true });
    const prepared = prepareUpload(
      caseId,
      {
        texts: [{ filename: "kakao_haeun.txt", raw: kakaoRaw }],
        images: hasImage ? [{ filename: "transfer_haeun.png", bytes: toArrayBuffer(transfer), contentType: "image/png" }] : [],
        myName: SAMPLE_ME,
      },
      { isSample: true, myNameHash: null },
    );
    const saved = await saveUpload(caseId, prepared); // sourceIds: [카톡, (이미지)]

    const kakaoSourceId = saved.sourceIds[0];
    const imageSourceId = hasImage ? saved.sourceIds[1] : null;
    await saveAnalysis(caseId, {
      ...analysis,
      version: 1,
      changedFromPrev: [],
      events: (analysis.events ?? []).map((ev) => ({
        ...ev,
        sources: (ev.sources ?? []).map((s) => ({
          ...s,
          sourceId: normalizeId(s.sourceId) === "transfer_haeun" && imageSourceId ? imageSourceId : kakaoSourceId,
        })),
      })),
    });

    return Response.json({ id: caseId });
  } catch (e) {
    return jsonError(500, "샘플 사건을 만들지 못했어요. 잠시 후 다시 시도해 주세요.", e);
  }
}

function normalizeId(id: string): string {
  return String(id ?? "").trim().toLowerCase().replace(/-/g, "_");
}

function toArrayBuffer(buf: Buffer): ArrayBuffer {
  return buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength) as ArrayBuffer;
}
