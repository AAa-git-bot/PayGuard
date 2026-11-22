"use client";

import { useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  ArrowLeft,
  Check,
  CircleCheck,
  FileText,
  ImageIcon,
  LoaderCircle,
  Lock,
  MessageSquareText,
  Sparkles,
  UploadCloud,
  UserRound,
  X,
  type LucideIcon,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { parseKakao } from "@/lib/parse-kakao";
import { toUploadFile } from "@/components/file-payload";

// Vercel 요청 한도(약 4.5MB)와 base64 증가(약 1.3배)를 고려한 이미지 권장 크기
const MAX_IMAGE_BYTES = 3 * 1024 * 1024;

type Step = "idle" | "case" | "sources" | "analyze";

const STEP_LABEL: Record<Exclude<Step, "idle">, string> = {
  case: "사건 만들기",
  sources: "자료 올리기·개인정보 가리기",
  analyze: "AI 분석 (1~2분)",
};

const STEP_ORDER = ["case", "sources", "analyze"] as const;

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as {
    error?: string;
    id?: string;
    participants?: string[];
  };
  return body;
}

const sizeLabel = (bytes: number) =>
  bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)}MB` : `${Math.max(1, Math.round(bytes / 1024))}KB`;

function Section({
  index,
  title,
  description,
  optional,
  children,
}: {
  index: number;
  title: string;
  description?: string;
  optional?: boolean;
  children: ReactNode;
}) {
  return (
    <section className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
      <div className="flex items-start gap-3">
        <span className="flex size-7 shrink-0 items-center justify-center rounded-full bg-primary text-xs font-semibold text-primary-foreground">
          {index}
        </span>
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 font-semibold">
            {title}
            {optional ? <span className="text-xs font-normal text-muted-foreground">선택</span> : null}
          </h2>
          {description ? <p className="mt-0.5 text-sm leading-6 text-muted-foreground">{description}</p> : null}
        </div>
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}

function DropZone({
  id,
  icon: Icon,
  title,
  hint,
  accept,
  onFiles,
}: {
  id: string;
  icon: LucideIcon;
  title: string;
  hint: string;
  accept: string;
  onFiles: (files: FileList | null) => void;
}) {
  const [over, setOver] = useState(false);
  return (
    <label
      htmlFor={id}
      onDragOver={(event) => {
        event.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(event) => {
        event.preventDefault();
        setOver(false);
        onFiles(event.dataTransfer.files);
      }}
      className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed px-4 py-7 text-center transition-colors ${
        over ? "border-brand bg-secondary" : "border-border bg-muted/40 hover:border-brand/60 hover:bg-secondary/50"
      }`}
    >
      <span className="flex size-11 items-center justify-center rounded-full bg-card text-brand ring-1 ring-foreground/10">
        <Icon className="size-5" aria-hidden />
      </span>
      <span className="text-sm font-medium">{title}</span>
      <span className="text-xs text-muted-foreground">{hint}</span>
      <input
        id={id}
        className="sr-only"
        type="file"
        accept={accept}
        multiple
        onChange={(event) => {
          onFiles(event.target.files);
          event.target.value = "";
        }}
      />
    </label>
  );
}

function FileChip({ icon: Icon, name, meta, onRemove }: { icon: LucideIcon; name: string; meta: string; onRemove: () => void }) {
  return (
    <li className="flex items-center gap-3 rounded-lg bg-muted/60 px-3 py-2 text-sm">
      <Icon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate font-medium">{name}</span>
      <span className="shrink-0 text-xs text-muted-foreground">{meta}</span>
      <button
        type="button"
        onClick={onRemove}
        className="rounded-md p-1 text-muted-foreground hover:bg-card hover:text-foreground"
        aria-label={`${name} 빼기`}
      >
        <X className="size-4" aria-hidden />
      </button>
    </li>
  );
}

