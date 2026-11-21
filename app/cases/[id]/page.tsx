import fs from "node:fs";
import path from "node:path";
import { CaseResult } from "@/components/CaseResult";
import { maskText } from "@/lib/mask";
import { loadCaseAnalysis } from "./load-analysis";

// 샘플 대화 참여자 실명 → "나"/"상대방" (lib/mask.ts의 이름 치환이 생기면 그쪽으로 옮긴다)
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

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const analysis = loadCaseAnalysis(id);
  const masked = readSample("kakao_haeun.txt");
  const extra = readSample("kakao_haeun_extra.txt");

  return (
    <CaseResult
      id={id}
      analysis={analysis}
      transcript={masked.text}
      maskedCount={masked.count}
      sampleExtra={extra.text}
    />
  );
}
