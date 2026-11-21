// 담당: 이다은 | PRD ③ 마스킹 단위 테스트 (전부 가상 데이터)
import { describe, expect, it } from "vitest";
import { buildNameMap, maskText } from "./mask";

describe("전화번호", () => {
  it("하이픈 형식", () => {
    expect(maskText("연락처는 010-0000-1234 입니다")).toEqual({
      text: "연락처는 [전화번호] 입니다",
      count: 1,
    });
  });

  it("공백·점·붙여쓰기 형식과 011/016 번호", () => {
    const r = maskText("010 0000 1234 / 011.000.5678 / 01600001111");
    expect(r.text).toBe("[전화번호] / [전화번호] / [전화번호]");
    expect(r.count).toBe(3);
  });

  it("더 긴 숫자열의 일부는 가리지 않는다", () => {
    expect(maskText("주문번호 9901000001234567").count).toBe(0);
  });
});

describe("주민등록번호", () => {
  it("하이픈 형식", () => {
    expect(maskText("주민번호 900101-1234567")).toEqual({ text: "주민번호 [주민번호]", count: 1 });
  });

  it("붙여쓰기·공백 형식 (2000년대생 3·4)", () => {
    const r = maskText("0501014000000 그리고 050101 3000000");
    expect(r.text).toBe("[주민번호] 그리고 [주민번호]");
    expect(r.count).toBe(2);
  });

  it("뒷자리 첫 숫자가 5 이상이면 주민번호로 보지 않는다", () => {
    expect(maskText("900101-5234567").text).not.toContain("[주민번호]");
  });
});

describe("계좌번호", () => {
  it("3단 하이픈 계좌", () => {
    expect(maskText("국민 123-456-789012 로 보내주세요")).toEqual({
      text: "국민 [계좌번호] 로 보내주세요",
      count: 1,
    });
  });

  it("4단 하이픈 계좌", () => {
    expect(maskText("계좌: 1002-000-123456-01")).toEqual({ text: "계좌: [계좌번호]", count: 1 });
  });

  it("YYYY-MM-DD 날짜는 계좌번호로 가리지 않는다", () => {
    expect(maskText("납기는 2026-06-10 이에요")).toEqual({ text: "납기는 2026-06-10 이에요", count: 0 });
  });
});

describe("이메일", () => {
  it("일반 이메일", () => {
    expect(maskText("메일은 haeun.design@example.com 으로")).toEqual({
      text: "메일은 [이메일] 으로",
      count: 1,
    });
  });

  it("+태그·서브도메인 이메일 여러 개", () => {
    const r = maskText("a+b@mail.example.co.kr, test_1@test.kr");
    expect(r.text).toBe("[이메일], [이메일]");
    expect(r.count).toBe(2);
  });
});

describe("이름 치환", () => {
  it("me는 '나', 상대가 한 명이면 '상대방'", () => {
    const r = maskText("하은님 안녕하세요, 온새미로카페입니다", {
      me: "하은",
      others: ["온새미로카페"],
    });
    expect(r.text).toBe("나님 안녕하세요, 상대방입니다");
    expect(r.count).toBe(2);
  });

  it("상대가 여러 명이면 상대방1, 상대방2", () => {
    const r = maskText("민준 씨랑 서연 씨가 하은 씨에게", { me: "하은", others: ["민준", "서연"] });
    expect(r.text).toBe("상대방1 씨랑 상대방2 씨가 나 씨에게");
    expect(r.count).toBe(3);
  });

  it("긴 이름을 먼저 치환한다 (김하은 vs 하은)", () => {
    const r = maskText("김하은 대표와 하은", { me: "하은", others: ["김하은"] });
    expect(r.text).toBe("상대방 대표와 나");
  });

  it("정규식 특수문자가 들어간 이름도 글자 그대로 치환", () => {
    const r = maskText("(주)카페+ 입니다", { others: ["(주)카페+"] });
    expect(r.text).toBe("상대방 입니다");
  });

  it("buildNameMap: 빈 이름·중복·me와 같은 이름은 제외", () => {
    const map = buildNameMap({ me: "하은", others: ["하은", "", "민준", "민준"] });
    expect([...map]).toEqual([
      ["하은", "나"],
      ["민준", "상대방"],
    ]);
  });
});

describe("종합", () => {
  it("여러 패턴과 이름이 섞인 메시지", () => {
    const r = maskText("하은 010-0000-1234, 계좌 110-000-000000, mail@x.com", { me: "하은" });
    expect(r.text).toBe("나 [전화번호], 계좌 [계좌번호], [이메일]");
    expect(r.count).toBe(4);
  });

  it("개인정보가 없으면 그대로, count 0", () => {
    expect(maskText("시안 2종 80만 원이에요")).toEqual({ text: "시안 2종 80만 원이에요", count: 0 });
  });
});
