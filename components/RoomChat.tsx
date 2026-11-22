"use client";

// 담당: 최서은 | PRD ⑨⑩⑪ 예방 모드 채팅방
// 초기 메시지·조건은 Supabase(anon)에서 읽고, room_messages·room_terms를 Realtime으로 구독한다.
// 쓰기(메시지·확인·분쟁 전환)는 모두 API로 한다.
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowUp,
  Bot,
  CircleHelp,
  Copy,
  FileSearch,
  LoaderCircle,
  MessageSquareDashed,
  ShieldCheck,
  TriangleAlert,
} from "lucide-react";
import type { Terms } from "@/lib/types";
import { getBrowserDb } from "@/lib/db";
import { Button, buttonVariants } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { TermsCard, TermsTable, TERM_ROWS, filledCount, type RoomRole } from "@/components/TermsCard";
import { dayHeading, kstDayKey, kstTime } from "@/components/labels";

type Sender = "freelancer" | "client" | "ai";
type Kind = "text" | "terms_card" | "alert" | "question_suggestion";

interface ChatMessage {
  id: string;
  sender: Sender;
  kind: Kind;
  text: string;
  payload: { terms?: Terms; changed?: string[] } | null;
  createdAt: string | null;
}

interface MessageRow {
  id: string;
  sender: Sender;
  kind: Kind | null;
  text: string;
  payload: ChatMessage["payload"];
  created_at: string | null;
}

const toMessage = (row: MessageRow): ChatMessage => ({
  id: row.id,
  sender: row.sender,
  kind: row.kind ?? "text",
  text: row.text,
  payload: row.payload ?? null,
  createdAt: row.created_at,
});

const ROLE_LABEL: Record<Sender, string> = { freelancer: "프리랜서", client: "의뢰인", ai: "AI" };

// 서버·브라우저 지역 설정과 상관없이 "오후 2:15"
const timeLabel = (iso: string | null) => kstTime(iso) ?? "";

const AVATAR: Record<Sender, { text: string; className: string }> = {
  freelancer: { text: "프", className: "bg-brand text-white" },
  client: { text: "의", className: "bg-slate-600 text-white" },
  ai: { text: "AI", className: "bg-secondary text-secondary-foreground" },
};

