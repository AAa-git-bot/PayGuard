import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // 해커톤용: 캐시 컴포넌트를 끄고 단순한 동적 렌더링을 쓴다 (팀 합의 전 켜지 말 것)
  cacheComponents: false,
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