export default function NewCasePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [paste, setPaste] = useState("");
  const [showPaste, setShowPaste] = useState(false);
  const [kakaoFiles, setKakaoFiles] = useState<{ name: string; text: string }[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [me, setMe] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");
  // 사건은 만들었는데 자료 올리기에서 실패한 경우, 다시 시도할 때 같은 사건을 쓴다
  const [caseId, setCaseId] = useState<string | null>(null);
  const [serverParticipants, setServerParticipants] = useState<string[]>([]);

  // 서버와 같은 파서(lib/parse-kakao.ts)로 참여자를 뽑아야 "나" 확인이 어긋나지 않는다
  const participants = useMemo(() => {
    const names = new Set<string>();
    for (const file of kakaoFiles) {
      for (const name of parseKakao(file.text).participants) names.add(name);
    }
    if (paste.trim()) {
      for (const name of parseKakao(paste).participants) names.add(name);
    }
    for (const name of serverParticipants) names.add(name);
    return [...names];
  }, [kakaoFiles, paste, serverParticipants]);

  const messageCount = useMemo(
    () => kakaoFiles.reduce((sum, file) => sum + parseKakao(file.text).messages.length, 0),
    [kakaoFiles],
  );

  function onImages(list: FileList | null) {
    setFileError(null);
    const files = [...(list ?? [])].filter((file) => file.type.startsWith("image/"));
    const tooBig = files.filter((file) => file.size > MAX_IMAGE_BYTES);
    if (tooBig.length > 0) {
      setFileError(
        `${tooBig.map((file) => file.name).join(", ")}: 이미지는 3MB 이하로 올려 주세요. 캡처 범위를 줄이거나 압축해 주세요.`,
      );
    }
    const ok = files.filter((file) => file.size <= MAX_IMAGE_BYTES);
    setImages((current) => [...current, ...ok.filter((file) => !current.some((c) => c.name === file.name))]);
  }

  async function onKakaoFiles(list: FileList | null) {
    setFileError(null);
    if (!list?.length) return;
    const next: { name: string; text: string }[] = [];
    for (const file of list) {
      const text = await file.text();
      if (!text.trim()) {
        setFileError(`${file.name} 파일이 비어 있어요. 채팅방에서 내보낸 텍스트를 올려 주세요.`);
        return;
      }
      // 카톡 형식이 아닌 txt(메모 등)도 일반 텍스트 자료로 받는다
      next.push({ name: file.name, text });
    }
    setKakaoFiles((current) => [...current, ...next.filter((file) => !current.some((c) => c.name === file.name))]);
    setServerParticipants([]);
    setMe("");
  }

  async function submit() {
    setSubmitError(null);
    if (!title.trim()) {
      setSubmitError("사건 제목을 입력해 주세요.");
      return;
    }
    if (!kakaoFiles.length && !images.length && !paste.trim()) {
      setSubmitError("대화 파일, 이미지, 붙여넣은 텍스트 중 하나 이상 넣어 주세요.");
      return;
    }
    if (participants.length > 0 && !me) {
      setSubmitError("이 중 나는 누구인지 선택해 주세요.");
      return;
    }

    try {
      let id = caseId;
      if (!id) {
        setStep("case");
        const created = await fetch("/api/cases", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ title: title.trim(), myName: me || null }),
        });
        const createdBody = await readError(created);
        if (!created.ok || !createdBody.id) {
          setSubmitError(createdBody.error ?? "사건을 만들지 못했어요.");
          setStep("idle");
          return;
        }
        id = createdBody.id;
        setCaseId(id);
      }

      setStep("sources");
      const sources = await fetch(`/api/cases/${id}/sources`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          myName: me || null,
          paste,
          files: [
            ...kakaoFiles.map((file) => ({ name: file.name, kind: "kakao", text: file.text })),
            ...(await Promise.all(images.map(toUploadFile))),
          ],
        }),
      });
      const sourcesBody = await readError(sources);
      if (!sources.ok) {
        setSubmitError(sourcesBody.error ?? "자료를 올리지 못했어요.");
        if (sourcesBody.participants?.length) {
          // "나"가 없거나 틀리면 서버가 실제 참여자 목록을 돌려준다 → 다시 고르게 한다
          setServerParticipants(sourcesBody.participants);
          setMe("");
        }
        setStep("idle");
        return;
      }

      setStep("analyze");
      const analyzed = await fetch(`/api/cases/${id}/analyze`, { method: "POST" });
      const analyzedBody = await readError(analyzed);
      if (!analyzed.ok) {
        setSubmitError(analyzedBody.error ?? "분석을 시작하지 못했어요.");
        setStep("idle");
        return;
      }
      router.push(`/cases/${id}`);
    } catch {
      setSubmitError("서버에 연결하지 못했어요. 입력한 내용은 그대로 둘게요.");
      setStep("idle");
    }
  }

  const busy = step !== "idle";
  const current = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
  const checklist = [
    { done: title.trim().length > 0, label: "사건 제목" },
    { done: kakaoFiles.length > 0 || paste.trim().length > 0, label: "대화 자료" },
    { done: images.length > 0, label: "이체 내역·영수증 (선택)" },
    { done: participants.length === 0 || me !== "", label: "나 선택" },
  ];

  return (
    <main className="mx-auto flex w-full max-w-5xl flex-1 flex-col gap-6 px-4 py-8 sm:px-8">
      <div>
        <Link href="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
          <ArrowLeft className="size-4" aria-hidden />
          첫 화면
        </Link>
        <h1 className="mt-3 text-2xl font-bold tracking-tight sm:text-3xl">사건 업로드 & 분석</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground sm:text-base">
          채팅 대화와 이체 내역을 올리면 AI가 타임라인·정산표·쟁점으로 정리해 드려요.
        </p>
        <p className="mt-3 flex items-start gap-2 rounded-lg bg-secondary px-3 py-2 text-sm text-secondary-foreground">
          <Lock className="mt-0.5 size-4 shrink-0" aria-hidden />
          실제 개인정보는 자동으로 가려지지만, 체험 시에는 샘플 데이터를 권장해요.
        </p>
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex flex-col gap-4">
          <Section index={1} title="사건 정보" description="나중에 알아보기 쉬운 이름이면 돼요.">
            <Input
              id="title"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="예: 카페 로고 디자인 잔금"
              className="h-11"
              aria-label="사건 제목"
            />
          </Section>

          <Section
            index={2}
            title="대화 자료"
            description="채팅방의 '대화 내보내기'로 저장한 txt 파일을 올려 주세요. 여러 개도 괜찮아요."
          >
            <DropZone
              id="kakao"
              icon={UploadCloud}
              title="txt 파일을 끌어다 놓거나 눌러서 선택"
              hint="모바일·PC 내보내기 형식 모두 읽어요"
              accept=".txt,text/plain"
              onFiles={(files) => void onKakaoFiles(files)}
            />
            {kakaoFiles.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1.5">
                {kakaoFiles.map((file) => (
                  <FileChip
                    key={file.name}
                    icon={FileText}
                    name={file.name}
                    meta={`메시지 ${parseKakao(file.text).messages.length}개`}
                    onRemove={() => {
                      setKakaoFiles((list) => list.filter((f) => f.name !== file.name));
                      setMe("");
                    }}
                  />
                ))}
              </ul>
            ) : null}
            <button
              type="button"
              onClick={() => setShowPaste((v) => !v)}
              className="mt-3 inline-flex items-center gap-1.5 text-sm font-medium text-brand-strong hover:underline"
            >
              <MessageSquareText className="size-4" aria-hidden />
              {showPaste || paste ? "텍스트 붙여넣기 닫기" : "파일 대신 텍스트로 붙여넣기"}
            </button>
            {showPaste || paste ? (
              <Textarea
                id="paste"
                value={paste}
                onChange={(event) => setPaste(event.target.value)}
                placeholder="채팅 대화를 붙여 넣어요."
                className="mt-2 min-h-32"
              />
            ) : null}
          </Section>

          <Section
            index={3}
            title="이체 내역·영수증 이미지"
            description="입금이 '확인됨'으로 정리되려면 이체 내역이 필요해요. 실제 계좌·이름이 있으면 가린 뒤 올려 주세요."
            optional
          >
            <DropZone
              id="images"
              icon={ImageIcon}
              title="이미지를 끌어다 놓거나 눌러서 선택"
              hint="PNG·JPG, 한 장에 3MB 이하"
              accept="image/*"
              onFiles={onImages}
            />
            {images.length > 0 ? (
              <ul className="mt-3 flex flex-col gap-1.5">
                {images.map((file) => (
                  <FileChip
                    key={file.name}
                    icon={ImageIcon}
                    name={file.name}
                    meta={sizeLabel(file.size)}
                    onRemove={() => setImages((list) => list.filter((f) => f.name !== file.name))}
                  />
                ))}
              </ul>
            ) : null}
          </Section>

          <Section
            index={4}
            title="이 중 나는 누구인가요?"
            description="고른 사람은 '나', 나머지는 '상대방'으로 바꿔서 분석해요."
          >
            {participants.length === 0 ? (
              <p className="rounded-lg bg-muted/60 px-3 py-3 text-sm text-muted-foreground">
                대화 파일을 올리면 참여자 이름이 여기 나타나요.
              </p>
            ) : (
              <div className="grid gap-2 sm:grid-cols-2" role="radiogroup" aria-label="나는 누구인가요">
                {participants.map((name) => {
                  const selected = me === name;
                  return (
                    <button
                      key={name}
                      type="button"
                      role="radio"
                      aria-checked={selected}
                      onClick={() => setMe(name)}
                      className={`flex items-center gap-3 rounded-xl px-3 py-3 text-left text-sm ring-1 transition-colors ${
                        selected ? "bg-secondary ring-2 ring-brand" : "bg-card ring-foreground/10 hover:bg-muted/60"
                      }`}
                    >
                      <span
                        className={`flex size-8 items-center justify-center rounded-full ${
                          selected ? "bg-brand text-white" : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {selected ? <Check className="size-4" aria-hidden /> : <UserRound className="size-4" aria-hidden />}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-medium">{name}</span>
                        <span className="text-xs text-muted-foreground">
                          {selected ? "나" : me ? "상대방" : "눌러서 '나'로 선택"}
                        </span>
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </Section>
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-20 lg:self-start">
          <section className="rounded-2xl bg-card p-5 ring-1 ring-foreground/10">
            <h2 className="font-semibold">준비한 자료</h2>
            <ul className="mt-3 flex flex-col gap-2 text-sm">
              {checklist.map((item) => (
                <li key={item.label} className="flex items-center gap-2">
                  <CircleCheck className={`size-4 ${item.done ? "text-brand" : "text-border"}`} aria-hidden />
                  <span className={item.done ? "" : "text-muted-foreground"}>{item.label}</span>
                </li>
              ))}
            </ul>
            {kakaoFiles.length || images.length ? (
              <p className="mt-3 rounded-lg bg-muted/60 px-3 py-2 text-xs text-muted-foreground">
                대화 {kakaoFiles.length}개(메시지 {messageCount}개) · 이미지 {images.length}장
              </p>
            ) : null}

            {busy ? (
              <ol className="mt-4 flex flex-col gap-2 border-t pt-4 text-sm" aria-live="polite">
                {STEP_ORDER.map((key, index) => {
                  const state = index < current ? "done" : index === current ? "now" : "wait";
                  return (
                    <li key={key} className="flex items-center gap-2">
                      <span
                        className={`flex size-5 items-center justify-center rounded-full text-[11px] font-semibold ${
                          state === "done"
                            ? "bg-brand text-white"
                            : state === "now"
                              ? "bg-secondary text-secondary-foreground"
                              : "bg-muted text-muted-foreground"
                        }`}
                      >
                        {state === "done" ? (
                          <Check className="size-3" aria-hidden />
                        ) : state === "now" ? (
                          <LoaderCircle className="size-3 animate-spin" aria-hidden />
                        ) : (
                          index + 1
                        )}
                      </span>
                      <span className={state === "wait" ? "text-muted-foreground" : "font-medium"}>{STEP_LABEL[key]}</span>
                    </li>
                  );
                })}
              </ol>
            ) : null}

            {fileError ? (
              <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {fileError}
              </p>
            ) : null}
            {submitError ? (
              <p className="mt-4 rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
                {submitError}
              </p>
            ) : null}

            <Button type="button" size="lg" className="mt-4 h-11 w-full" disabled={busy} onClick={() => void submit()}>
              {busy ? <LoaderCircle className="size-4 animate-spin" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
              {busy ? "분석하는 중이에요" : "분석 시작"}
            </Button>
            <p className="mt-2 text-center text-xs text-muted-foreground">분석에는 보통 1~2분 걸려요.</p>
          </section>

          <section className="rounded-2xl bg-muted/50 p-4 text-xs leading-5 text-muted-foreground">
            <p className="flex items-center gap-1.5 font-medium text-foreground">
              <Lock className="size-3.5" aria-hidden />
              개인정보 보호
            </p>
            <ul className="mt-2 flex list-disc flex-col gap-1 pl-4">
              <li>전화번호·계좌번호·주민번호·이메일은 저장 전에 자동으로 가려요.</li>
              <li>참여자 실명은 &apos;나&apos;·&apos;상대방&apos;으로 바꿔요.</li>
              <li>AI는 판결하지 않고, 근거만 정리해요.</li>
            </ul>
          </section>
        </aside>
      </div>
    </main>
  );
}
