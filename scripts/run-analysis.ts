// 담당: 민수빈 | DB 없이 분석 파이프라인을 실행해 보는 개발용 스크립트 (PRD 11장)
//
//   npx tsx scripts/run-analysis.ts --extract   1단계: 추출 결과만 (kakao_haeun.txt)
//   npx tsx scripts/run-analysis.ts             v1(kakao_haeun) → v2(+kakao_haeun_extra) 비교
//   npx tsx scripts/run-analysis.ts --save      위 결과를 data/sample/sample_analysis_real(_v2).json으로 저장
//   --image [경로]                               이체 내역·영수증 이미지 추가 (경로 생략 시 data/sample/transfer_haeun.png)
//
// .env.local의 ANTHROPIC_API_KEY, LLM_MODEL을 읽는다.
import "./_server-only-shim";
import fs from "node:fs";
import path from "node:path";
import {
  analyzableMessages,
  analyzeMessages,
  CHUNK_SIZE,
  extractEvents,
  findVerdictLanguage,
  normalizeEvents,
  type AnalyzeResult,
} from "../lib/agent/pipeline";
import { maskText } from "../lib/mask";
import type { Analysis, CaseEvent, CaseImage, CaseMessage } from "../lib/types";

const ROOT = path.resolve(__dirname, "..");
const SAMPLE = path.join(ROOT, "data", "sample");
const MY_NAME = "하은";

// ───────── 임시 카톡 파서 (모바일 형식만) ─────────
// lib/parse-kakao.ts(이다은)가 완성되면 그걸로 바꾼다. 여기서만 쓴다.
const DATE_HEADER = /^-+\s*(\d{4})년\s*(\d{1,2})월\s*(\d{1,2})일.*?-+\s*$/;
const MESSAGE_LINE = /^\[(.+?)\]\s*\[(오전|오후)\s*(\d{1,2}):(\d{2})\]\s?(.*)$/;
const SYSTEM_TEXT = /^(사진|사진 \d+장|이모티콘|동영상|음성메시지)$|님이 (들어왔습니다|나갔습니다)/;

interface ParsedFile {
  participants: string[];
  messages: CaseMessage[];
  maskedCount: number;
}

function parseMobileKakao(raw: string, sourceId: string, startSeq: number): ParsedFile {
  const lines = raw.replace(/^﻿/, "").split(/\r?\n/);
  const msgs: { name: string; sentAt: string; text: string }[] = [];
  let date: string | null = null;
  for (const line of lines) {
    const h = line.match(DATE_HEADER);
    if (h) {
      date = `${h[1]}-${h[2].padStart(2, "0")}-${h[3].padStart(2, "0")}`;
      continue;
    }
    const m = line.match(MESSAGE_LINE);
    if (m && date) {
      let hour = Number(m[3]) % 12;
      if (m[2] === "오후") hour += 12;
      msgs.push({ name: m[1], sentAt: `${date}T${String(hour).padStart(2, "0")}:${m[4]}:00+09:00`, text: m[5] });
      continue;
    }
    // 형식에 맞지 않는 줄은 직전 메시지에 이어 붙인다 (머리말·빈 줄은 무시)
    if (msgs.length && line.trim()) msgs[msgs.length - 1].text += `\n${line}`;
  }

  const participants = [...new Set(msgs.map((m) => m.name))];
  const others = participants.filter((p) => p !== MY_NAME);
  let maskedCount = 0;
  const messages = msgs.map((m, i): CaseMessage => {
    const masked = maskText(m.text, { me: MY_NAME, others });
    maskedCount += masked.count;
    return {
      sourceId,
      seq: startSeq + i,
      sender: SYSTEM_TEXT.test(m.text.trim()) ? "unknown" : m.name === MY_NAME ? "me" : "counterparty",
      sentAt: m.sentAt,
      text: masked.text,
    };
  });
  return { participants, messages, maskedCount };
}

function loadKakao(file: string, startSeq: number): ParsedFile {
  const sourceId = `src-${path.basename(file, ".txt")}`;
  return parseMobileKakao(fs.readFileSync(path.join(SAMPLE, file), "utf8"), sourceId, startSeq);
}

