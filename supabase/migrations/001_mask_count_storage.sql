-- 담당: 이다은 | schema.sql을 이미 Run한 프로젝트에만 추가로 실행 (처음 세팅이면 schema.sql만 Run하면 됨)
alter table sources add column if not exists mask_count int default 0;

create unique index if not exists messages_case_seq on messages (case_id, seq);
create index if not exists analyses_case_version on analyses (case_id, version desc);

insert into storage.buckets (id, name, public) values ('evidence', 'evidence', false)
on conflict (id) do nothing;
