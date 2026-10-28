import { cpSync, mkdirSync, rmSync, writeFileSync } from "node:fs"
import { resolve } from "node:path"

// The deploy of apps/web on Vercel (F10 of brain/chore/migrazione-frontend-react.md):
// the build of Vite as a prebuilt deployment (Build Output API v3), with the
// rewrites to the backend and the headers of next.config.js. The workflow
// writes it in .vercel/output and deploys it with `vercel deploy --prebuilt`:
// no setting of the Vercel project changes, and the origin of the backend is
// the one of the environment, as H19 asks

/** The headers of every response, as `headers()` of next.config.js */
export const SECURITY_HEADERS = {
  "X-Frame-Options": "DENY",
  "X-Content-Type-Options": "nosniff",
  "Referrer-Policy": "strict-origin-when-cross-origin",
  "Feature-Policy": "geolocation 'none'; microphone 'none'; camera 'none'",
  "X-Permitted-Cross-Domain-Policies": "none",
  "X-XSS-Protection": "1; mode=block",
  // The pages are never cached: a deploy changes the chunks they name
  "Cache-Control": "no-cache, no-store, must-revalidate",
} as const

/** The files of Vite have a hash in their name: they never change */
export const IMMUTABLE = "public, max-age=31536000, immutable"

/** The origin of the backend: https, without a path, as BACKEND_URL */
export const backendOriginOf = (value: string) => {
  if (!URL.canParse(value)) throw new Error(`Not a URL: ${value}`)
  const url = new URL(value)
  if (url.protocol !== "https:") {
    throw new Error(
      "The backend must be https: the session cookie travels to it"
    )
  }
  if (url.pathname !== "/" || url.search || url.hash) {
    throw new Error("The backend must be an origin, without a path")
  }
  return url.origin
}

/**
 * The routes of the deployment, in order: the headers; every /api to the
 * backend (HttpApi, better-auth, the REST routes of the export, tRPC while it
 * stays), so the cookie stays first-party; the files of the build; a 404
 * for a missing asset (a chunk of an older deploy: never index.html, cached
 * as immutable); any other path to index.html, where React Router reads it.
 * The headers go on the answers of the backend too, as in next.config.js
 */
export const vercelOutputConfig = (backendOrigin: string) => ({
  version: 3,
  routes: [
    { src: "/(.*)", headers: { ...SECURITY_HEADERS }, continue: true },
    {
      src: "/assets/(.*)",
      headers: { "Cache-Control": IMMUTABLE },
      continue: true,
    },
    { src: "/api/(.*)", dest: `${backendOriginOf(backendOrigin)}/api/$1` },
    { handle: "filesystem" },
    { src: "/assets/(.*)", status: 404 },
    { src: "/(.*)", dest: "/index.html" },
  ],
})

/** Writes the build in `dist` as the deployment in `out` */
export const writeVercelOutput = ({
  dist,
  out,
  backendOrigin,
}: {
  dist: string
  out: string
  backendOrigin: string
}) => {
  const config = vercelOutputConfig(backendOrigin)
  rmSync(out, { recursive: true, force: true })
  mkdirSync(out, { recursive: true })
  cpSync(dist, resolve(out, "static"), { recursive: true })
  writeFileSync(resolve(out, "config.json"), JSON.stringify(config, null, 2))
}

// `tsx apps/web/vercelOutput.ts <backend origin>`, from the root of the repo
if (process.argv[1] && resolve(process.argv[1]) === import.meta.filename) {
  const backendOrigin = process.argv[2]
  if (!backendOrigin) {
    throw new Error("Usage: tsx apps/web/vercelOutput.ts <backend origin>")
  }
  writeVercelOutput({
    dist: resolve(import.meta.dirname, "dist"),
    out: resolve(".vercel/output"),
    backendOrigin,
  })
}
