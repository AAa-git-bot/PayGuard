// 담당: 이다은 | PRD ④
// GET 사건 전체 조회 (사건, 메시지, 최신 분석)
// TODO: PRD.md 3장·5장에 맞춰 구현한다.

export async function GET(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  void id;
  void req;
  return Response.json({ error: "아직 구현되지 않았어요" }, { status: 501 });
}
