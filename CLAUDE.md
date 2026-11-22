# PayGuard PRD (AI 코딩 도구용 설계 문서)

> 이 문서는 PayGuard의 단일 기준 문서다. AI 코딩 도구(Claude Code, Cursor 등)는 작업 전에 항상 이 파일을 읽고, 여기 적힌 구조·이름·스키마를 그대로 따른다. 설계를 바꿔야 하면 코드보다 이 문서를 먼저 고친다.

---

## 0. 한 줄 정의

PayGuard는 청년 프리랜서와 의뢰인의 채팅방에 AI가 참여자로 들어가 계약 조건을 기록·확인하고(예방 모드), 분쟁이 생기면 카톡·이체 내역 등 흩어진 증거로 타임라인·정산표·쟁점 카드를 만들어 주는(대응 모드) AI 에이전트 웹 서비스다.

- 대회: 2026 대한민국 청년 CAREER FAIR AI 해커톤
- 제출 마감: **2026-11-23(월) 17:00 KST** (마감 후 기능·프롬프트·데이터 변경 불가)
- 기능 동결: **2026-11-22(일) 22:00**

---

## 1. 반드시 지킬 규칙 (위반 시 실격 위험)

1. **실제 개인정보를 LLM API에 보내지 않는다.** 모든 텍스트는 `lib/mask.ts`를 거친 뒤에만 LLM에 전달한다. 데모·테스트에는 가상 데이터만 쓴다.
2. **API 키는 코드에 넣지 않는다.** 환경변수만 사용. `.env.local`은 커밋 금지(.gitignore 확인).
3. **로그인 없이 접근 가능해야 한다.** 심사위원이 URL을 열면 바로 샘플 사건을 체험할 수 있어야 한다. 인증 기능은 만들지 않는다.
4. **AI 생성 결과는 화면에 표시한다.** AI가 만든 모든 결과 블록에 `AI가 생성한 결과예요` 배지를 붙인다.
5. **AI는 판결하지 않는다.** 과실 비율, 승소 확률, "누가 잘못했다"는 단정을 생성하지 않는다. 근거 없는 내용은 `확인 불가`로 표시한다.
6. **금액 계산은 LLM이 아니라 코드가 한다.** LLM은 금액을 추출만 하고, 합계·차액은 `lib/settlement.ts`가 계산한다.
7. **외부로 나가는 행동(전송·제출)은 하지 않는다.** 문서는 "초안"으로만 생성하고 사용자가 직접 다운로드한다.

---

## 2. 기술 스택

| 영역 | 선택 | 비고 |
| --- | --- | --- |
| 프레임워크 | Next.js 16 (App Router, TypeScript) | 프론트와 API를 한 저장소에. 동적 라우트의 `params`는 Promise라 `await params`로 꺼낸다 |
| 스타일 | Tailwind CSS + shadcn/ui | |
| DB·실시간 | Supabase (PostgreSQL + Realtime) | 예방 모드 채팅에 Realtime 사용 |
| LLM 호출 | Vercel AI SDK v7 (`ai` + `@ai-sdk/anthropic`) `generateText` + `output: Output.object({ schema })` + `zod` v4 | 구조화 출력(JSON) 강제, 이미지 입력 지원. `generateObject`는 v7에서 폐기 예정이라 쓰지 않는다. 직접 호출하지 말고 `lib/agent/llm.ts`의 `callStructured()`를 쓴다 |
| LLM 모델 | `claude-haiku-5-5` (환경변수 `LLM_MODEL`) | 이미지 읽기 지원. 품질이 부족하면 analyzeIssues 단계만 `claude-sonnet-5-5`로 교체 |
| PDF | 인쇄 전용 페이지 + `window.print()` (인쇄 CSS) | 별도 PDF 라이브러리 없이 |
| 배포 | Vercel | 환경변수는 Vercel 대시보드에 |

### 환경변수 (`.env.local`, Vercel)

```
ANTHROPIC_API_KEY=      # 서버 전용 (@ai-sdk/anthropic이 이 이름을 자동으로 읽음)
LLM_MODEL=claude-haiku-5-5
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_SERVICE_ROLE_KEY=   # 서버 전용, 클라이언트 코드에서 import 금지
```

LLM 공급사 사용량 한도를 2026-12-07(본선일)까지 버티도록 설정한다.

---

## 3. 폴더 구조와 담당자

담당자 폴더 밖 파일을 고칠 때는 해당 담당자에게 먼저 알린다. 공통 타입(`lib/types.ts`)은 민수빈이 관리한다.

