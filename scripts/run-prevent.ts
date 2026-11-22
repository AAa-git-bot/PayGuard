// 담당: 민수빈 | DB 없이 예방 모드 에이전트를 시나리오로 실행해 보는 개발용 스크립트 (PRD 6장 예방 모드, 10장 #16~18)
//
//   npx tsx scripts/run-prevent.ts
//
// 사람 메시지를 하나씩 넣고, 그때마다 AI가 게시할 메시지(조건 카드·변경 경고·확인 질문)를 출력한다.
// 조건 카드가 올라오면 양측이 바로 확인했다고 가정하고 확정 조건(room_terms)으로 저장한다.
import "./_server-only-shim";
import fs from "node:fs";
import path from "node:path";
import { planPosts, preventAgent, type RoomMessage, type RoomSender, type TermsCardPayload } from "../lib/agent/prevent";
import type { Terms } from "../lib/types";

const ROOT = path.resolve(__dirname, "..");

// 시나리오: [보낸 사람, 내용, 기대(설명용)]
const SCENARIO: [RoomSender, string, string][] = [
  ["freelancer", "안녕하세요! 로고 디자인은 시안 2종에 최종 파일(AI, PNG)까지 80만 원이에요.", ""],
  ["client", "좋아요, 그렇게 진행해요.", "조건 카드 (금액·범위)"],
  ["freelancer", "수정은 2번까지 포함이고, 선금 50% 받고 시작해서 납품 후 잔금 받을게요.", ""],
  ["client", "네 알겠습니다.", "조건 카드 (수정 2회·지급 조건)"],
  ["client", "최종본은 다음 주쯤 받을 수 있을까요?", "확인 질문 (다음 주쯤)"],
  ["freelancer", "네 6월 12일까지 드릴게요.", ""],
  ["client", "네 좋아요", "조건 카드 (납기)"],
  ["client", "글씨체를 조금 더 둥글게 바꿔주세요.", "아무것도 안 함 (수정 1회차)"],
  ["freelancer", "네 수정 1회차로 반영할게요.", ""],
  ["client", "컵 아이콘도 작게 해주세요.", "아무것도 안 함 (수정 2회차)"],
  ["freelancer", "네 수정 2회차로 반영하겠습니다.", ""],
  ["client", "색도 한 번만 더 진하게 바꿔주세요.", "변경 경고 (수정 3회차 > 합의 2회)"],
];

async function main() {
  const envFile = path.join(ROOT, ".env.local");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY가 없어요. .env.local을 확인하세요.");
    process.exit(1);
  }

  const today = new Date("2026-06-02T14:00:00+09:00");
  const room: RoomMessage[] = [];
  let terms: Terms | null = null;
  let n = 0;
  const add = (sender: RoomSender, kind: RoomMessage["kind"], text: string, payload: unknown = null) => {
    n++;
    const createdAt = new Date(today.getTime() + n * 60_000).toISOString();
    room.push({ id: `m${n}`, sender, kind, text, payload, createdAt });
  };

  let failures = 0;
  for (const [sender, text, expect] of SCENARIO) {
    add(sender, "text", text);
    console.log(`\n${sender === "freelancer" ? "프리랜서" : "의뢰인"}: ${text}${expect ? `   ← 기대: ${expect}` : ""}`);

    const { ok, ...result } = await preventAgent({ messages: room, terms, today });
    if (!ok) failures++;
    const posts = planPosts(result, terms, room);
    if (!posts.length) console.log("   AI: (게시 안 함)");
    for (const p of posts) {
      add("ai", p.kind, p.text, p.payload);
      console.log(`   AI [${p.kind}] ${p.text.replace(/\n/g, "\n        ")}`);
      if (p.kind === "terms_card" && p.payload) {
        // 양측 확인 → 확정
        const proposed = (p.payload as TermsCardPayload).terms;
        terms = { ...proposed, confirmedByFreelancer: true, confirmedByClient: true };
        console.log(`   (양측 확인 완료 ✓ → 확정 조건 v${terms.version}, 바뀐 항목: ${(p.payload as TermsCardPayload).changed.join(", ")})`);
      }
    }
  }

  console.log(`\n최종 확정 조건: ${JSON.stringify(terms)}`);
  console.log(`LLM 호출 실패: ${failures}회`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
