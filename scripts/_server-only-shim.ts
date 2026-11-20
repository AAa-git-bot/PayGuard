// 담당: 민수빈 | 스크립트 전용: "server-only" 패키지는 Next 서버 밖에서 import하면 에러를 던진다.
// tsx로 lib/agent/*를 직접 실행할 때만 빈 모듈로 바꿔치기한다. 앱 코드에서는 import하지 않는다.
import Module, { createRequire } from "node:module";
import path from "node:path";
import { pathToFileURL } from "node:url";

type ResolveHook = (
  specifier: string,
  context: unknown,
  next: (specifier: string, context: unknown) => unknown,
) => unknown;
const mod = Module as unknown as {
  registerHooks?: (hooks: { resolve: ResolveHook }) => void;
  _load: (request: string, ...rest: unknown[]) => unknown;
};

// server-only 패키지 안의 빈 파일 (react-server 조건에서 쓰이는 것과 같음)
const EMPTY_URL = pathToFileURL(
  path.join(path.dirname(createRequire(__filename).resolve("server-only")), "empty.js"),
).href;

if (typeof mod.registerHooks === "function") {
  // Node 22.15+/23.5+: require·import 모두에 적용
  mod.registerHooks({
    resolve(specifier, context, next) {
      if (specifier === "server-only") return { url: EMPTY_URL, shortCircuit: true };
      return next(specifier, context);
    },
  });
} else {
  const original = mod._load;
  mod._load = function (request: string, ...rest: unknown[]) {
    if (request === "server-only") return {};
    return original.call(this, request, ...rest);
  };
}