```
/PRD.md                         ← 이 문서 (전원)
/app
  /page.tsx                     ← 첫 화면 (최서은)
  /cases/new/page.tsx           ← 자료 업로드 (최서은)
  /cases/[id]/page.tsx          ← 분석 결과 탭 화면 (최서은)
  /cases/[id]/report/page.tsx   ← 인쇄용 사건 정리 자료 (최서은)
  /rooms/new/page.tsx           ← 예방 모드 방 만들기 (최서은)
  /rooms/[id]/page.tsx          ← 예방 모드 채팅방 (최서은)
  /api/cases/route.ts           ← POST 사건 생성 (이다은)
  /api/cases/[id]/route.ts      ← GET 사건 전체 조회 (이다은)
  /api/cases/[id]/sources/route.ts   ← POST 자료 추가 (이다은)
  /api/cases/[id]/analyze/route.ts   ← POST 분석 실행 (이다은 → lib/agent 호출)
  /api/cases/[id]/documents/route.ts ← POST 내용증명·계약서 초안 (이다은 → lib/agent)
  /api/sample/route.ts          ← POST 샘플 사건 생성 (이다은)
  /api/rooms/route.ts           ← POST 방 생성 (이다은)
  /api/rooms/[id]/messages/route.ts  ← POST 메시지 + 에이전트 응답 (이다은 → lib/agent)
  /api/rooms/[id]/terms/route.ts     ← POST 조건 카드 확인 (이다은)
  /api/rooms/[id]/to-case/route.ts   ← POST 채팅방 → 분쟁 분석으로 전환 (이다은)
/components                     ← UI 컴포넌트 (최서은)
/lib
  /types.ts                     ← 공통 타입·zod 스키마 (민수빈)
  /mask.ts                      ← 개인정보 마스킹 (이다은)
  /parse-kakao.ts               ← 카톡 txt 파서 (이다은)
  /db.ts                        ← Supabase 클라이언트·쿼리 함수 (이다은)
  /settlement.ts                ← 정산 계산 (민수빈)
  /diff.ts                      ← 분석 버전 간 바뀐 부분 계산 (민수빈)
  /agent
    /llm.ts                     ← LLM 호출 래퍼 (민수빈)
    /prompts.ts                 ← 모든 시스템 프롬프트 (민수빈)
    /pipeline.ts                ← 대응 모드 분석 파이프라인 (민수빈)
    /prevent.ts                 ← 예방 모드 에이전트 (민수빈)
    /documents.ts               ← 내용증명·계약서 초안 생성 (민수빈)
/data/sample                    ← 가상 데모 데이터 (최서은)
  /kakao_haeun.txt
  /kakao_haeun_extra.txt        ← 재분석 시연용 추가 증거
  /transfer_haeun.png
  /sample_analysis.json         ← 미리 계산한 샘플 분석 결과
/supabase/schema.sql            ← DB 스키마 (이다은)
/scripts
  /run-analysis.ts              ← DB 없이 분석 파이프라인 실행·검증 (민수빈, `npx tsx scripts/run-analysis.ts`)
```

---

## 4. 데이터 모델

### 4-1. 공통 타입 (`lib/types.ts`, zod로 정의)

```ts
export type Party = "me" | "counterparty" | "ai" | "unknown";
// me = 업로드한 사용자(보통 프리랜서), counterparty = 상대방(보통 의뢰인)

export type EventType =
  | "promise"          // 약속·합의 (금액, 범위, 납기 등)
  | "change_request"   // 조건 변경 요청
  | "change_accept"    // 변경 동의
  | "delivery"         // 납품·이행
  | "revision_request" // 수정 요청
  | "payment"          // 입금
  | "charge"           // 추가 비용 청구
  | "cancel_refund"    // 취소·환불 요청
  | "complaint"        // 불만 제기
  | "other";

export type Certainty =
  | "confirmed"   // 원문·이체 내역으로 확인됨
  | "claimed"     // 한쪽 주장만 있음
  | "unverified"; // 확인 불가

export interface SourceRef {
  sourceId: string;
  seqFrom: number;   // messages.seq 시작 (이미지 자료에서 온 출처는 0 → 화면에 "이미지"로 표시)
  seqTo: number;     // messages.seq 끝 (이미지는 0)
  quote: string;     // 원문 일부(마스킹된 텍스트, 80자 이내)
}

export interface CaseEvent {
  id: string;
  who: Party;
  type: EventType;
  what: string;             // 한 문장 요약
  sentAt: string | null;    // 메시지를 보낸 시각 (ISO)
  eventDate: string | null; // 메시지가 말하는 사건 날짜 (ISO date). "어제 입금" → 전날
  amount: number | null;    // 원 단위 정수
  agreedByOther: "yes" | "no" | "unknown";
  certainty: Certainty;
  sources: SourceRef[];     // 최소 1개 필수
  // 정산 계산용 보조 정보 (선택, 화면에 표시하지 않음). 재분석 때 이전 사건을 다시 쓰려고 함께 저장한다.
  amountKind?: "total" | "deposit" | "balance" | "per_revision" | "expense" | "other" | null;
               // 금액의 성격: 전체 계약 금액 / 선금 / 잔금 / 추가 수정 1회 단가 / 지출 / 기타
  revisionsIncluded?: number | null; // 이 사건이 "기본 포함 수정 횟수"를 정한 약속이면 그 횟수
}

export interface SettlementLine {
  key: "base" | "paid" | "unpaid" | "disputed" | "extra_expense" | "unknown";
  label: string;            // 화면 표시용 한국어
  amount: number | null;    // null = 확인 불가
  formula: string;          // 예: "800,000 - 400,000"
  eventIds: string[];       // 근거 이벤트
  status: "confirmed" | "pending" | "unverifiable";
  note: string;
}

export interface Issue {
  id: string;
  title: string;            // 예: "수정 3~4회차는 추가 작업인가?"
  myClaim: string;          // 내 주장 (자료에 없으면 "자료 없음")
  otherClaim: string;       // 상대방 주장
  facts: string[];          // 확인된 사실 (각 문장 끝에 출처 seq 표시)
  supportsMe: string[];     // 내 주장을 뒷받침하는 근거
  supportsOther: string[];  // 상대 주장을 뒷받침하는 근거
  toCheck: string[];        // 추가 확인 필요 사항
  eventIds: string[];
}

export interface EvidenceRequest {
  id: string;
  question: string;         // 예: "수정 횟수를 정한 대화가 있나요?"
  why: string;              // 이 자료가 왜 필요한지
  blocks: ("settlement" | "issue")[]; // 무엇의 결론을 보류시키는지
  relatedIssueId: string | null;
}

export interface Analysis {
  version: number;
  events: CaseEvent[];
  settlement: SettlementLine[];
  issues: Issue[];
  evidenceRequests: EvidenceRequest[];
  summary: string;          // 3문장 이내 사건 요약
  oneSided: boolean;        // 한쪽 제출 자료만 있으면 true
  changedFromPrev: string[]; // 이전 버전 대비 바뀐 항목 id (diff.ts가 채움)
}

export interface Terms {
  scope: string | null;
  revisionsIncluded: number | null;
  deadline: string | null;  // ISO date
  price: number | null;
  paymentTerms: string | null; // 예: "선금 50%, 납품 후 잔금"
  confirmedByFreelancer: boolean;
  confirmedByClient: boolean;
  version: number;
}
```

