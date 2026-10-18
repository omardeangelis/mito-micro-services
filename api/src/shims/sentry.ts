// What the backend bundle loads in place of @sentry/nextjs (api/build.mjs).
// Outside Next.js that package lacks the Node APIs the server code uses, like
// trpcMiddleware; @sentry/node is the one it builds on, at the same version
export * from "@sentry/node"
