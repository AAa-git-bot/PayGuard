// 담당: 최서은 | PRD ⑨⑩⑪ 예방 모드 채팅방 (?as=freelancer | ?as=client)
import Link from "next/link";
import { ArrowRight, MessagesSquare } from "lucide-react";
import { RoomChat } from "@/components/RoomChat";

const ROLES = [
  { as: "freelancer", label: "프리랜서로 입장", desc: "작업을 맡은 사람", avatar: "프", tone: "bg-brand text-white" },
  { as: "client", label: "의뢰인으로 입장", desc: "작업을 맡긴 사람", avatar: "의", tone: "bg-slate-600 text-white" },
] as const;

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
      <main className="mx-auto flex w-full max-w-md flex-1 flex-col justify-center gap-5 px-4 py-12">
        <div className="flex flex-col items-center gap-3 text-center">
          <span className="flex size-12 items-center justify-center rounded-2xl bg-secondary text-brand">
            <MessagesSquare className="size-6" aria-hidden />
          </span>
          <h1 className="text-xl font-bold">어떤 역할로 들어갈까요?</h1>
          <p className="text-sm leading-6 text-muted-foreground">
            방을 만든 화면의 링크로 들어오면 역할이 정해져 있어요. 여기서 고를 수도 있어요.
          </p>
        </div>
        <div className="flex flex-col gap-2.5">
          {ROLES.map((r) => (
            <Link
              key={r.as}
              href={`/rooms/${id}?as=${r.as}`}
              className="group flex items-center gap-3 rounded-2xl bg-card p-4 ring-1 ring-foreground/10 transition-colors hover:ring-brand/50"
            >
              <span className={`flex size-10 items-center justify-center rounded-full text-sm font-semibold ${r.tone}`}>{r.avatar}</span>
              <span className="flex-1">
                <span className="block font-semibold">{r.label}</span>
                <span className="text-xs text-muted-foreground">{r.desc}</span>
              </span>
              <ArrowRight className="size-4 text-muted-foreground transition-transform group-hover:translate-x-0.5" aria-hidden />
            </Link>
          ))}
        </div>
      </main>
    );
  }

  return <RoomChat key={`${id}-${role}`} roomId={id} role={role} />;
}