### 4-2. Supabase 스키마 (`supabase/schema.sql`)

```sql
create table cases (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  my_name_alias text default '나',
  is_sample boolean default false,
  room_id uuid,
  created_at timestamptz default now()
);

create table sources (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  kind text check (kind in ('kakao_txt','image','text','room_chat')),
  filename text,
  masked_text text,          -- 마스킹 후 텍스트만 저장 (원문 저장 금지)
  created_at timestamptz default now()
);

create table messages (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  source_id uuid references sources(id) on delete cascade,
  seq int not null,          -- 사건 내 전체 순번 (출처 표시용)
  sender text,               -- 'me' | 'counterparty' | 'unknown'
  sent_at timestamptz,
  text text not null         -- 마스킹된 텍스트
);

create table analyses (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  version int not null,
  data jsonb not null,       -- Analysis 타입 전체
  created_at timestamptz default now()
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  case_id uuid references cases(id) on delete cascade,
  kind text check (kind in ('notice_draft','contract_draft')),
  content text not null,     -- 마크다운
  created_at timestamptz default now()
);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  created_at timestamptz default now()
);

create table room_messages (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  sender text check (sender in ('freelancer','client','ai')),
  kind text default 'text' check (kind in ('text','terms_card','alert','question_suggestion')),
  text text not null,
  payload jsonb,             -- 카드형 메시지의 구조화 데이터
  created_at timestamptz default now()
);

create table room_terms (
  id uuid primary key default gen_random_uuid(),
  room_id uuid references rooms(id) on delete cascade,
  version int not null,
  data jsonb not null,       -- Terms 타입
  created_at timestamptz default now()
);

-- Realtime: room_messages, room_terms 테이블에 Realtime 활성화
-- 데모용이므로 RLS는 anon 읽기/쓰기 허용 (실서비스 시 강화 필요, 소개서에 한계로 명시)
```

---

## 5. 기능 명세 (번호는 기획서와 동일)

### P0 — 2026-11-21(토)까지, 완벽하게 작동해야 함

**① 샘플 사건 바로 체험**
- 첫 화면에 큰 버튼 `샘플 사건으로 체험하기`.
- 클릭 → `POST /api/sample` → `data/sample/` 파일로 사건 생성 + `sample_analysis.json`을 version 1로 저장 → `/cases/[id]`로 이동.
- 미리 계산한 결과를 쓰므로 LLM 장애·지연과 무관하게 즉시 표시된다.
- 결과 화면의 `다시 분석하기` 버튼은 실제로 LLM 파이프라인을 실행한다.
- 완료 기준: 시크릿 창에서 3초 안에 결과 화면이 뜬다.

**② 자료 업로드**
- `/cases/new`: 사건 제목, 카톡 txt 파일(여러 개), 이미지(이체 내역·영수증), 텍스트 붙여넣기.
- 카톡 업로드 후 대화 참여자 이름 목록을 보여주고 `이 중 나는 누구인가요?`를 선택받는다 → 나머지는 counterparty.
- 업로드 시 경고 문구: `실제 개인정보는 자동으로 가려지지만, 체험 시에는 샘플 데이터를 권장해요.`
- 완료 기준: 카톡 PC·모바일 내보내기 형식 모두 파싱된다(아래 7-1).

**③ 개인정보 마스킹** (`lib/mask.ts`)
- LLM 호출 전, DB 저장 전에 반드시 실행.
- 치환 규칙:
  - 휴대폰: `01[016789][-. ]?\d{3,4}[-. ]?\d{4}` → `[전화번호]`
  - 주민등록번호: `\d{6}[- ]?[1-4]\d{6}` → `[주민번호]`
  - 계좌번호: `\d{2,6}-\d{2,6}-\d{2,6}(-\d{1,6})?` → `[계좌번호]`
  - 이메일: 일반 이메일 정규식 → `[이메일]`
  - 참여자 실명: 업로드 시 선택한 이름 → `나`, 그 외 참여자 → `상대방`(여러 명이면 `상대방1`, `상대방2`)
- 이미지는 서버에서 LLM에 보내기 전 사용자에게 `이 이미지에 실제 계좌·이름이 있으면 가린 뒤 올려주세요` 안내.
- 결과 화면 상단에 `개인정보 n건을 가렸어요` 표시.
- 완료 기준: 단위 테스트 10개(각 패턴 2개 이상) 통과.

**④ 사건 타임라인**
- 이벤트를 `eventDate`(없으면 `sentAt`) 순으로 세로 타임라인 표시.
- 각 항목: 날짜, 누가(나/상대방), 유형 배지, 한 문장, 금액, 확실성 배지(확인됨/주장/확인 불가), 출처 칩 `카톡 #42~44`.
- 출처 칩 클릭 → 모달에 원문 메시지(해당 seq 앞뒤 2개 포함) 표시, 해당 줄 하이라이트.
- `sentAt`과 `eventDate`가 다르면 둘 다 표시: `6/12 보낸 메시지 · 사건일 6/11`.

**⑤ 정산표** (`lib/settlement.ts`, 7-3 규칙)
- 표: 항목 / 금액 / 계산식 / 상태 / 근거.
- 상태 `pending`(증거 부족)이면 금액 칸에 `결론 보류` + 연결된 증거 요청으로 이동하는 링크.

