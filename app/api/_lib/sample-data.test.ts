// 담당: 이다은 | /api/sample이 쓰는 샘플 파일 검증 (sample_analysis.json이 채워지면 자동으로 검사됨)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { maskText } from "../../../lib/mask";
import { parseKakao } from "../../../lib/parse-kakao";
import { AnalysisSchema } from "../../../lib/types";

const dir = join(__dirname, "..", "..", "..", "data", "sample");
const kakao = parseKakao(readFileSync(join(dir, "kakao_haeun.txt"), "utf8"));
const analysisRaw = readFileSync(join(dir, "sample_analysis.json"), "utf8").trim();

describe("kakao_haeun.txt", () => {
  it("'나' = 하은, 상대방 1명", () => {
    expect(kakao.participants).toEqual(["하은", "온새미로카페"]);
  });

  it("마스킹 후 실명·가상 번호가 남지 않는다", () => {
    const names = { me: "하은", others: ["온새미로카페"] };
    const all = kakao.messages.map((m) => maskText(m.text, names).text).join("\n");
    for (const s of ["하은", "온새미로카페", "010-0000-1234", "110-000-000000"]) expect(all).not.toContain(s);
  });
});

describe.skipIf(analysisRaw === "")("sample_analysis.json", () => {
  const data = analysisRaw ? JSON.parse(analysisRaw) : null;

  it("Analysis 스키마에 맞는다", () => {
    const r = AnalysisSchema.safeParse(data);
    expect(r.success ? [] : r.error.issues.slice(0, 5)).toEqual([]);
  });

  it("sourceId는 kakao-haeun / transfer-haeun(밑줄도 가능), seq는 카톡 메시지 범위 안", () => {
    const max = kakao.messages.length;
    for (const ev of data.events) {
      for (const s of ev.sources) {
        const sid = String(s.sourceId).replace(/-/g, "_");
        expect(["kakao_haeun", "transfer_haeun"]).toContain(sid);
        if (sid === "kakao_haeun") {
          expect(s.seqFrom).toBeGreaterThanOrEqual(1);
          expect(s.seqTo).toBeLessThanOrEqual(max);
          expect(s.seqFrom).toBeLessThanOrEqual(s.seqTo);
        }
      }
    }
  });

  it("정산표: base 800,000 / paid 400,000 / unpaid 400,000 (PRD 7-3)", () => {
    const amount = (key: string) => data.settlement.find((l: { key: string }) => l.key === key)?.amount;
    expect([amount("base"), amount("paid"), amount("unpaid")]).toEqual([800000, 400000, 400000]);
  });
});
