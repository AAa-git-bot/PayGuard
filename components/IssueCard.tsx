import type { CaseEvent, Issue } from "@/lib/types";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { AiBadge } from "@/components/AiBadge";

function claimText(ids: string[], events: CaseEvent[]) {
  const text = ids
    .map((id) => events.find((event) => event.id === id)?.what)
    .filter((item): item is string => Boolean(item));
  return text.length ? text.join(" ") : "이 자료에는 없어요.";
}

export function IssueCard({
  issues,
  events,
  changedIds,
}: {
  issues: Issue[];
  events: CaseEvent[];
  changedIds: Set<string>;
}) {
  return (
    <section className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <h2 className="text-base font-semibold">쟁점</h2>
        <AiBadge />
      </div>
      <div className="flex flex-col gap-3">
        {issues.map((issue) => {
          const changed = changedIds.has(issue.id);
          return (
            <Card key={issue.id} className={changed ? "ring-2 ring-yellow-400" : ""}>
              <CardHeader>
                <CardTitle className="flex flex-wrap items-center gap-2">
                  {issue.title}
                  {changed ? <Badge className="bg-yellow-200 text-yellow-950">새로 바뀜</Badge> : null}
                </CardTitle>
              </CardHeader>
              <CardContent className="flex flex-col gap-3">
                <p>
                  <span className="font-medium">내 주장. </span>
                  {issue.myClaim}
                </p>
                <p>
                  <span className="font-medium">상대 주장. </span>
                  {issue.otherClaim}
                </p>
                <div>
                  <p className="font-medium">확인된 사실</p>
                  <ul className="mt-1 list-disc pl-5">
                    {issue.facts.map((fact) => (
                      <li key={fact}>{fact}</li>
                    ))}
                  </ul>
                </div>
                <p>
                  <span className="font-medium">내 근거. </span>
                  {claimText(issue.supportsMe, events)}
                </p>
                <p>
                  <span className="font-medium">상대 근거. </span>
                  {claimText(issue.supportsOther, events)}
                </p>
                <div>
                  <p className="font-medium">추가 확인</p>
                  <ul className="mt-1 list-disc pl-5">
                    {issue.toCheck.map((item) => (
                      <li key={item}>{item}</li>
                    ))}
                  </ul>
                </div>
                <p className="border-t pt-3 text-sm text-muted-foreground">
                  PayGuard는 책임 비율을 판단하지 않아요. 아래 근거를 상담에 활용하세요.
                </p>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </section>
  );
}