**⑥ 쟁점 카드**
- 쟁점마다 카드: 제목, 내 주장, 상대 주장, 확인된 사실, 각 주장의 근거, 추가 확인 필요.
- 카드 하단 고정 문구: `PayGuard는 책임 비율을 판단하지 않아요. 아래 근거를 상담에 활용하세요.`

**⑦ 증거 요청과 재분석**
- `증거 요청` 패널: 질문, 필요한 이유, 무엇의 결론이 보류됐는지.
- 각 요청 옆 `자료 추가` 버튼 → 파일·텍스트 추가 → `POST /api/cases/[id]/sources` → 자동으로 `POST /api/cases/[id]/analyze`.
- 새 버전이 나오면 `changedFromPrev` 항목을 노란 테두리 + `새로 바뀜` 배지로 강조. 상단에 `분석 v1 → v2` 표시.
- 완료 기준: 샘플 사건에서 `kakao_haeun_extra.txt`를 추가하면 "수정 3~4회차" 쟁점과 정산표가 갱신된다.

**⑧ AI 생성 표시·확신도**
- 모든 AI 결과 섹션 우측 상단 배지 `AI가 생성한 결과예요`.
- `oneSided === true`면 상단 경고 배너: `한쪽이 제출한 자료만으로 분석했어요. 통화·삭제된 메시지·오프라인 합의는 반영되지 않았어요.`
- `unverified` 항목은 회색 처리 + `확인 불가`.

### P1 — 2026-11-22(일) 오후까지

**⑨ 예방 모드 실시간 채팅방**
- `/rooms/new`: 방 제목 입력 → 생성 → 링크 2개 표시 (`?as=freelancer`, `?as=client`). 한 화면에서 두 링크를 새 창으로 열어 시연 가능해야 한다.
- 입장 시 동의 모달: `이 채팅방에는 AI가 참여해 계약 조건을 정리해요. 동의하시나요?` (동의해야 입장).
- Supabase Realtime으로 `room_messages` 구독.
- 화면: 왼쪽 채팅, 오른쪽 조건 카드 패널.

**⑩ 조건 카드와 양측 확인**
- 사람 메시지가 올라올 때마다 `lib/agent/prevent.ts` 실행 → Terms 갱신안 생성.
- 조건이 바뀌면 AI가 `terms_card` 메시지를 채팅에 올림. 카드에 `확인` 버튼(각자 자기 역할 버튼만 활성).
- 양측 모두 확인하면 `room_terms`에 새 version 저장 + 카드에 `양측 확인 완료 ✓` 표시.

**⑪ 변경 감지·확인 질문**
- 확정된 Terms와 다른 요청 감지 시 AI가 `alert` 메시지: 예 `이 요청은 수정 3회차로, 합의한 2회를 넘어요. 추가 비용을 정할까요?`
- 모호한 표현(`대충`, `다음 주쯤`, `끝나면`, `적당히` 등) 감지 시 `question_suggestion` 메시지: `"다음 주쯤"은 며칠인가요? 날짜를 정해두면 좋아요.`
- AI는 조언만 하고, 대화를 막거나 대신 답하지 않는다.
- `분쟁 분석으로 보내기` 버튼 → `POST /api/rooms/[id]/to-case` → 채팅 기록 + Terms 이력을 source로 하는 사건 생성 → 분석 화면으로 이동 (Terms 이력은 certainty `confirmed` 근거로 사용).

**⑫ 사건 정리 자료 (인쇄/PDF)**
- `/cases/[id]/report`: 사건 요약, 타임라인 표, 정산표, 쟁점 카드, 증거 목록(출처별), 고지문.
- 상단 `PDF로 저장` 버튼 → `window.print()`. 인쇄 CSS로 A4에 맞춤.
- 고지문: `본 자료는 AI가 사용자 제출 자료를 정리한 초안이며 법률 자문이 아닙니다.`

**⑬ 내용증명 초안**
- 결과 화면 `문서` 탭 → `내용증명 초안 만들기` → `POST /api/cases/[id]/documents {kind:"notice_draft"}`.
- 내용: 당사자(나/상대방 표기), 계약 사실, 이행 사실, 미지급 금액(정산표 confirmed 값만), 지급 요청 기한(사용자 입력), 미이행 시 조치 예정(일반 문구).
- 화면·문서 모두 상단에 `초안 — 발송 전 사실관계를 직접 확인하세요` 워터마크.
- 정산표에 confirmed 미지급액이 없으면 생성하지 않고 `먼저 증거 요청을 해결해 주세요` 안내.

### P2 — 여유 있을 때 (일요일 22:00 전까지만)

**⑭ 조건 카드 → 용역계약서 초안**
- 예방 모드 패널 `계약서 초안 만들기` → 확정 Terms로 작업 범위, 수정 횟수, 납기, 대금·지급 시기, 중도 취소 시 정산, 추가 작업 단가 항목을 채운 마크다운 계약서 초안.
- 비어 있는 항목은 `[협의 필요]`로 남김.

**⑮ 다음 단계 안내**
- 결과 화면 하단 고정 콘텐츠(AI 생성 아님): 상황별 상담 창구와 절차 안내. 내용은 이다은이 공식 출처로 검수한 텍스트를 `data/next_steps.md`에 두고 그대로 렌더링.

---

## 6. 화면 흐름 (Happy Path)

**대응 모드 (심사위원 기준)**
1. `/` → `샘플 사건으로 체험하기`
2. `/cases/[id]` 결과 화면: 요약 → 탭 [타임라인 | 정산표 | 쟁점 | 증거 요청 | 문서]
3. 증거 요청 탭 → `자료 추가` → 샘플 추가 증거 버튼(`샘플 추가 증거 넣기`)으로 한 번에 추가
4. 재분석 → v2, 바뀐 부분 강조
5. `사건 정리 자료 보기` → 인쇄/PDF