function Avatar({ sender }: { sender: Sender }) {
  const a = AVATAR[sender];
  return (
    <span className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${a.className}`}>
      {sender === "ai" ? <Bot className="size-4" aria-hidden /> : a.text}
    </span>
  );
}

function upsert(list: ChatMessage[], message: ChatMessage) {
  const index = list.findIndex((item) => item.id === message.id);
  if (index === -1) return [...list, message];
  const next = [...list];
  next[index] = message;
  return next;
}

async function fetchRoom(
  roomId: string,
): Promise<{ title: string; messages: ChatMessage[]; confirmed: Terms | null } | { error: string }> {
  try {
    const db = getBrowserDb();
    const [room, rows, terms] = await Promise.all([
      db.from("rooms").select("title").eq("id", roomId).maybeSingle(),
      db.from("room_messages").select("*").eq("room_id", roomId).order("created_at", { ascending: true }),
      db
        .from("room_terms")
        .select("data")
        .eq("room_id", roomId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle(),
    ]);
    if (room.error || rows.error) throw room.error ?? rows.error;
    if (!room.data) return { error: "채팅방을 찾을 수 없어요. 링크를 다시 확인해 주세요." };
    return {
      title: room.data.title as string,
      messages: ((rows.data ?? []) as MessageRow[]).map(toMessage),
      confirmed: (terms.data?.data as Terms | undefined) ?? null,
    };
  } catch (error) {
    console.error("[room] load failed", error);
    return { error: "채팅방을 불러오지 못했어요. 잠시 후 다시 시도해 주세요." };
  }
}

export function RoomChat({ roomId, role }: { roomId: string; role: RoomRole }) {
  const router = useRouter();
  const [consented, setConsented] = useState(false);
  const [title, setTitle] = useState("AI 채팅방");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [confirmed, setConfirmed] = useState<Terms | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
  const [copied, setCopied] = useState(false);
  const bottomRef = useRef<HTMLDivElement>(null);

  // 입장할 때마다 동의를 받는다 (PRD ⑨: 동의해야 입장)
  function agree() {
    setConsented(true);
  }

  useEffect(() => {
    let cancelled = false;
    void fetchRoom(roomId).then((result) => {
      if (cancelled) return;
      if ("error" in result) {
        setLoadError(result.error);
      } else {
        setTitle(result.title);
        setMessages((list) => result.messages.reduce(upsert, list));
        setConfirmed(result.confirmed);
        setLoadError(null);
      }
      setLoading(false);
    });
    let db: ReturnType<typeof getBrowserDb>;
    try {
      db = getBrowserDb();
    } catch {
      return;
    }
    const channel = db
      .channel(`room-${roomId}`)
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` },
        (change) => setMessages((list) => upsert(list, toMessage(change.new as MessageRow))),
      )
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "room_messages", filter: `room_id=eq.${roomId}` },
        (change) => setMessages((list) => upsert(list, toMessage(change.new as MessageRow))),
      )
      .on(
        "postgres_changes",
        { event: "INSERT", schema: "public", table: "room_terms", filter: `room_id=eq.${roomId}` },
        (change) => {
          const data = (change.new as { data?: Terms }).data;
          if (data) setConfirmed((current) => (current && current.version > data.version ? current : data));
        },
      )
      .subscribe();
    return () => {
      cancelled = true;
      void db.removeChannel(channel);
    };
  }, [roomId]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: "smooth", block: "end" });
  }, [messages.length]);

  const latestCardId = useMemo(
    () => [...messages].reverse().find((message) => message.kind === "terms_card")?.id ?? null,
    [messages],
  );

  async function send() {
    const text = draft.trim();
    if (!text || sending) return;
    setSending(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/rooms/${roomId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sender: role, text }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; message?: MessageRow };
      if (!response.ok) {
        setNotice(body.error ?? "메시지를 보내지 못했어요.");
        return;
      }
      setDraft("");
      if (body.message?.id) setMessages((list) => upsert(list, toMessage(body.message as MessageRow)));
    } catch {
      setNotice("서버에 연결하지 못했어요. 입력한 내용은 그대로 둘게요.");
    } finally {
      setSending(false);
    }
  }

  async function confirm(messageId: string) {
    setConfirmingId(messageId);
    setNotice(null);
    try {
      const response = await fetch(`/api/rooms/${roomId}/terms`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ messageId, role }),
      });
      const body = (await response.json().catch(() => ({}))) as { error?: string; terms?: Terms };
      if (!response.ok) {
        setNotice(body.error ?? "확인을 저장하지 못했어요.");
        return;
      }
      if (body.terms) {
        const terms = body.terms;
        setMessages((list) =>
          list.map((message) =>
            message.id === messageId ? { ...message, payload: { ...message.payload, terms } } : message,
          ),
        );
        if (terms.confirmedByFreelancer && terms.confirmedByClient) setConfirmed(terms);
      }
    } catch {
      setNotice("서버에 연결하지 못했어요.");
    } finally {
      setConfirmingId(null);
    }
  }

  async function toCase() {
    setConverting(true);
    setNotice(null);
    try {
      const response = await fetch(`/api/rooms/${roomId}/to-case`, { method: "POST" });
      const body = (await response.json().catch(() => ({}))) as { error?: string; id?: string; caseId?: string };
      const caseId = body.caseId ?? body.id;
      if (!response.ok || !caseId) {
        setNotice(body.error ?? "분쟁 분석으로 보내지 못했어요.");
        return;
      }
      router.push(`/cases/${caseId}`);
    } catch {
      setNotice("서버에 연결하지 못했어요.");
    } finally {
      setConverting(false);
    }
  }

  const otherRole: RoomRole = role === "freelancer" ? "client" : "freelancer";
  const filled = filledCount(confirmed);

  async function copyInvite() {
    try {
      await navigator.clipboard.writeText(`${window.location.origin}/rooms/${roomId}?as=${otherRole}`);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }

  // 날짜가 바뀌는 메시지 앞에 구분선
  const dayStarts = new Set<string>();
  {
    let last: string | null = null;
    for (const message of messages) {
      const day = kstDayKey(message.createdAt);
      if (day && day !== last) dayStarts.add(message.id);
      if (day) last = day;
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-5 sm:px-6">
      <Dialog open={!consented}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <span className="mb-1 flex size-10 items-center justify-center rounded-full bg-secondary text-brand">
              <ShieldCheck className="size-5" aria-hidden />
            </span>
            <DialogTitle>AI가 함께하는 채팅방이에요</DialogTitle>
            <DialogDescription>이 채팅방에는 AI가 참여해 계약 조건을 정리해요. 동의하시나요?</DialogDescription>
          </DialogHeader>
          <ul className="flex flex-col gap-1.5 rounded-lg bg-muted/60 p-3 text-sm leading-6 text-muted-foreground">
            <li>· 대화에서 금액·수정 횟수·납기가 나오면 조건 카드로 정리해요.</li>
            <li>· 합의와 다른 요청이나 모호한 표현이 있으면 알려 드려요.</li>
            <li>· 대화를 막거나 대신 답하지 않아요. 실제 개인정보는 입력하지 말아 주세요.</li>
          </ul>
          <DialogFooter>
            <Link href="/" className={buttonVariants({ variant: "outline" })}>
              나가기
            </Link>
            <Button type="button" onClick={agree}>
              동의하고 입장
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <header className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-card px-4 py-3 ring-1 ring-foreground/10">
        <div className="flex min-w-0 items-center gap-3">
          <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-secondary text-brand">
            <Bot className="size-5" aria-hidden />
          </span>
          <div className="min-w-0">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span className="size-1.5 animate-pulse rounded-full bg-emerald-500" aria-hidden />
              실시간 · AI 채팅방
            </div>
            <h1 className="truncate text-lg font-semibold">{title}</h1>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <span className="flex -space-x-2" aria-hidden>
            {(["freelancer", "client", "ai"] as const).map((who) => (
              <span key={who} className="rounded-full ring-2 ring-card">
                <Avatar sender={who} />
              </span>
            ))}
          </span>
          <span className="rounded-full bg-primary px-3 py-1 text-xs font-medium text-primary-foreground">
            나는 {ROLE_LABEL[role]}
          </span>
        </div>
      </header>

      {loadError ? (
        <p className="flex items-center gap-2 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          <TriangleAlert className="size-4" aria-hidden />
          {loadError}
        </p>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_320px]">
        <section className="flex h-[calc(100vh-13rem)] min-h-[480px] flex-col overflow-hidden rounded-2xl bg-card ring-1 ring-foreground/10">
          <ol className="flex flex-1 flex-col gap-4 overflow-y-auto bg-muted/30 p-4 sm:p-5" aria-live="polite">
            {loading ? (
              <li className="flex items-center gap-2 self-center text-sm text-muted-foreground">
                <LoaderCircle className="size-4 animate-spin" aria-hidden />
                대화를 불러오는 중이에요
              </li>
            ) : null}
            {!loading && messages.length === 0 && !loadError ? (
              <li className="m-auto flex max-w-sm flex-col items-center gap-2 text-center">
                <span className="flex size-12 items-center justify-center rounded-full bg-secondary text-brand">
                  <MessageSquareDashed className="size-6" aria-hidden />
                </span>
                <p className="font-medium">첫 메시지를 보내 보세요</p>
                <p className="text-sm leading-6 text-muted-foreground">
                  작업 범위·금액·수정 횟수·납기부터 이야기하면 AI가 조건 카드로 정리해 드려요.
                </p>
              </li>
            ) : null}
            {messages.map((message) => {
              const day = kstDayKey(message.createdAt);
              const divider =
                day && dayStarts.has(message.id) ? (
                  <li className="flex items-center gap-3 text-xs text-muted-foreground" aria-hidden>
                    <span className="h-px flex-1 bg-border" />
                    {dayHeading(day)}
                    <span className="h-px flex-1 bg-border" />
                  </li>
                ) : null;

              let body: React.ReactNode;
              if (message.sender === "ai") {
                const terms = message.payload?.terms;
                const isCard = message.kind === "terms_card" && terms;
                const isAlert = message.kind === "alert";
                body = (
                  <li className="flex gap-2.5 sm:max-w-[88%]">
                    <Avatar sender="ai" />
                    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
                      <p className="text-xs text-muted-foreground">
                        <span className="font-medium text-foreground">PayGuard AI</span> · {timeLabel(message.createdAt)}
                      </p>
                      {isCard ? (
                        <TermsCard
                          terms={terms}
                          changed={message.payload?.changed ?? []}
                          role={role}
                          latest={message.id === latestCardId}
                          pending={confirmingId === message.id}
                          onConfirm={() => void confirm(message.id)}
                        />
                      ) : (
                        <div
                          className={`rounded-2xl rounded-tl-md px-4 py-3 text-sm ring-1 ${
                            isAlert ? "bg-amber-50 text-amber-950 ring-amber-300/70" : "bg-secondary text-foreground ring-brand/20"
                          }`}
                        >
                          <p
                            className={`flex items-center gap-1.5 text-xs font-semibold ${
                              isAlert ? "text-amber-800" : "text-secondary-foreground"
                            }`}
                          >
                            {isAlert ? <TriangleAlert className="size-3.5" aria-hidden /> : <CircleHelp className="size-3.5" aria-hidden />}
                            {isAlert ? "조건 변경 알림" : "확인 질문 제안"}
                          </p>
                          <p className="mt-1 leading-6">{message.text}</p>
                          <p className="mt-1.5 text-[11px] text-muted-foreground">AI가 생성한 결과예요</p>
                        </div>
                      )}
                    </div>
                  </li>
                );
              } else {
                const mine = message.sender === role;
                body = (
                  <li className={`flex items-end gap-2.5 ${mine ? "flex-row-reverse" : ""}`}>
                    {!mine ? <Avatar sender={message.sender} /> : null}
                    <div className={`flex max-w-[78%] flex-col gap-1 ${mine ? "items-end" : "items-start"}`}>
                      {!mine ? <span className="text-xs font-medium text-muted-foreground">{ROLE_LABEL[message.sender]}</span> : null}
                      <div className={`flex items-end gap-1.5 ${mine ? "flex-row-reverse" : ""}`}>
                        <p
                          className={`whitespace-pre-wrap rounded-2xl px-3.5 py-2 text-sm leading-6 ${
                            mine ? "rounded-br-md bg-primary text-primary-foreground" : "rounded-bl-md bg-card ring-1 ring-foreground/10"
                          }`}
                        >
                          {message.text}
                        </p>
                        <span className="shrink-0 text-[11px] text-muted-foreground">{timeLabel(message.createdAt)}</span>
                      </div>
                    </div>
                  </li>
                );
              }
              return (
                <Fragment key={message.id}>
                  {divider}
                  {body}
                </Fragment>
              );
            })}
            <div ref={bottomRef} />
          </ol>

          {notice ? (
            <p className="mx-3 mt-3 rounded-lg bg-muted px-3 py-2 text-sm" role="status">
              {notice}
            </p>
          ) : null}
          <form
            className="border-t bg-card p-3"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <div className="flex items-end gap-2 rounded-2xl bg-muted/50 p-1.5 ring-1 ring-foreground/10 focus-within:ring-2 focus-within:ring-brand/50">
              <Textarea
                value={draft}
                onChange={(event) => setDraft(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                    event.preventDefault();
                    void send();
                  }
                }}
                placeholder={`${ROLE_LABEL[role]}로 메시지 보내기`}
                className="max-h-36 min-h-10 flex-1 resize-none border-0 bg-transparent shadow-none focus-visible:ring-0"
                rows={1}
                disabled={!consented}
              />
              <Button
                type="submit"
                size="icon"
                className="size-9 shrink-0 rounded-full"
                disabled={!consented || sending || !draft.trim()}
                aria-label="보내기"
              >
                {sending ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <ArrowUp className="size-4" aria-hidden />}
              </Button>
            </div>
            <p className="mt-1.5 px-1 text-[11px] text-muted-foreground">Enter로 보내기 · Shift+Enter로 줄바꿈</p>
          </form>
        </section>

        <aside className="flex flex-col gap-3">
          <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-center justify-between gap-2">
              <h2 className="font-semibold">확정된 조건</h2>
              {confirmed ? (
                <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700 ring-1 ring-emerald-600/20">
                  v{confirmed.version} 양측 확인
                </span>
              ) : null}
            </div>
            <div className="mt-3">
              <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>정해진 조건</span>
                <span className="font-medium text-foreground">
                  {filled}/{TERM_ROWS.length}
                </span>
              </div>
              <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full bg-brand transition-all" style={{ width: `${(filled / TERM_ROWS.length) * 100}%` }} />
              </div>
            </div>
            <div className="mt-2">
              <TermsTable terms={confirmed} />
            </div>
            {!confirmed ? (
              <p className="mt-2 text-xs leading-5 text-muted-foreground">
                대화에서 조건이 나오면 AI가 조건 카드를 올려요. 양측이 모두 확인하면 여기에 저장돼요.
              </p>
            ) : null}
          </section>

          <section className="rounded-2xl bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="font-semibold">상대방 초대</h2>
            <p className="mt-1 text-sm leading-6 text-muted-foreground">
              {ROLE_LABEL[otherRole]}에게 이 링크를 보내면 같은 대화를 실시간으로 봐요.
            </p>
            <Button type="button" variant="outline" className="mt-2 w-full" onClick={() => void copyInvite()}>
              <Copy className="size-4" aria-hidden />
              {copied ? "복사했어요" : `${ROLE_LABEL[otherRole]}용 링크 복사`}
            </Button>
          </section>

          <section className="rounded-2xl bg-primary p-4 text-primary-foreground">
            <h2 className="flex items-center gap-1.5 font-semibold">
              <FileSearch className="size-4" aria-hidden />
              분쟁이 생겼나요?
            </h2>
            <p className="mt-1 text-sm leading-6 text-primary-foreground/75">
              이 채팅 기록과 확정된 조건 이력을 근거로 타임라인·정산표·쟁점을 정리해요.
            </p>
            <Button
              type="button"
              className="mt-3 w-full bg-brand text-white hover:bg-brand/90"
              disabled={converting}
              onClick={() => void toCase()}
            >
              {converting ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : null}
              {converting ? "분석하는 중이에요 (1분 정도)" : "분쟁 분석으로 보내기"}
            </Button>
          </section>
        </aside>
      </div>
    </main>
  );
}
