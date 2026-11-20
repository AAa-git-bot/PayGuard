// 담당: 민수빈 | PRD 7-2 대응 모드 분석 파이프라인
import "server-only";
import type { Analysis } from "../types";

// TODO: 1 로드 → 2 이미지 추출 → 3 extractEvents → 4 정렬·중복제거 → 5 detectConflicts
//       → 6 computeSettlement → 7 analyzeIssues → 8 requestEvidence → 9 summary/oneSided
//       → 10 diffAnalysis → 11 저장
export async function runAnalysis(caseId: string): Promise<Analysis> {
  void caseId;
  throw new Error("runAnalysis 미구현");
}