**예방 모드**
1. `/` → `예방 모드 채팅방 만들기` → 링크 2개
2. 두 창에서 프리랜서·의뢰인으로 대화 → 조건 카드 생성 → 양측 확인
3. 의뢰인이 추가 수정 요청 → AI 경고
4. `분쟁 분석으로 보내기` → 대응 모드 결과 화면

첫 화면 문구: `계약서 없이 카톡으로 일하는 청년 프리랜서를 위해, AI가 조건을 기록하고 분쟁이 생기면 증거를 정리해 드려요.`

---

## 7. 처리 로직

### 7-1. 카톡 txt 파서 (`lib/parse-kakao.ts`)

두 형식을 모두 지원한다. 날짜 헤더가 나오면 현재 날짜를 갱신한다.

- 모바일 형식
  - 날짜 헤더: `--------------- 2026년 6월 10일 수요일 ---------------`
  - 메시지: `[하은] [오후 3:24] 메시지 내용`
- PC/맥 형식
  - 날짜 헤더: `2026년 6월 10일 수요일`
  - 메시지: `2026년 6월 10일 오후 3:24, 하은 : 메시지 내용` 또는 `2026. 6. 10. 오후 3:24, 하은 : 메시지 내용`
- 형식에 맞지 않는 줄은 직전 메시지에 줄바꿈으로 이어 붙인다(여러 줄 메시지).
- 시스템 메시지(`님이 들어왔습니다`, `사진`, `이모티콘`)는 sender `unknown`으로 두고 분석에서 제외.
- 출력: `{ participants: string[], messages: { sender: string, sentAt: string, text: string }[] }`
- seq는 사건 전체에서 1부터 이어지는 번호.

### 7-2. 대응 모드 파이프라인 (`lib/agent/pipeline.ts`)

```
runAnalysis(caseId):
  1. messages, sources 로드 (이미 마스킹됨)
  2. 이미지 source → extractFromImage() → 입금·영수증 CaseEvent[] (certainty: confirmed)
  3. 메시지를 150개 단위로 나눠 extractEvents() → CaseEvent[]
  4. 코드: 날짜 정렬, 같은 사건 중복 제거(같은 type + 같은 금액 + 날짜 1일 이내)
  5. detectConflicts(events) → 서로 모순되는 이벤트 쌍, 빠진 핵심 정보 목록
  6. 코드: computeSettlement(events) → SettlementLine[]
  7. analyzeIssues(events, settlement, conflicts) → Issue[]
  8. requestEvidence(events, settlement, issues, conflicts) → EvidenceRequest[]
     - 요청이 blocks에 "settlement"를 포함하면 해당 정산 줄 status = "pending"
  9. summary 생성(analyzeIssues 결과에 포함), oneSided 계산(sender가 한쪽만 업로드한 자료인지)
 10. diff.ts로 이전 버전과 비교 → changedFromPrev
 11. analyses에 version+1로 저장, 반환
```

- 각 LLM 호출은 `lib/agent/llm.ts`의 `callStructured()`(내부적으로 `generateText` + `Output.object`) + zod 스키마. 스키마 검증 실패 시 1회 재시도, 그래도 실패하면 해당 단계 결과를 빈 배열로 두고 화면에 `일부 분석에 실패했어요. 다시 분석하기를 눌러주세요.` 표시(앱이 멈추면 안 됨).
- 모든 CaseEvent는 sources가 1개 이상이어야 한다. 없으면 버린다(코드 검증).
- LLM이 반환한 seq가 실제 messages 범위 밖이면 버린다(환각 방지, 코드 검증).

구현 메모 (민수빈, 2026-11-21):
- 함수 구성
  - `analyzeMessages(messages, images, prevAnalysis)` → `{ analysis, failedSteps, debug }` — DB와 무관한 전체 파이프라인(2~10단계). 스크립트와 API가 함께 쓴다.
  - `runAnalysis(caseId)` → `Analysis` — `lib/db.ts`의 `getCase`·`getLatestAnalysis`·`downloadImage`로 읽고 `saveAnalysis`로 저장만 한다. analyze API가 이걸 부른다.
  - `runAnalysisDetailed(caseId)` → `{ analysis, failedSteps }` — `failedSteps`가 비어 있지 않으면 `일부 분석에 실패했어요...` 안내를 띄운다.
- 재분석: 이전 버전에 사건이 있는 자료(sourceId)는 그 사건을 그대로 다시 쓰고, **새로 추가된 자료만** 추출한다. 같은 대화를 매번 다시 뽑으면 LLM 분류가 흔들려 changedFromPrev가 의미를 잃기 때문이다.
- 이벤트 id는 `ev-{첫 근거 seq}-{type}`(이미지는 `ev-img-{sourceId}-{type}`). 버전이 바뀌어도 같은 사건은 같은 id라 diff 비교가 된다.
- 분석 제외는 sender가 아니라 내용으로 판단한다(사진·이모티콘·입장 알림 등). 붙여넣은 텍스트 자료는 sender `unknown`이지만 분석에 넣는다.
- 보낸 시각(sentAt)은 LLM 답이 아니라 원문 메시지에서 가져온다. quote는 80자로 자른다.
- 코드 검증 추가
  - 증거 요청: 기본 포함 수정 횟수와 추가 수정 단가가 모두 상대방 동의(agreedByOther=yes)로 확인되면, 그 합의 자료를 다시 묻는 요청은 버린다.
  - 정산 `unknown`(금액 충돌): 같은 type·같은 amountKind의 사건이 서로 다른 금액일 때만 인정한다(총액 80만 원과 선금 40만 원은 충돌이 아님).
  - 쟁점·증거 요청의 eventIds·relatedIssueId는 실제로 있는 id만 남긴다. 쟁점 최대 5개, 증거 요청 최대 4개.
  - 결과에 과실 비율·책임 단정 표현이 섞였는지 점검해 경고 로그를 남긴다(`findVerdictLanguage`).
