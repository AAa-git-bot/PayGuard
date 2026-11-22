import { CalendarClock, FilePen, Lock, MessageSquareText, Scale, ShieldCheck } from "lucide-react";
import { HomeActions } from "@/components/HomeActions";

const TRUST = [
  { icon: Lock, text: "전화번호·계좌·실명은 자동으로 가려요" },
  { icon: Scale, text: "누가 잘못했는지 판단하지 않아요" },
  { icon: FilePen, text: "문서는 초안만 만들어요" },
];

const STEPS = [
  {
    icon: MessageSquareText,
    title: "대화와 자료를 올려요",
    text: "채팅 내보내기 txt, 이체 내역·영수증 이미지, 메모를 그대로 올리면 돼요.",
  },
  {
    icon: CalendarClock,
    title: "AI가 사건을 정리해요",
    text: "언제 무엇을 약속했는지 타임라인으로, 받을 돈은 코드가 계산한 정산표로 보여 줘요.",
  },
  {
    icon: ShieldCheck,
    title: "빈 곳을 채우고 대응해요",
    text: "부족한 증거를 알려 주고, 쟁점 카드와 내용증명 초안으로 상담을 준비해요.",
  },
];

export default function Home() {
  return (
    <main className="flex flex-1 flex-col">
      <section className="relative overflow-hidden border-b bg-gradient-to-b from-secondary/70 to-background">
        <div className="mx-auto flex w-full max-w-5xl flex-col gap-8 px-4 py-14 sm:px-8 sm:py-20">
          <div className="flex max-w-2xl flex-col gap-4">
            <span className="w-fit rounded-full bg-card px-3 py-1 text-xs font-medium text-secondary-foreground ring-1 ring-primary/15">
              청년 프리랜서를 위한 분쟁 정리 AI
            </span>
            <h1 className="text-3xl font-bold leading-tight tracking-tight sm:text-5xl sm:leading-tight">
              채팅으로 한 약속,
              <br />
              <span className="text-primary">증거로 정리해 드려요</span>
            </h1>
            <p className="text-base leading-7 text-muted-foreground sm:text-lg sm:leading-8">
              계약서 없이 채팅으로 일하는 청년 프리랜서를 위해, AI가 조건을 기록하고 분쟁이 생기면 증거를 정리해 드려요.
            </p>
            <ul className="flex flex-wrap gap-x-5 gap-y-2 text-sm text-foreground/80">
              {TRUST.map(({ icon: Icon, text }) => (
                <li key={text} className="flex items-center gap-1.5">
                  <Icon className="size-4 text-primary" aria-hidden />
                  {text}
                </li>
              ))}
            </ul>
          </div>
          <HomeActions />
        </div>
      </section>

      <section className="mx-auto w-full max-w-5xl px-4 py-12 sm:px-8">
        <h2 className="text-xl font-semibold">이렇게 도와드려요</h2>
        <ol className="mt-5 grid gap-3 sm:grid-cols-3">
          {STEPS.map(({ icon: Icon, title, text }, i) => (
            <li key={title} className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
              <div className="flex items-center gap-3">
                <span className="flex size-9 items-center justify-center rounded-full bg-secondary text-sm font-semibold text-secondary-foreground">
                  {i + 1}
                </span>
                <Icon className="size-5 text-muted-foreground" aria-hidden />
              </div>
              <p className="mt-4 font-semibold">{title}</p>
              <p className="mt-1.5 text-sm leading-6 text-muted-foreground">{text}</p>
            </li>
          ))}
        </ol>
      </section>
    </main>
  );
}
