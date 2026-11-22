// 담당: 민수빈 | DB 없이 "분쟁 분석으로 보내기"(예방 모드 → 대응 모드) 결과를 확인하는 개발용 스크립트 (PRD ⑪, 10장 #19)
//
//   npx tsx scripts/run-to-case.ts
//
// app/api/rooms/[id]/to-case와 같은 방식으로 자료를 만든다:
//   프리랜서 → me, 의뢰인 → counterparty, 양측 확인 조건 → sender unknown의 "[PayGuard 기록] ..." 줄, 자료 종류 room_chat
import "./_server-only-shim";
import fs from "node:fs";
import path from "node:path";
import { analyzeMessages, PAYGUARD_RECORD } from "../lib/agent/pipeline";
import { formatTerms } from "../lib/agent/prevent";
import type { CaseMessage, Terms } from "../lib/types";

const ROOT = path.resolve(__dirname, "..");
const SOURCE = "src-room-chat";
const won = (n: number | null) => (n === null ? "-" : `${n.toLocaleString("ko-KR")}원`);

const terms = (version: number, t: Partial<Terms>): Terms => ({
  scope: null,
  revisionsIncluded: null,
  deadline: null,
  price: null,
  paymentTerms: null,
  ...t,
  confirmedByFreelancer: true,
  confirmedByClient: true,
  version,
});

// [시각, 보낸 사람, 내용]
const LINES: [string, CaseMessage["sender"], string][] = [
  ["2026-06-02T14:01", "me", "안녕하세요! 로고 디자인은 시안 2종에 최종 파일(AI, PNG)까지 80만 원이에요."],
  ["2026-06-02T14:02", "counterparty", "좋아요, 그렇게 진행해요."],
  ["2026-06-02T14:04", "unknown", `${PAYGUARD_RECORD} 프리랜서·의뢰인 양측 확인 완료 조건 v1\n${formatTerms(terms(1, { scope: "로고 디자인: 시안 2종, 최종 파일(AI, PNG)", price: 800000 }))}`],
  ["2026-06-02T14:05", "me", "수정은 2번까지 포함이고, 선금 50% 받고 시작해서 납품 후 잔금 받을게요."],
  ["2026-06-02T14:06", "counterparty", "네 알겠습니다."],
  ["2026-06-02T14:08", "unknown", `${PAYGUARD_RECORD} 프리랜서·의뢰인 양측 확인 완료 조건 v2\n${formatTerms(terms(2, { scope: "로고 디자인: 시안 2종, 최종 파일(AI, PNG)", price: 800000, revisionsIncluded: 2, paymentTerms: "선금 50%, 납품 후 잔금" }))}`],
  ["2026-06-03T11:05", "counterparty", "선금 40만 원 보냈어요."],
  ["2026-06-10T18:00", "me", "시안 2종 보내드려요!"],
  ["2026-06-11T10:20", "counterparty", "글씨체를 조금 더 둥글게 바꿔주세요."],
  ["2026-06-12T15:40", "me", "수정본 보내드려요."],
  ["2026-06-13T13:15", "counterparty", "컵 아이콘도 작게 해주세요."],
  ["2026-06-14T11:00", "me", "2회차 수정본입니다."],
  ["2026-06-16T16:30", "counterparty", "색도 한 번만 더 진하게 바꿔주세요."],
  ["2026-06-17T14:00", "me", "3회차 수정본 보내드려요. 합의한 2회를 넘어서 추가 비용은 따로 말씀드릴게요."],
  ["2026-06-20T19:30", "me", "최종본 보내드려요! AI 파일과 PNG 같이 드립니다."],
  ["2026-06-21T12:40", "counterparty", "최종본이 마음에 안 들어서 잔금은 좀 생각해볼게요."],
];

async function main() {
  const envFile = path.join(ROOT, ".env.local");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY가 없어요. .env.local을 확인하세요.");
    process.exit(1);
  }

  const messages: CaseMessage[] = LINES.map(([at, sender, text], i) => ({
    sourceId: SOURCE,
    seq: i + 1,
    sender,
    sentAt: `${at}:00+09:00`,
    text,
  }));
  const r = await analyzeMessages(messages, [], null, { sharedSourceIds: [SOURCE] });
  const a = r.analysis;

  console.log(`oneSided: ${a.oneSided} (room_chat 자료라 false여야 함) | 실패 단계: ${r.failedSteps.join(", ") || "없음"}`);
  console.log(`\n[이벤트]`);
  for (const e of a.events) {
    const seqs = e.sources.map((s) => (s.seqFrom === s.seqTo ? `#${s.seqFrom}` : `#${s.seqFrom}~${s.seqTo}`)).join(",");
    const record = e.sources.some((s) => messages.slice(s.seqFrom - 1, s.seqTo).some((m) => m.text.startsWith(PAYGUARD_RECORD)));
    console.log(`  ${e.id.padEnd(24)} ${e.type.padEnd(16)} ${won(e.amount).padStart(10)} ${e.certainty.padEnd(10)} 동의:${e.agreedByOther.padEnd(7)} ${seqs.padEnd(10)}${record ? " [기록]" : ""} ${e.what}`);
  }
  console.log(`\n[정산표]`);
  for (const l of a.settlement) console.log(`  ${l.key.padEnd(9)} ${won(l.amount).padStart(10)} ${l.status.padEnd(12)} ${l.formula} | ${l.note}`);
  console.log(`\n[쟁점] ${a.issues.map((i) => i.title).join(" / ")}`);
  console.log(`[증거 요청] ${a.evidenceRequests.map((q) => q.question).join(" / ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
