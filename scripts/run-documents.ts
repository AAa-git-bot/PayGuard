// 담당: 민수빈 | DB 없이 내용증명·계약서 초안을 만들어 보는 개발용 스크립트 (PRD ⑬⑭, 10장 #13~14)
//
//   npx tsx scripts/run-documents.ts
import "./_server-only-shim";
import fs from "node:fs";
import path from "node:path";
import { buildContractDraft, buildNoticeDraft, NEED_AGREEMENT, NOTICE_WATERMARK } from "../lib/agent/documents";
import { AnalysisSchema, type Analysis } from "../lib/types";

const ROOT = path.resolve(__dirname, "..");
const load = (f: string): Analysis =>
  AnalysisSchema.parse(JSON.parse(fs.readFileSync(path.join(ROOT, "data", "sample", f), "utf8")));
const won = (n: number | null) => (n === null ? "-" : `${n.toLocaleString("ko-KR")}원`);

async function main() {
  const envFile = path.join(ROOT, ".env.local");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY가 없어요. .env.local을 확인하세요.");
    process.exit(1);
  }

  const sample = load("sample_analysis.json");
  const unpaid = sample.settlement.find((l) => l.key === "unpaid");
  console.log(`\n═══ 1. 내용증명 — sample_analysis.json (미지급 ${won(unpaid?.amount ?? null)} / ${unpaid?.status}) ═══`);
  const r1 = await buildNoticeDraft(sample, "2026-07-20", "2026-07-06");
  if (r1.ok) {
    console.log(`(생성: ${r1.source}, 워터마크 ${r1.content.startsWith(`> **${NOTICE_WATERMARK}**`) ? "있음" : "없음"})\n`);
    console.log(r1.content);
    const disputed = sample.settlement.find((l) => l.key === "disputed")?.amount;
    if (disputed && r1.content.includes(won(disputed))) console.log("⚠ 다툼이 있는 금액이 섞였어요");
  } else console.log(`거부: ${r1.reason}`);

  const real = load("sample_analysis_real.json");
  const u2 = real.settlement.find((l) => l.key === "unpaid");
  console.log(`\n═══ 2. 내용증명 — sample_analysis_real.json (미지급 ${won(u2?.amount ?? null)} / ${u2?.status}) ═══`);
  const r2 = await buildNoticeDraft(real, "2026-07-20");
  console.log(r2.ok ? `⚠ 생성됨 (거부돼야 함)` : `거부: ${r2.reason}`);

  console.log(`\n═══ 3. 내용증명 — 기한 형식 오류 ═══`);
  const r3 = await buildNoticeDraft(sample, "다음 주");
  console.log(r3.ok ? `⚠ 생성됨 (거부돼야 함)` : `거부: ${r3.reason}`);

  console.log(`\n═══ 4. 계약서 — 일부 조건만 확정 ═══`);
  const r4 = await buildContractDraft({ scope: "카페 로고 디자인: 시안 2종, 최종 파일(AI, PNG)", price: 800000, revisionsIncluded: 2, deadline: null, paymentTerms: "선금 50%, 납품 후 잔금" });
  if (r4.ok) {
    console.log(`(생성: ${r4.source}, "${NEED_AGREEMENT}" ${r4.content.split(NEED_AGREEMENT).length - 1}개)\n`);
    console.log(r4.content);
  } else console.log(`거부: ${r4.reason}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
