-- 담당: 이다은 | PRD 4-2. Supabase SQL Editor에 통째로 붙여넣고 Run
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
  mask_count int default 0,  -- 이 자료에서 가린 개인정보 수 ("개인정보 n건을 가렸어요")
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

-- Realtime 켜기 (Supabase 대시보드 Database → Publications에서 해도 됨)
alter publication supabase_realtime add table room_messages;
alter publication supabase_realtime add table room_terms;

-- 데모용 RLS: anon 읽기/쓰기 허용 (실서비스 시 강화 필요, 소개서에 한계로 명시)
alter table rooms enable row level security;
alter table room_messages enable row level security;
alter table room_terms enable row level security;
create policy "demo all rooms" on rooms for all using (true) with check (true);
create policy "demo all room_messages" on room_messages for all using (true) with check (true);
create policy "demo all room_terms" on room_terms for all using (true) with check (true);
-- cases/sources/messages/analyses/documents는 서버(service_role)만 접근 → RLS 켜고 정책 없음
alter table cases enable row level security;
alter table sources enable row level security;
alter table messages enable row level security;
alter table analyses enable row level security;
alter table documents enable row level security;

-- 메시지 순번: 사건 안에서 seq 중복 방지 + 조회 속도
create unique index messages_case_seq on messages (case_id, seq);
create index analyses_case_version on analyses (case_id, version desc);

-- 이미지(이체 내역·영수증) 저장용 Storage 버킷 (비공개, 서버 service_role로만 접근)
insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false)
on conflict (id) do nothing;
