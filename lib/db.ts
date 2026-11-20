// 담당: 이다은 | Supabase 클라이언트·쿼리 함수
// 서버(API 라우트)에서는 getServerDb(), 브라우저(실시간 채팅)에서는 getBrowserDb()를 쓴다.
// SUPABASE_SERVICE_ROLE_KEY는 서버 전용. 클라이언트 컴포넌트에서 getServerDb를 import하지 않는다.
import { createClient, type SupabaseClient } from "@supabase/supabase-js";

let serverDb: SupabaseClient | null = null;
let browserDb: SupabaseClient | null = null;

export function getServerDb(): SupabaseClient {
  if (!serverDb) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!url || !key) throw new Error("Supabase 서버 환경변수가 없어요 (.env.local 확인)");
    serverDb = createClient(url, key, { auth: { persistSession: false } });
  }
  return serverDb;
}

export function getBrowserDb(): SupabaseClient {
  if (!browserDb) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
    if (!url || !key) throw new Error("Supabase 공개 환경변수가 없어요 (.env.local 확인)");
    browserDb = createClient(url, key);
  }
  return browserDb;
}

// TODO: createCase, addSource, insertMessages, getCase, saveAnalysis, getLatestAnalysis ...
