-- 담당: 이다은 | 테이블 권한(GRANT)이 빠져 service_role·anon 모두 "permission denied (42501)"가 날 때 실행
-- 여러 번 실행해도 안전하다. 001·002를 먼저 실행한 뒤 실행한다.
-- RLS 정책(schema.sql)은 그대로: 사건 테이블은 정책 없음(서버 service_role만), 채팅 테이블은 데모용 anon 허용.

grant usage on schema public to anon, authenticated, service_role;

-- 서버(API 라우트)는 service_role로 모든 테이블을 읽고 쓴다
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

-- 브라우저(RoomChat)는 anon으로 채팅방을 읽고 Realtime을 구독한다. 쓰기는 모두 API(service_role)로 한다.
grant select on rooms, room_messages, room_terms to anon;

-- 앞으로 만드는 테이블에도 service_role 권한이 자동으로 붙게
alter default privileges in schema public grant all on tables to service_role;
alter default privileges in schema public grant all on sequences to service_role;
