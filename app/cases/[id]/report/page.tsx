// 담당: 최서은 | PRD ⑫
// TODO: PRD.md 5장 해당 기능을 구현한다. 지금은 빈 화면이다.
export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  return (
    <main className="mx-auto max-w-4xl p-8">
      <h1 className="text-2xl font-bold">사건 정리 자료</h1>
      <p className="mt-2 text-sm text-gray-500">준비 중 · id: {id}</p>
    </main>
  );
}
