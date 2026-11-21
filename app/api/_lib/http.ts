// 담당: 이다은 | API 라우트 공통 도우미 (_lib 폴더는 라우트가 아님)

/** 한국어 오류 응답. 서버 로그에는 원인(cause)을 남긴다. */
export function jsonError(status: number, message: string, cause?: unknown, extra?: Record<string, unknown>) {
  if (cause !== undefined) console.error(`[api ${status}] ${message}`, cause);
  return Response.json({ error: message, ...extra }, { status });
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
export function isUuid(s: string): boolean {
  return UUID_RE.test(s);
}

export const NOT_FOUND_CASE = "사건을 찾을 수 없어요. 링크를 다시 확인해 주세요.";
