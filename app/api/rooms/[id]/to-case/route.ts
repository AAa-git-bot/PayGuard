// 담당: 이다은 | PRD ⑪
// POST 채팅방 → 분쟁 분석 사건으로 전환
// TODO: PRD.md 3장·5장에 맞춰 구현한다.

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  void id;
  void req;
  return Response.json({ error: "아직 구현되지 않았어요" }, { status: 501 });
}