- 증거 요청이 정산을 막으면 LLM이 지정한 정산 줄(`settlementKeys`, 지정이 없으면 unpaid)을 pending으로 바꾸고 note에 `결론 보류(증거 요청 id): 질문`을 붙인다.
- `lib/diff.ts`: 문장이 아니라 구조로 비교한다. 이벤트는 유형·누가·금액·사건일·동의·확실성·근거 seq, 쟁점은 연결 이벤트와 근거 문장의 seq 번호, 정산은 금액·계산식·상태·근거가 바뀌었을 때만 changedFromPrev에 넣는다. 새 증거 요청 id도 넣는다.

### 7-3. 정산 계산 규칙 (`lib/settlement.ts`, 순수 함수)

```
base       = 가장 최근의 promise 이벤트 중 amount가 있고 agreedByOther="yes"인 것의 금액
             (amountKind가 total이거나 비어 있는 promise만 후보. 선금·잔금·단가 약속은 제외)
             없으면 amount 있는 promise 중 최신 → status "unverifiable", note "상대방 동의 확인 안 됨"
paid       = payment 이벤트 중 certainty="confirmed"인 amount 합
             certainty="claimed"인 입금은 note에 "주장만 있음: n원"으로 별도 표기, 합산하지 않음
unpaid     = base - paid  (base 또는 paid가 null이면 null, status "unverifiable")
             delivery 이벤트가 없으면 status "pending", note "납품 완료 여부 확인 필요"
disputed   = charge 이벤트 중 agreedByOther!="yes"인 amount 합 (단가 미정이면 amount null)
             + 기본 포함 횟수를 넘은 수정 회차 × 추가 수정 단가 (예: "2회 × 50,000 = 100,000", 곱셈도 코드가 함)
             수정 회차 = 납품(delivery)과 납품 사이의 revision_request 묶음을 1회차로 센다
             기본 포함 횟수 = revisionsIncluded가 있는 최신 사건, 단가 = amountKind "per_revision"인 최신 사건 (동의된 것 우선)
             단가가 없으면 "n회 × 단가 미정", status는 항상 "unverifiable" (추가 작업 여부는 쟁점)
extra_expense = 영수증 이미지에서 온 지출 합 (배상 가능 여부는 판단하지 않음, note 고정:
             "지출 확인과 배상 가능 여부는 별개예요")
unknown    = 서로 모순되는 금액 이벤트 목록 (amount null, note에 충돌 내용)
```

- formula는 사람이 읽을 수 있는 계산식 문자열(`800,000 - 400,000 = 400,000`).
- 단위 테스트: 샘플 사건 기준 base 800000, paid 400000, unpaid 400000.
- 같은 날짜 안에서는 보낸 시각(sentAt) 순으로 정렬한다.
- 샘플 검증 결과(scripts/run-analysis.ts): kakao_haeun.txt만 → disputed "2회 × 단가 미정", kakao_haeun_extra.txt 추가 → disputed 100,000. 이체 이미지까지 넣으면 800,000 / 400,000 / 400,000.

### 7-4. 예방 모드 에이전트 (`lib/agent/prevent.ts`)

```
onRoomMessage(roomId, newMessage):
  1. 최근 메시지 40개 + 확정된 최신 Terms 로드
  2. preventAgent() 호출 → {
       termsUpdate: Partial<Terms> | null,   // 새로 드러난 조건
       changeAlert: string | null,           // 확정 Terms와 다른 요청
       vagueQuestion: string | null          // 모호한 표현에 대한 확인 질문 제안
     }
  3. termsUpdate가 있으면 terms_card 메시지 게시 (confirmed 플래그는 둘 다 false로 초기화)
  4. changeAlert → alert 메시지, vagueQuestion → question_suggestion 메시지
  5. 셋 다 null이면 아무것도 게시하지 않음 (AI가 매번 말하지 않게)
```

- 사람 메시지에만 반응한다(sender="ai" 메시지에는 반응하지 않음, 무한 루프 방지).
- 응답 지연을 막기 위해 메시지 저장 후 즉시 반환하고 에이전트는 비동기 실행해도 됨.

---

## 8. 프롬프트 초안 (`lib/agent/prompts.ts`)

아래는 시스템 프롬프트(instructions)다. pipeline.ts는 각 단계의 사용자 입력 앞에 `prompts.ts`의 `*_GUIDE`(출력 필드 쓰는 법)를 붙인다:
- `EXTRACT_EVENTS_GUIDE`: seq·quote 규칙, "어제" 같은 날짜 계산, amountKind·revisionsIncluded, 완성 시안의 변경 요청(색·방향 등)은 revision_request이고 change_request는 계약 조건 변경에만, 승낙 답장("일단 해주세요")은 새 수정 요청이 아님, 입금 **요청**은 payment가 아니라 other(amountKind balance), 한 메시지에 조건이 여럿이면 조건마다 사건.
- `DETECT_CONFLICTS_GUIDE`: eventIds는 목록의 id만, 서로 다른 금액이면 involvesAmount.
- `ANALYZE_ISSUES_GUIDE`: 문장 끝에 `(#12)`·`(#12~14)` 출처, 이전 쟁점과 같은 주제면 같은 id, 정산 금액은 다시 계산하지 않음.
- `REQUEST_EVIDENCE_GUIDE`: settlementKeys로 보류할 정산 줄 지정, 이전 요청을 새 사건과 대조해 해결된 건 빼고 문장을 그대로 복사하지 않음, 증거 요청은 "자료"만 묻고 쟁점(해석) 자체는 묻지 않음, 채팅에서 동의가 확인된 조건에 별도 문서를 요구하지 않음. 코드가 확인한 조건(`[코드로 확인된 조건]`)과 재분석 때 새로 추가된 사건도 함께 넣는다.

