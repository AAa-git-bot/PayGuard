import sampleAnalysis from "@/data/sample/sample_analysis.json";
import { AnalysisSchema, type Analysis } from "@/lib/types";

export function loadCaseAnalysis(caseId: string): Analysis {
  void caseId;
  const parsed = AnalysisSchema.safeParse(sampleAnalysis);
  if (!parsed.success) {
    throw new Error("샘플 분석 데이터를 읽지 못했어요.");
  }
  return parsed.data;
}
