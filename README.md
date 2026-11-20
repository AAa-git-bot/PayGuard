# PayGuard

청년 프리랜서와 의뢰인의 채팅방에 AI가 참여해 계약 조건을 기록하고, 분쟁이 생기면 흩어진 증거로 타임라인·정산표·쟁점 카드를 만들어 주는 AI 에이전트.
(2026 대한민국 청년 CAREER FAIR AI 해커톤)

- 설계 기준 문서: [PRD.md](./PRD.md)
- AI 활용 기록: [docs/ai-log.md](./docs/ai-log.md)

## 처음 세팅 (팀원용)

1. 이 저장소를 GitHub Desktop으로 Clone
2. 폴더에서 터미널을 열고 `npm install`
3. `.env.example`을 복사해 `.env.local`을 만들고 값 채우기 (값은 수빈에게 개인 메시지로 받기, 절대 커밋 금지)
4. `npm run dev` → http://localhost:3000

## 담당

| 이름 | 역할 | 폴더 |
| --- | --- | --- |
| 민수빈 | PM · AI 에이전트 | `lib/types.ts`, `lib/agent/*`, `lib/settlement.ts`, `lib/diff.ts` |
| 이다은 | 리서치 · 백엔드 | `app/api/*`, `lib/db.ts`, `lib/mask.ts`, `lib/parse-kakao.ts`, `supabase/` |
| 최서은 | 리서치 · 프론트엔드 | `app/**/page.tsx`, `components/`, `data/sample/` |

## Credits / Licenses

| 이름 | 라이선스 | 링크 | 용도 |
| --- | --- | --- | --- |
| Next.js | MIT | https://github.com/vercel/next.js | 웹 프레임워크 |
| Vercel AI SDK | Apache-2.0 | https://github.com/vercel/ai | LLM 호출 |
| shadcn/ui | MIT | https://github.com/shadcn-ui/ui | UI 컴포넌트 |
| Supabase JS | MIT | https://github.com/supabase/supabase-js | DB·실시간 |
| Zod | MIT | https://github.com/colinhacks/zod | 스키마 검증 |
| Claude Haiku 5.5 (Anthropic API) | 이용약관 | https://www.anthropic.com/legal | 서비스 AI 모델 |

(라이선스는 제출 전 각 저장소에서 다시 확인)
