// 담당: 이다은 | PRD 7-1 카톡 파서 테스트 (전부 가상 데이터)
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { parseKakao, toIso } from "./parse-kakao";

describe("toIso (오전/오후 → 24시간, +09:00)", () => {
  it.each([
    ["오전", 9, 5, "09:05"],
    ["오전", 12, 30, "00:30"],
    ["오후", 12, 0, "12:00"],
    ["오후", 3, 24, "15:24"],
    ["오후", 11, 59, "23:59"],
  ])("%s %i:%i → %s", (ampm, h, m, hhmm) => {
    expect(toIso(2026, 6, 1, ampm, h, m)).toBe(`2026-06-01T${hhmm}:00+09:00`);
  });
});

describe("모바일 형식", () => {
  const raw = [
    "온새미로카페 님과 카카오톡 대화",
    "저장한 날짜 : 2026-07-06 10:12:33",
    "",
    "--------------- 2026년 6월 10일 수요일 ---------------",
    "[하은] [오후 3:24] 시안 보내드려요",
    "[온새미로카페] [오후 9:12] 좋네요!",
    "2번으로 갈게요",
    "--------------- 2026년 6월 11일 목요일 ---------------",
    "[온새미로카페] [오전 10:20] 글씨체만 바꿔주세요",
  ].join("\r\n");
  const r = parseKakao(raw);

  it("메시지·보낸 사람·시각을 읽는다 (헤더 줄은 버림)", () => {
    expect(r.messages).toEqual([
      { sender: "하은", sentAt: "2026-06-10T15:24:00+09:00", text: "시안 보내드려요" },
      { sender: "온새미로카페", sentAt: "2026-06-10T21:12:00+09:00", text: "좋네요!\n2번으로 갈게요" },
      { sender: "온새미로카페", sentAt: "2026-06-11T10:20:00+09:00", text: "글씨체만 바꿔주세요" },
    ]);
  });

  it("participants는 중복 없이 처음 나온 순서", () => {
    expect(r.participants).toEqual(["하은", "온새미로카페"]);
  });

  it("사진·이모티콘·입장 안내는 sender unknown", () => {
    const s = parseKakao(
      [
        "--------------- 2026년 6월 2일 화요일 ---------------",
        "[하은] [오후 2:31] 사진",
        "[하은] [오후 2:31] 사진 3장",
        "[민준] [오후 2:32] 이모티콘",
        "민준님이 들어왔습니다.",
        "[하은] [오후 2:33] 파일: logo_final.ai",
      ].join("\n"),
    );
    expect(s.messages.map((m) => m.sender)).toEqual(["unknown", "unknown", "unknown", "unknown", "하은"]);
    expect(s.messages[3].text).toBe("민준님이 들어왔습니다.");
    // 사진만 보낸 사람도 참여자 목록에는 들어간다 ("나는 누구인가요?" 선택용)
    expect(s.participants).toEqual(["하은", "민준"]);
  });

  it("날짜 헤더 전 메시지는 sentAt null", () => {
    expect(parseKakao("[하은] [오전 9:00] 안녕하세요").messages[0].sentAt).toBeNull();
  });
});

describe("PC 형식", () => {
  it("'2026년 6월 10일 오후 3:24, 이름 : 내용' 형식", () => {
    const r = parseKakao(
      [
        "하은 님과 카카오톡 대화",
        "저장한 날짜 : 2026년 7월 6일 오전 10:12",
        "",
        "2026년 6월 10일 수요일",
        "2026년 6월 10일 오후 3:24, 하은 : 시안 보내드려요",
        "2026년 6월 10일 오후 9:12, 온새미로카페 : 좋네요! : 2번으로",
        "갈게요",
      ].join("\n"),
    );
    expect(r.messages).toEqual([
      { sender: "하은", sentAt: "2026-06-10T15:24:00+09:00", text: "시안 보내드려요" },
      { sender: "온새미로카페", sentAt: "2026-06-10T21:12:00+09:00", text: "좋네요! : 2번으로\n갈게요" },
    ]);
    expect(r.participants).toEqual(["하은", "온새미로카페"]);
  });

  it("'2026. 6. 10. 오후 3:24, 이름 : 내용' 형식", () => {
    const r = parseKakao(
      ["2026. 6. 10. 오전 12:05, 하은 : 늦게 죄송해요", "2026. 6. 11. 오후 12:00, 민준 : 괜찮아요"].join("\n"),
    );
    expect(r.messages).toEqual([
      { sender: "하은", sentAt: "2026-06-10T00:05:00+09:00", text: "늦게 죄송해요" },
      { sender: "민준", sentAt: "2026-06-11T12:00:00+09:00", text: "괜찮아요" },
    ]);
  });

  it("PC 형식 시스템 메시지(사진, 입장 안내)는 sender unknown", () => {
    const r = parseKakao(
      ["2026년 6월 10일 오후 3:24, 하은 : 사진", "2026년 6월 10일 오후 3:25, 민준님이 들어왔습니다."].join("\n"),
    );
    expect(r.messages).toEqual([
      { sender: "unknown", sentAt: "2026-06-10T15:24:00+09:00", text: "사진" },
      { sender: "unknown", sentAt: "2026-06-10T15:25:00+09:00", text: "민준님이 들어왔습니다." },
    ]);
    expect(r.participants).toEqual(["하은"]);
  });
});

describe("예외 입력", () => {
  it("빈 문자열·형식 없는 텍스트는 빈 결과", () => {
    expect(parseKakao("")).toEqual({ participants: [], messages: [] });
    expect(parseKakao("그냥 메모입니다\n두 번째 줄")).toEqual({ participants: [], messages: [] });
  });
});

describe("샘플 데이터 (data/sample)", () => {
  const read = (f: string) => readFileSync(join(__dirname, "..", "data", "sample", f), "utf8");

  it("kakao_haeun.txt 파싱", () => {
    const r = parseKakao(read("kakao_haeun.txt"));
    expect(r.participants).toEqual(["하은", "온새미로카페"]);
    expect(r.messages[0]).toEqual({
      sender: "하은",
      sentAt: "2026-06-02T14:10:00+09:00",
      text: "안녕하세요 사장님! 인스타 DM 주셔서 연락드려요. 디자이너 하은입니다 :)",
    });
    expect(r.messages).toContainEqual({
      sender: "온새미로카페",
      sentAt: "2026-06-03T11:05:00+09:00",
      text: "선금 40만 원 보냈어요",
    });
    const last = r.messages[r.messages.length - 1];
    expect(last.sentAt).toBe("2026-07-05T15:01:00+09:00");
    expect(r.messages.every((m) => m.sentAt !== null)).toBe(true);
    expect(r.messages.filter((m) => m.text === "사진").every((m) => m.sender === "unknown")).toBe(true);
  });

  it("kakao_haeun_extra.txt 파싱", () => {
    const r = parseKakao(read("kakao_haeun_extra.txt"));
    expect(r.messages).toHaveLength(4);
    expect(r.messages[3]).toEqual({
      sender: "온새미로카페",
      sentAt: "2026-06-02T15:20:00+09:00",
      text: "네 알겠습니다",
    });
  });
});
