import type { NextConfig } from "next";

/*
 * Two builds from one codebase:
 *   STATIC_EXPORT=1 → static files for GitHub Pages. The .ts API route is left out
 *                     (pageExtensions: tsx only) and the browser uses offline Jev.
 *   default         → server build (dev / Vercel) with /api/intent calling real Jev.
 */
export function makeConfig(env: Record<string, string | undefined>): NextConfig {
  if (env.STATIC_EXPORT !== "1") return { pageExtensions: ["tsx", "ts"] };
  const basePath = env.NEXT_PUBLIC_BASE_PATH ?? "";
  return {
    output: "export",
    pageExtensions: ["tsx"],
    basePath,
    trailingSlash: true,
    images: { unoptimized: true },
  };
}

export default makeConfig(process.env);