function loadImage(p: string | null): CaseImage[] {
  if (!p || !fs.existsSync(p)) return [];
  const data = fs.readFileSync(p);
  if (!data.length) {
    console.log(`(이미지 ${path.relative(ROOT, p)}가 비어 있어서 건너뜀 → 입금 confirmed 이벤트 없음)`);
    return [];
  }
  const ext = path.extname(p).toLowerCase();
  const mediaType = ext === ".jpg" || ext === ".jpeg" ? "image/jpeg" : ext === ".webp" ? "image/webp" : "image/png";
  return [{ sourceId: `src-${path.basename(p, ext)}`, data: new Uint8Array(data), mediaType, filename: path.basename(p) }];
}

// ───────── 출력 ─────────
const won = (n: number | null) => (n === null ? "-" : `${n.toLocaleString("ko-KR")}원`);
const seqs = (e: CaseEvent) =>
  e.sources.map((s) => (s.seqFrom === 0 ? "img" : s.seqFrom === s.seqTo ? `#${s.seqFrom}` : `#${s.seqFrom}~${s.seqTo}`)).join(",");
const md = (iso: string | null) => (iso ? `${Number(iso.slice(5, 7))}/${Number(iso.slice(8, 10))}` : "?");

function printEvents(events: CaseEvent[]) {
  for (const e of events) {
    const date = e.sentAt && md(e.sentAt) !== md(e.eventDate) ? `${md(e.sentAt)} 보냄·사건일 ${md(e.eventDate)}` : md(e.eventDate ?? e.sentAt);
    console.log(
      `  ${e.id.padEnd(26)} ${date.padEnd(16)} ${e.who.padEnd(12)} ${e.type.padEnd(16)} ${won(e.amount).padStart(10)}  ${e.certainty.padEnd(10)} 동의:${e.agreedByOther.padEnd(7)} ${seqs(e).padEnd(10)} ${e.what}`,
    );
  }
}

function printAnalysis(label: string, r: AnalyzeResult) {
  const a = r.analysis;
  console.log(`\n════════ ${label} (version ${a.version}) ════════`);
  console.log(`요약: ${a.summary}`);
  console.log(`oneSided: ${a.oneSided} | 실패 단계: ${r.failedSteps.join(", ") || "없음"} | 추출 원본 ${r.debug.rawEventCount}개 → ${a.events.length}개`);
  console.log(`\n[이벤트]`);
  printEvents(a.events);
  console.log(`\n[충돌] ${r.debug.conflicts.conflicts.map((c) => `${c.eventIds.join("↔")}: ${c.description}`).join(" / ") || "없음"}`);
  console.log(`[누락] ${r.debug.conflicts.missing.map((m) => m.description).join(" / ") || "없음"}`);
  console.log(`\n[정산표]`);
  for (const l of a.settlement)
    console.log(`  ${l.key.padEnd(13)} ${won(l.amount).padStart(10)}  ${l.status.padEnd(12)} ${l.formula}  | 근거 ${l.eventIds.join(",") || "-"} | ${l.note}`);
  console.log(`\n[쟁점]`);
  for (const i of a.issues) {
    console.log(`  ■ ${i.id}: ${i.title}`);
    console.log(`     내 주장: ${i.myClaim}`);
    console.log(`     상대 주장: ${i.otherClaim}`);
    for (const f of i.facts) console.log(`     · 사실 ${f}`);
    for (const f of i.supportsMe) console.log(`     + 나 ${f}`);
    for (const f of i.supportsOther) console.log(`     - 상대 ${f}`);
    for (const f of i.toCheck) console.log(`     ? ${f}`);
  }
  console.log(`\n[증거 요청]`);
  for (const q of a.evidenceRequests)
    console.log(`  ${q.id}: ${q.question} (보류: ${q.blocks.join(",") || "-"}, 쟁점 ${q.relatedIssueId ?? "-"})\n     이유: ${q.why}`);
  console.log(`\n[changedFromPrev] ${a.changedFromPrev.join(", ") || "(첫 버전)"}`);
  const verdicts = findVerdictLanguage(a);
  console.log(`[판단 표현 점검] ${verdicts.length ? `의심 ${verdicts.length}건:\n  ${verdicts.join("\n  ")}` : "과실 비율·책임 단정 표현 없음"}`);
}

