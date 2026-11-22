// 담당: 최서은 | PRD ⑨⑩⑪ 예방 모드 채팅방 (?as=freelancer | ?as=client)
import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { RoomChat } from "@/components/RoomChat";

export default async function Page({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ as?: string | string[] }>;
}) {
  const { id } = await params;
  const { as } = await searchParams;
  const role = as === "freelancer" || as === "client" ? as : null;

  if (!role) {
    return (
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col gap-3 px-4 py-10">
        <h1 className="text-xl font-semibold">어떤 역할로 들어갈까요?</h1>
        <p className="text-sm leading-6 text-muted-foreground">
          방을 만든 화면의 링크로 들어오면 역할이 정해져 있어요. 여기서 고를 수도 있어요.
        </p>
        <div className="flex flex-wrap gap-2">
          <Link href={`/rooms/${id}?as=freelancer`} className={buttonVariants()}>
            프리랜서로 입장
          </Link>
          <Link href={`/rooms/${id}?as=client`} className={buttonVariants({ variant: "outline" })}>
            의뢰인으로 입장
          </Link>
        </div>
      </main>
    );
  }

  return <RoomChat key={`${id}-${role}`} roomId={id} role={role} />;
}
