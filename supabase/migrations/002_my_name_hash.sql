-- 담당: 이다은 | schema.sql을 이 변경 전에 Run한 프로젝트에만 추가로 실행
alter table cases add column if not exists my_name_hash text;