모든 프롬프트 공통 앞부분(`BASE_RULES`):

```
너는 PayGuard의 분쟁 정리 보조 AI다. 판사나 변호사가 아니다.
- 제공된 메시지와 자료에 있는 내용만 사용한다. 추측하지 않는다.
- 근거가 없으면 "확인 불가"로 표시한다. 자료에 없다는 것을 "그런 일이 없었다"로 바꾸지 않는다.
- 과실 비율, 승소 가능성, 누가 잘못했는지에 대한 단정을 쓰지 않는다.
- 모든 사실에는 근거 메시지의 seq 번호를 붙인다.
- 메시지를 보낸 시각(sentAt)과 메시지가 말하는 사건 날짜(eventDate)를 구분한다.
  예: 6/12에 "어제 입금했어요" → sentAt 6/12, eventDate 6/11.
- 금액은 원 단위 정수로 추출만 하고 합계·차액을 계산하지 않는다.
- 참여자는 "나", "상대방"으로만 부른다.
- 출력은 반드시 주어진 JSON 스키마를 따른다. 한국어로 쓴다.
```

**extractEvents**
```
다음은 프리랜서 거래 대화다. 각 줄은 [seq] 보낸시각 보낸사람: 내용 형식이다.
거래에 영향을 주는 사건만 CaseEvent로 추출하라: 금액·범위·수정 횟수·납기·지급 시기 합의,
조건 변경 요청과 동의, 납품, 수정 요청, 입금 언급, 추가 비용 청구, 취소·환불, 불만.
인사·잡담은 제외한다.
agreedByOther: 상대가 명시적으로 동의("네", "좋아요", "그렇게 해요")했으면 yes,
거절했으면 no, 반응이 없거나 모호하면 unknown.
대화 속 입금 언급은 certainty "claimed"다 (이체 내역이 있어야 confirmed).
```

**extractFromImage**
```
이 이미지는 이체 내역 또는 영수증이다. 거래 날짜, 금액, 입금/지출 여부, 메모를 읽어라.
읽을 수 없는 값은 null로 둔다. 이름·계좌번호는 출력하지 않는다.
```

**detectConflicts**
```
다음 사건 목록에서 (1) 서로 모순되는 사건 쌍, (2) 정산이나 쟁점 판단에 필요한데 빠진 정보를 찾아라.
예: 계약서의 납기와 채팅의 납기가 다름, 입금했다는 주장은 있으나 이체 내역이 없음,
수정 횟수 합의가 언급되지 않음.
```

**analyzeIssues**
```
사건 목록과 정산표를 보고 당사자 간 다툼이 있거나 생길 수 있는 쟁점을 3~5개 만들어라.
쟁점은 질문 형태 제목으로 쓴다 (예: "수정 3~4회차는 추가 작업인가?").
각 쟁점마다 내 주장, 상대방 주장, 확인된 사실, 각 주장을 뒷받침하는 근거, 추가 확인할 것을 쓴다.
어느 쪽이 옳은지 결론 내리지 않는다. 대화에 드러나지 않은 주장은 "자료 없음"으로 쓴다.
summary에는 사건을 3문장 이내로 요약한다 (사실만).
```

**requestEvidence**
```
현재 자료로 결론을 낼 수 없는 지점을 찾아, 사용자에게 요청할 자료를 질문 형태로 최대 4개 만들어라.
각 요청에 왜 필요한지, 그리고 정산("settlement") 또는 쟁점("issue") 중 어떤 결론이 보류되는지 표시하라.
이미 자료로 확인된 사항은 요청하지 않는다.
```

**preventAgent**
```
너는 프리랜서와 의뢰인의 채팅방에 함께 있는 계약 정리 AI다. 중립을 지킨다.
최근 대화와 현재 확정된 조건(Terms)을 보고:
1) 새로 합의되었거나 바뀐 조건이 있으면 termsUpdate로 정리한다 (없으면 null).
2) 확정된 조건과 다른 요청(예: 합의 횟수를 넘는 수정, 납기 변경, 범위 밖 작업)이 있으면
   양측이 정할 것을 짧게 제안하는 changeAlert를 쓴다 (없으면 null).
3) 날짜·금액·범위가 모호한 표현이 있으면 구체화하는 질문 하나를 vagueQuestion으로 제안한다 (없으면 null).
말은 두 문장 이내, 존댓말, 한쪽 편을 들지 않는다. 할 말이 없으면 모두 null.
```

**noticeDraft**
```
정산표에서 status가 confirmed인 미지급 금액과 사건 목록만 사용해 내용증명 초안을 작성하라.
구성: 제목, 수신·발신(나/상대방), 계약 사실, 이행 사실, 미지급 금액, 지급 요청 기한, 미이행 시 조치 예정.
감정적 표현·협박성 표현을 쓰지 않는다. 날짜와 금액은 자료에 있는 값만 쓴다.
맨 위에 "초안 — 발송 전 사실관계를 직접 확인하세요"를 넣는다. 마크다운으로 출력.
```

**contractDraft** (P2)
```
확정된 Terms로 간단한 용역계약서 초안을 마크다운으로 작성하라.
항목: 작업 범위, 수정 횟수와 초과 시 단가, 납기, 대금과 지급 시기, 중도 취소 시 정산, 저작권 귀속.
Terms에 없는 항목은 "[협의 필요]"로 남긴다. 맨 위에 "초안"을 표시한다.
```

