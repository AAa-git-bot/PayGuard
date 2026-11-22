import type { Analysis } from "@/lib/types";

// 출처 모달에 보여줄 원문 한 줄 (마스킹된 텍스트)
export interface SourceLine {
  sourceId: string;
  seq: number;
  sender: string; // 화면 표시용: "나" / "상대방" / "시스템"
  sentAt: string | null;
  text: string;
}

// 결과 화면 한 장에 필요한 데이터 (app/cases/[id]/load-analysis.ts가 만든다)
export interface CaseView {
  id: string;
  title: string;
  live: boolean; // DB에 저장된 사건이면 true (다시 분석·자료 추가 가능)
  analysis: Analysis | null;
  lines: SourceLine[];
  maskedCount: number;
  sourceNames: Record<string, string>; // sourceId → 화면에 보일 자료 이름 (파일명 등)
  sampleExtra: string | null; // 샘플 사건일 때만: "샘플 추가 증거 넣기"용 원본 텍스트(가상 데이터, 서버가 마스킹)
}