// ───────── 실행 ─────────
async function main() {
  const args = process.argv.slice(2);
  const envFile = path.join(ROOT, ".env.local");
  if (fs.existsSync(envFile)) process.loadEnvFile(envFile);
  if (!process.env.ANTHROPIC_API_KEY) {
    console.error("ANTHROPIC_API_KEY가 없어요. .env.local을 확인하세요.");
    process.exit(1);
  }
  const imgIdx = args.indexOf("--image");
  // --image만 주면 샘플 이체 내역, --image <경로>면 그 파일. 안 주면 이미지 없이 (저장 파일 v1·v2는 대화만으로 만든다)
  const imageArg = imgIdx >= 0 ? args[imgIdx + 1] : undefined;
  const imagePath =
    imgIdx < 0 ? null : imageArg && !imageArg.startsWith("--") ? path.resolve(imageArg) : path.join(SAMPLE, "transfer_haeun.png");

  const base = loadKakao("kakao_haeun.txt", 1);
  console.log(`모델: ${process.env.LLM_MODEL ?? "claude-haiku-5-5(기본)"}`);
  console.log(
    `kakao_haeun.txt: 참여자 ${base.participants.join(", ")} | 메시지 ${base.messages.length}개 (분석 대상 ${analyzableMessages(base.messages).length}개, ${CHUNK_SIZE}개 단위) | 마스킹 ${base.maskedCount}건`,
  );
  for (const m of base.messages.filter((m) => /\[(전화번호|계좌번호)\]/.test(m.text))) console.log(`  마스킹 확인 #${m.seq}: ${m.text}`);

  if (args.includes("--extract")) {
    const raw = await extractEvents(base.messages);
    console.log(`\n[추출 원본 — 코드 검증 후, 중복 제거 전] ${raw.length}개`);
    printEvents(raw.map((e, i) => ({ ...e, id: `raw-${i + 1}` })));
    const events = normalizeEvents(raw);
    console.log(`\n[정렬·중복 제거 후] ${events.length}개`);
    printEvents(events);
    console.log(`
[정산용 보조 정보]`);
    for (const e of events)
      if (e.hints.amountKind || e.hints.revisionsIncluded !== null)
        console.log(`  ${e.id.padEnd(26)} amountKind=${e.hints.amountKind ?? "-"} revisionsIncluded=${e.hints.revisionsIncluded ?? "-"}`);
    return;
  }

  const images = loadImage(imagePath);
  const v1 = await analyzeMessages(base.messages, images, null);
  printAnalysis("v1: kakao_haeun.txt", v1);

  const extra = loadKakao("kakao_haeun_extra.txt", base.messages.length + 1);
  console.log(`\nkakao_haeun_extra.txt: 메시지 ${extra.messages.length}개 (seq ${extra.messages[0]?.seq}~${extra.messages.at(-1)?.seq})`);
  const v2 = await analyzeMessages([...base.messages, ...extra.messages], images, v1.analysis);
  printAnalysis("v2: + kakao_haeun_extra.txt", v2);

  printComparison(v1.analysis, v2.analysis);

  if (args.includes("--save")) {
    const out1 = path.join(SAMPLE, "sample_analysis_real.json");
    const out2 = path.join(SAMPLE, "sample_analysis_real_v2.json");
    fs.writeFileSync(out1, JSON.stringify(v1.analysis, null, 2) + "\n");
    fs.writeFileSync(out2, JSON.stringify(v2.analysis, null, 2) + "\n");
    console.log(`\n저장: ${path.relative(ROOT, out1)}, ${path.relative(ROOT, out2)}`);
  }
}

function printComparison(a: Analysis, b: Analysis) {
  const revisionReq = (x: Analysis) => x.evidenceRequests.filter((r) => /수정.*(횟수|회수|몇\s*번|포함|단가|추가\s*비용)|(횟수|회수|단가).*수정/.test(r.question + r.why));
  console.log(`\n════════ v1 → v2 비교 ════════`);
  console.log(`"수정 횟수" 관련 증거 요청: v1 ${revisionReq(a).length}개 → v2 ${revisionReq(b).length}개`);
  for (const r of revisionReq(a)) console.log(`  v1 ${r.id}: ${r.question}`);
  for (const r of revisionReq(b)) console.log(`  v2 ${r.id}: ${r.question}`);
  console.log(`증거 요청: v1 [${a.evidenceRequests.map((r) => r.id).join(", ")}] → v2 [${b.evidenceRequests.map((r) => r.id).join(", ")}]`);
  console.log(`정산 변화:`);
  for (const l of b.settlement) {
    const p = a.settlement.find((x) => x.key === l.key);
    if (!p || p.amount !== l.amount || p.status !== l.status || p.formula !== l.formula)
      console.log(`  ${l.key}: ${p ? `${won(p.amount)}/${p.status}` : "(없음)"} → ${won(l.amount)}/${l.status}  ${l.formula}`);
  }
  console.log(`changedFromPrev (${b.changedFromPrev.length}개): ${b.changedFromPrev.join(", ")}`);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
