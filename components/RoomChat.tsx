"use client";

// 담당: 최서은 | PRD ⑨⑩⑪ 예방 모드 채팅방
// 초기 메시지·조건은 Supabase(anon)에서 읽고, room_messages·room_terms를 Realtime으로 구독한다.
// 쓰기(메시지·확인·분쟁 전환)는 모두 API로 한다.
import { useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import type { Terms } from "@/lib/types";
import { getBrowserDb } from "@/lib/db";
import { Badge } from "@/components/ui/badge";
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
import { AiBadge } from "@/components/AiBadge";
import { TermsCard, TermsTable, type RoomRole } from "@/components/TermsCard";

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

function timeLabel(iso: string | null) {
  if (!iso) return "";
  const date = new Date(iso);
  return Number.isNaN(date.getTime())
    ? ""
    : date.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "numeric", minute: "2-digit" });
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
  const [title, setTitle] = useState("예방 모드 채팅방");
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [confirmed, setConfirmed] = useState<Terms | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [draft, setDraft] = useState("");
  const [sending, setSending] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [confirmingId, setConfirmingId] = useState<string | null>(null);
  const [converting, setConverting] = useState(false);
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

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-1 flex-col gap-4 px-4 py-4 sm:px-6">
      <Dialog open={!consented}>
        <DialogContent showCloseButton={false}>
          <DialogHeader>
            <DialogTitle>AI가 함께하는 채팅방이에요</DialogTitle>
            <DialogDescription>
              이 채팅방에는 AI가 참여해 계약 조건을 정리해요. 동의하시나요?
            </DialogDescription>
          </DialogHeader>
          <p className="text-sm leading-6 text-muted-foreground">
            AI는 조건을 기록하고 확인 질문을 제안할 뿐, 대화를 막거나 대신 답하지 않아요. 실제 개인정보는 입력하지 말아 주세요.
          </p>
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

      <header className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-xs text-muted-foreground">예방 모드</p>
          <h1 className="truncate text-lg font-semibold">{title}</h1>
        </div>
        <Badge variant="outline">나는 {ROLE_LABEL[role]}</Badge>
      </header>

      {loadError ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {loadError}
        </p>
      ) : null}

      <div className="grid flex-1 gap-4 lg:grid-cols-[minmax(0,1fr)_340px]">
        <section className="flex min-h-[60vh] flex-col rounded-xl bg-card ring-1 ring-foreground/10">
          <ol className="flex flex-1 flex-col gap-3 overflow-y-auto p-3 sm:p-4" aria-live="polite">
            {loading ? <li className="text-sm text-muted-foreground">대화를 불러오는 중이에요.</li> : null}
            {!loading && messages.length === 0 && !loadError ? (
              <li className="rounded-lg bg-muted/60 px-3 py-2 text-sm text-muted-foreground">
                아직 대화가 없어요. 작업 범위·금액·수정 횟수·납기부터 이야기해 보세요.
              </li>
            ) : null}
            {messages.map((message) => {
              if (message.sender === "ai") {
                const terms = message.payload?.terms;
                if (message.kind === "terms_card" && terms) {
                  return (
                    <li key={message.id} className="flex flex-col gap-1 sm:max-w-[85%]">
                      <p className="text-xs text-muted-foreground">AI · {timeLabel(message.createdAt)}</p>
                      {message.text ? <p className="text-sm">{message.text}</p> : null}
                      <TermsCard
                        terms={terms}
                        changed={message.payload?.changed ?? []}
                        role={role}
                        latest={message.id === latestCardId}
                        pending={confirmingId === message.id}
                        onConfirm={() => void confirm(message.id)}
                      />
                    </li>
                  );
                }
                const isAlert = message.kind === "alert";
                return (
                  <li
                    key={message.id}
                    className={`flex flex-col gap-1.5 rounded-xl px-3 py-2 text-sm sm:max-w-[85%] ${
                      isAlert ? "bg-amber-50 text-amber-950 ring-1 ring-amber-300" : "bg-sky-50 text-sky-950 ring-1 ring-sky-200"
                    }`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-medium">
                        {isAlert ? "AI · 조건 변경 알림" : "AI · 확인 질문 제안"} {timeLabel(message.createdAt)}
                      </span>
                      <AiBadge />
                    </div>
                    <p className="leading-6">{message.text}</p>
                  </li>
                );
              }
              const mine = message.sender === role;
              return (
                <li key={message.id} className={`flex flex-col gap-0.5 ${mine ? "items-end" : "items-start"}`}>
                  <span className="text-xs text-muted-foreground">
                    {ROLE_LABEL[message.sender]} · {timeLabel(message.createdAt)}
                  </span>
                  <p
                    className={`max-w-[85%] whitespace-pre-wrap rounded-2xl px-3 py-2 text-sm leading-6 ${
                      mine ? "bg-primary text-primary-foreground" : "bg-muted"
                    }`}
                  >
                    {message.text}
                  </p>
                </li>
              );
            })}
            <div ref={bottomRef} />
          </ol>
          <form
            className="flex flex-col gap-2 border-t p-3 sm:flex-row sm:items-end"
            onSubmit={(event) => {
              event.preventDefault();
              void send();
            }}
          >
            <Textarea
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) {
                  event.preventDefault();
                  void send();
                }
              }}
              placeholder={`${ROLE_LABEL[role]}로 메시지 보내기 (Enter 전송, Shift+Enter 줄바꿈)`}
              className="min-h-11 flex-1"
              disabled={!consented}
            />
            <Button type="submit" disabled={!consented || sending || !draft.trim()} className="sm:w-20">
              {sending ? "보내는 중" : "보내기"}
            </Button>
          </form>
          {notice ? (
            <p className="mx-3 mb-3 rounded-lg bg-muted px-3 py-2 text-sm" role="status">
              {notice}
            </p>
          ) : null}
        </section>

        <aside className="flex flex-col gap-3">
          <section className="flex flex-col gap-3 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <div className="flex items-start justify-between gap-2">
              <h2 className="text-base font-semibold">확정된 조건</h2>
              {confirmed ? <Badge variant="outline">v{confirmed.version}</Badge> : null}
            </div>
            {confirmed ? (
              <>
                <TermsTable terms={confirmed} />
                <p className="text-xs text-muted-foreground">프리랜서·의뢰인 양측이 확인한 조건이에요.</p>
              </>
            ) : (
              <p className="text-sm leading-6 text-muted-foreground">
                아직 양측이 확인한 조건이 없어요. 대화에서 조건이 나오면 AI가 조건 카드를 올려요.
              </p>
            )}
          </section>

          <section className="flex flex-col gap-2 rounded-xl bg-card p-4 ring-1 ring-foreground/10">
            <h2 className="text-base font-semibold">분쟁이 생겼나요?</h2>
            <p className="text-sm leading-6 text-muted-foreground">
              이 채팅 기록과 확정된 조건 이력을 근거로 분쟁 정리를 시작해요.
            </p>
            <Button type="button" variant="outline" disabled={converting} onClick={() => void toCase()}>
              {converting ? "보내는 중" : "분쟁 분석으로 보내기"}
            </Button>
          </section>

          <p className="text-xs leading-5 text-muted-foreground">
            상대방({ROLE_LABEL[otherRole]})은 자기 링크로 들어오면 같은 대화를 실시간으로 봐요.
          </p>
        </aside>
      </div>
    </main>
  );
}
