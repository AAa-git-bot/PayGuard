"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { readKakao } from "@/components/read-kakao";
import { toUploadFile } from "@/components/file-payload";

type Step = "idle" | "case" | "sources" | "analyze";

const STEP_LABEL: Record<Exclude<Step, "idle">, string> = {
  case: "사건 만들기",
  sources: "자료 올리기",
  analyze: "분석하기",
};

const STEP_ORDER = ["case", "sources", "analyze"] as const;

async function readError(response: Response) {
  const body = (await response.json().catch(() => ({}))) as { error?: string; id?: string };
  return body;
}

export default function NewCasePage() {
  const router = useRouter();
  const [title, setTitle] = useState("");
  const [paste, setPaste] = useState("");
  const [kakaoFiles, setKakaoFiles] = useState<{ name: string; text: string }[]>([]);
  const [images, setImages] = useState<File[]>([]);
  const [me, setMe] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [step, setStep] = useState<Step>("idle");

  const participants = useMemo(() => {
    const names = new Set<string>();
    for (const file of kakaoFiles) {
      for (const name of readKakao(file.text).participants) names.add(name);
    }
    if (paste.trim()) {
      for (const name of readKakao(paste).participants) names.add(name);
    }
    return [...names];
  }, [kakaoFiles, paste]);

  async function onKakaoFiles(list: FileList | null) {
    setFileError(null);
    if (!list?.length) return;
    const next: { name: string; text: string }[] = [];
    for (const file of list) {
      const text = await file.text();
      if (!text.trim()) {
        setFileError(`${file.name} 파일이 비어 있어요. 카톡에서 내보낸 텍스트를 올려 주세요.`);
        return;
      }
      if (readKakao(text).lines.length === 0) {
        setFileError(`${file.name}에서 대화 내용을 찾지 못했어요. PC·모바일 내보내기 형식인지 확인해 주세요.`);
        return;
      }
      next.push({ name: file.name, text });
    }
    setKakaoFiles(next);
    setMe("");
  }

  async function submit() {
    setSubmitError(null);
    if (!title.trim()) {
      setSubmitError("사건 제목을 입력해 주세요.");
      return;
    }
    if (participants.length > 0 && !me) {
      setSubmitError("이 중 나는 누구인지 선택해 주세요.");
      return;
    }

    try {
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

      setStep("sources");
      const sources = await fetch(`/api/cases/${createdBody.id}/sources`, {
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
        setStep("idle");
        return;
      }

      setStep("analyze");
      const analyzed = await fetch(`/api/cases/${createdBody.id}/analyze`, { method: "POST" });
      const analyzedBody = await readError(analyzed);
      if (!analyzed.ok) {
        setSubmitError(analyzedBody.error ?? "분석을 시작하지 못했어요.");
        setStep("idle");
        return;
      }
      router.push(`/cases/${createdBody.id}`);
    } catch {
      setSubmitError("서버에 연결하지 못했어요. 입력한 내용은 그대로 둘게요.");
      setStep("idle");
    }
  }

  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col gap-5 px-4 py-6 sm:px-8">
      <div>
        <h1 className="text-2xl font-semibold">자료 업로드</h1>
        <p className="mt-2 text-sm leading-6 text-muted-foreground">
          실제 개인정보는 자동으로 가려지지만, 체험 시에는 샘플 데이터를 권장해요.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="title">사건 제목</Label>
        <Input id="title" value={title} onChange={(event) => setTitle(event.target.value)} placeholder="로고 디자인 잔금" />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="kakao">카톡 txt (여러 개)</Label>
        <Input
          id="kakao"
          type="file"
          accept=".txt,text/plain"
          multiple
          onChange={(event) => void onKakaoFiles(event.target.files)}
        />
        {kakaoFiles.length > 0 ? (
          <p className="text-xs text-muted-foreground">{kakaoFiles.map((file) => file.name).join(", ")}</p>
        ) : null}
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="images">이미지 (이체 내역·영수증)</Label>
        <Input
          id="images"
          type="file"
          accept="image/*"
          multiple
          onChange={(event) => setImages([...(event.target.files ?? [])])}
        />
        {images.length > 0 ? (
          <p className="text-xs text-muted-foreground">{images.map((file) => file.name).join(", ")}</p>
        ) : null}
        <p className="text-xs text-muted-foreground">
          이 이미지에 실제 계좌·이름이 있으면 가린 뒤 올려주세요.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="paste">텍스트 붙여넣기</Label>
        <Textarea id="paste" value={paste} onChange={(event) => setPaste(event.target.value)} placeholder="카톡 대화를 붙여 넣어요." />
      </div>

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-medium">이 중 나는 누구인가요?</legend>
        {participants.length === 0 ? (
          <p className="text-sm text-muted-foreground">txt를 올리면 참여자 이름이 여기 나타나요.</p>
        ) : (
          participants.map((name) => (
            <label key={name} className="flex items-center gap-2 text-sm">
              <input type="radio" name="me" value={name} checked={me === name} onChange={() => setMe(name)} />
              {name}
            </label>
          ))
        )}
      </fieldset>

      {fileError ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {fileError}
        </p>
      ) : null}
      {submitError ? (
        <p className="rounded-lg bg-destructive/10 px-3 py-2 text-sm text-destructive" role="alert">
          {submitError}
        </p>
      ) : null}
      {step !== "idle" ? (
        <ol className="flex flex-col gap-1 rounded-lg bg-muted/60 p-3 text-sm" aria-live="polite">
          {STEP_ORDER.map((key, index) => {
            const current = STEP_ORDER.indexOf(step as (typeof STEP_ORDER)[number]);
            const state = index < current ? "완료" : index === current ? "진행 중" : "대기";
            return (
              <li key={key} className={index === current ? "font-medium" : "text-muted-foreground"}>
                {index + 1}. {STEP_LABEL[key]} · {state}
              </li>
            );
          })}
        </ol>
      ) : null}

      <Button type="button" className="w-full sm:w-fit" disabled={step !== "idle"} onClick={() => void submit()}>
        {step === "idle" ? "분석 시작" : "처리하는 중"}
      </Button>
    </main>
  );
}
