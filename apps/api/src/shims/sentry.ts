// What the backend bundle loads in place of @sentry/nextjs (apps/api/build.mjs).
// Outside Next.js that package lacks the Node APIs the server code uses, like
// trpcMiddleware; @sentry/node is the one it builds on. package.json pins it at
// the version @sentry/nextjs depends on, so both reach the client of
// instrument.ts
export * from "@sentry/node"
