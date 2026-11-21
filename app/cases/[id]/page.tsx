import { CaseResult } from "@/components/CaseResult";
import { loadCase } from "./load-analysis";

// 사건마다 DB에서 새로 읽는다 (다시 분석 후 router.refresh()로 새 버전 반영)
export const dynamic = "force-dynamic";

export default async function Page({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const view = await loadCase(id);
  return <CaseResult view={view} />;
}
