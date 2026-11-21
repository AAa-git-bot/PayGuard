// 담당: 이다은 | PRD 7-1 카톡 txt 파서 (모바일·PC 형식 모두)
// 순수 함수라 브라우저(참여자 선택 화면)와 서버 양쪽에서 쓸 수 있다. 테스트: lib/parse-kakao.test.ts
//
// 지원 형식
//  - 모바일  날짜 헤더: "--------------- 2026년 6월 10일 수요일 ---------------"
//           메시지:    "[하은] [오후 3:24] 내용"
//  - PC/맥   날짜 헤더: "2026년 6월 10일 수요일"
//           메시지:    "2026년 6월 10일 오후 3:24, 하은 : 내용" / "2026. 6. 10. 오후 3:24, 하은 : 내용"
// 형식에 안 맞는 줄은 직전 메시지에 줄바꿈으로 붙인다. 첫 메시지 전의 줄(대화방 제목·저장한 날짜)은 버린다.
// 시스템 메시지(사진·이모티콘·입장/퇴장 등)는 sender "unknown" → 분석에서 제외.

export interface KakaoMessage {
  sender: string; // 카톡 표시 이름 그대로, 시스템 메시지는 "unknown"
  sentAt: string | null; // ISO, 한국시간 "+09:00". 날짜를 알 수 없으면 null
  text: string;
}

export interface ParsedKakao {
  participants: string[]; // 대화에 등장한 이름(중복 없이, 처음 나온 순서)
  messages: KakaoMessage[];
}

export const UNKNOWN_SENDER = "unknown";

const WEEKDAY = "[월화수목금토일]요일";
const AMPM_TIME = "(오전|오후)\\s*(\\d{1,2}):(\\d{2})";

const RE_MOBILE_DATE = new RegExp(`^-{3,}\\s*(\\d{4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일(?:\\s*${WEEKDAY})?\\s*-{3,}$`);
const RE_PC_DATE = new RegExp(`^(\\d{4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일\\s*${WEEKDAY}$`);
const RE_MOBILE_MSG = new RegExp(`^\\[([^\\]]+)\\]\\s*\\[${AMPM_TIME}\\]\\s?(.*)$`);
// PC 메시지 앞부분(날짜+시각). 두 날짜 표기 모두 지원.
const RE_PC_PREFIX = new RegExp(
  `^(?:(\\d{4})년\\s*(\\d{1,2})월\\s*(\\d{1,2})일|(\\d{4})\\.\\s*(\\d{1,2})\\.\\s*(\\d{1,2})\\.?)\\s*${AMPM_TIME},\\s*(.*)$`,
);

// 내용 전체가 이것이면 시스템(미디어) 메시지
const RE_SYSTEM_CONTENT = /^(사진|사진 \d+장|동영상|이모티콘|음성메시지|삭제된 메시지입니다\.?|보이스톡 해요\.?|페이스톡 해요\.?)$/;
// 입장·퇴장·초대 안내 (이름 없이 한 줄로 나오는 경우 포함)
const RE_SYSTEM_NOTICE = /님이 (들어왔습니다|나갔습니다|퇴장했습니다)|님을 초대했습니다|님이 .+님을 초대했습니다|채팅방 관리자가/;

export function parseKakao(raw: string): ParsedKakao {
  const lines = (raw ?? "").replace(/^﻿/, "").split(/\r\n|\r|\n/);
  const messages: KakaoMessage[] = [];
  const participants: string[] = [];
  let currentDate: { y: number; m: number; d: number } | null = null;

  const addParticipant = (name: string) => {
    if (name && name !== UNKNOWN_SENDER && !participants.includes(name)) participants.push(name);
  };
  const push = (name: string, sentAt: string | null, text: string) => {
    addParticipant(name);
    const system = RE_SYSTEM_CONTENT.test(text.trim()) || RE_SYSTEM_NOTICE.test(text);
    messages.push({ sender: system ? UNKNOWN_SENDER : name, sentAt, text });
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();

    // 1) 날짜 헤더
    const dh = RE_MOBILE_DATE.exec(line) ?? RE_PC_DATE.exec(line);
    if (dh) {
      currentDate = { y: Number(dh[1]), m: Number(dh[2]), d: Number(dh[3]) };
      continue;
    }

    // 2) 모바일 메시지
    const mm = RE_MOBILE_MSG.exec(line);
    if (mm) {
      const [, name, ampm, h, min, text] = mm;
      const sentAt = currentDate ? toIso(currentDate.y, currentDate.m, currentDate.d, ampm, +h, +min) : null;
      push(name.trim(), sentAt, text);
      continue;
    }

    // 3) PC 메시지 (또는 PC 형식 시스템 안내: "…, 하은님이 들어왔습니다.")
    const pm = RE_PC_PREFIX.exec(line);
    if (pm) {
      const y = Number(pm[1] ?? pm[4]);
      const m = Number(pm[2] ?? pm[5]);
      const d = Number(pm[3] ?? pm[6]);
      currentDate = { y, m, d };
      const sentAt = toIso(y, m, d, pm[7], +pm[8], +pm[9]);
      const rest = pm[10];
      const sep = rest.indexOf(" : ");
      if (sep > 0) {
        push(rest.slice(0, sep).trim(), sentAt, rest.slice(sep + 3));
      } else {
        messages.push({ sender: UNKNOWN_SENDER, sentAt, text: rest });
      }
      continue;
    }

    // 4) 시간 없이 한 줄로 나오는 입장/퇴장 안내 (모바일)
    if (RE_SYSTEM_NOTICE.test(line) && !line.includes(" : ")) {
      messages.push({ sender: UNKNOWN_SENDER, sentAt: null, text: line });
      continue;
    }

    // 5) 여러 줄 메시지의 이어지는 줄 (첫 메시지 전 줄은 헤더라 버림)
    const last = messages[messages.length - 1];
    if (last) last.text += "\n" + rawLine.replace(/\s+$/, "");
  }

  for (const msg of messages) msg.text = msg.text.replace(/\s+$/, "");
  return { participants, messages };
}

/** 오전/오후 12시간 → 24시간, 한국시간(+09:00) ISO 문자열 */
export function toIso(y: number, m: number, d: number, ampm: string, hour12: number, minute: number): string {
  let h = hour12 % 12; // 오전 12시 = 0시
  if (ampm === "오후") h += 12; // 오후 12시 = 12시
  const p = (n: number) => String(n).padStart(2, "0");
  return `${y}-${p(m)}-${p(d)}T${p(h)}:${p(minute)}:00+09:00`;
}
