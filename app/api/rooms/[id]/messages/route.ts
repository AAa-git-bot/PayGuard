// 담당: 이다은 → 민수빈(lib/agent/prevent) | PRD ⑨⑩⑪
// POST 메시지 저장 + 예방 모드 에이전트 실행
// TODO: PRD.md 3장·5장에 맞춰 구현한다.

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  void id;
  void req;
  return Response.json({ error: "아직 구현되지 않았어요" }, { status: 501 });
}
