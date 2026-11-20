// 담당: 민수빈 | LLM 호출 래퍼 (PRD 7-2)
// 모든 LLM 호출은 이 파일의 callStructured()를 거친다.
// - AI SDK v7: generateObject는 폐기 예정 → generateText + Output.object 사용
// - 실패 시 1회 재시도, 그래도 실패하면 fallback 값을 돌려준다 (앱이 멈추면 안 됨)
// - 이 함수에 넘기는 텍스트는 반드시 lib/mask.ts를 거친 것이어야 한다 (PRD 1장 규칙 1)
import "server-only";
import { anthropic } from "@ai-sdk/anthropic";
import { generateText, Output } from "ai";
import type { z } from "zod";

const DEFAULT_MODEL = "claude-haiku-5-5";

export function getModel(modelOverride?: string) {
  // ANTHROPIC_API_KEY 환경변수는 @ai-sdk/anthropic이 자동으로 읽는다
  return anthropic(modelOverride ?? process.env.LLM_MODEL ?? DEFAULT_MODEL);
}

type ImageInput = { data: Uint8Array | string; mediaType: string };

export interface CallStructuredOptions<T> {
  schema: z.ZodType<T>;
  instructions: string; // 시스템 프롬프트 (lib/agent/prompts.ts)
  prompt: string; // 사용자 입력 (마스킹된 텍스트)
  images?: ImageInput[];
  model?: string; // 특정 단계만 다른 모델을 쓸 때 (예: claude-sonnet-5-5)
  fallback: T; // 두 번 실패하면 돌려줄 값
}

export async function callStructured<T>(
  opts: CallStructuredOptions<T>,
): Promise<{ ok: boolean; data: T; error?: string }> {
  let lastError = "";
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const content = opts.images?.length
        ? [
            { type: "text" as const, text: opts.prompt },
            ...opts.images.map((img) => ({
              type: "image" as const,
              image: img.data,
              mediaType: img.mediaType,
            })),
          ]
        : opts.prompt;

      const result = await generateText({
        model: getModel(opts.model),
        instructions: opts.instructions,
        messages: [{ role: "user", content }],
        output: Output.object({ schema: opts.schema }),
      });
      if (result.output !== undefined) {
        return { ok: true, data: result.output as T };
      }
      lastError = "빈 응답";
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
    }
  }
  console.error("[callStructured] 실패:", lastError);
  return { ok: false, data: opts.fallback, error: lastError };
}