---

## 9. 데모 데이터 명세 (`data/sample/`, 전부 가상)

**사건: 로고 디자인 외주 잔금 분쟁** (프리랜서 "나" = 하은, 의뢰인 "상대방" = 가상 카페 사장)

`kakao_haeun.txt` (모바일 형식, 60~80줄):
- 6/2 견적 80만 원 제안 → 상대방 "네 그렇게 해요"
- 6/2 "수정은 2번까지 포함이에요" → 상대방 반응 없음 (← 핵심: 동의 미확인)
- 6/3 "선금 40만 원 보냈어요" (상대방)
- 6/10 시안 전달
- 6/11, 6/13 수정 1·2회차 요청과 반영
- 6/16, 6/18 수정 3·4회차 요청 ("색만 조금 더", "방향을 바꿔볼게요")
- 6/20 최종본 전달
- 6/21 상대방 "최종본이 마음에 안 들어서 잔금은 좀 생각해볼게요"
- 6/28, 7/5 나의 잔금 요청, 상대방 무응답
- 전화번호·계좌번호를 가상으로 2~3개 넣어 마스킹 시연 (예: 010-0000-1234 형식의 가상 번호)

`kakao_haeun_extra.txt` (재분석 시연용):
- 6/2 같은 날 다른 대화방 또는 앞부분: 나 "수정은 2번까지 포함이고, 추가 수정은 회당 5만 원이에요" → 상대방 "네 알겠습니다"
- 추가 시 기대 변화: "수정 횟수 합의" 증거 요청 해결, 쟁점 "수정 3~4회차는 추가 작업인가?"의 근거 보강, 정산표에 disputed 10만 원(2회 × 5만 원, 상대 동의 여부는 별도 쟁점) 표시

`transfer_haeun.png`: 가상 은행 앱 스타일 이체 내역 이미지, 6/3 400,000원 입금, 이름·계좌는 `홍*동`, `***-**-****`처럼 가려진 상태. (AI 이미지 생성 도구로 만들면 소개서 별첨에 "AI 생성" 표기)

`sample_analysis.json`: 위 데이터로 파이프라인을 실제 실행한 결과를 사람이 검토·수정해 저장한 Analysis(version 1).

---

## 10. 테스트 체크리스트 (11/23 오전, 결과를 소개서 07장에 사용)

| # | 시나리오 | 기대 결과 |
| --- | --- | --- |
| 1 | 시크릿 창에서 URL 접속 | 로그인 없이 첫 화면 |
| 2 | 샘플 사건 체험 | 3초 안에 결과 |
| 3 | 다시 분석하기 | v2 생성, 앱 멈춤 없음 |
| 4 | 추가 증거 넣기 | 바뀐 부분 강조, 쟁점·정산 갱신 |
| 5 | 출처 칩 클릭 | 원문 모달, 해당 줄 하이라이트 |
| 6 | 정산표 계산 | 800,000 / 400,000 / 400,000 |
| 7 | 마스킹 | 가상 전화번호·계좌가 원문 모달에서도 가려짐 |
| 8 | "어제 입금" 메시지 | sentAt과 eventDate 다르게 표시 |
| 9 | 한쪽 자료만 업로드 | 일방 자료 경고 배너 |
| 10 | 빈 txt 업로드 | 친절한 오류 메시지, 앱 유지 |
| 11 | PC 형식 카톡 txt | 정상 파싱 |
| 12 | 이체 이미지 업로드 | 입금 이벤트 confirmed |
| 13 | 내용증명 초안 | 초안 워터마크, confirmed 금액만 |
| 14 | 미지급 근거 없을 때 내용증명 | 생성 거부 안내 |
| 15 | 예방 모드 방 생성 | 링크 2개, 두 창 실시간 동기화 |
| 16 | 조건 합의 대화 | 조건 카드 생성, 양측 확인 |
| 17 | 수정 3회차 요청 | AI 변경 경고 |
| 18 | "다음 주쯤" 입력 | 확인 질문 제안 |
| 19 | 분쟁 분석으로 보내기 | 결과 화면 이동, Terms 이력이 근거로 표시 |
| 20 | 인쇄/PDF | A4로 잘림 없이 출력 |

---

## 11. AI 코딩 도구 사용 규칙

- 작업 시작 프롬프트 예: `PRD.md를 읽고, 5장 ④ 사건 타임라인을 3장 폴더 구조와 4-1 타입에 맞춰 구현해줘. 다른 담당자 폴더는 수정하지 마.`
- 한 번에 기능 하나씩. 구현 후 직접 실행해 확인하고 커밋한다. 커밋 메시지에 기능 번호를 붙인다(예: `feat(④): timeline`).
- 공통 타입이 필요하면 `lib/types.ts`에 추가를 요청하고 민수빈이 합친다.
- 화면 작업(최서은)은 API가 준비되기 전 `data/sample/sample_analysis.json`으로 먼저 개발한다.
- 에이전트 작업(민수빈)은 화면 없이 스크립트(`scripts/run-analysis.ts`)로 먼저 검증한다.
- AI가 만든 코드·사실·출처는 반드시 직접 실행·원문 확인한다 (대회 규칙: 검증 책임은 팀).
- 소개서의 "AI 활용내역"에 쓰기 위해, 어떤 도구로 무엇을 만들었고 팀이 무엇을 고쳤는지 `docs/ai-log.md`에 한 줄씩 기록한다.

---

## 12. 범위 밖 (만들지 않음)

로그인·회원가입, 결제·에스크로, 카카오톡 직접 연동, 실제 기관 제출·발송, 모바일 앱, 다국어.
소개서 08장 "확장 계획"에서만 언급한다.
