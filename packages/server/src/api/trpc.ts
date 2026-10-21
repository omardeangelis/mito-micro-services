/**
 * YOU PROBABLY DON'T NEED TO EDIT THIS FILE, UNLESS:
 * 1. You want to modify request context (see Part 1).
 * 2. You want to create a new middleware or type of procedure (see Part 3).
 *
 * TL;DR - This is where all the tRPC server stuff is created and plugged in. The pieces you will
 * need to use are documented accordingly near the end.
 */

import * as Sentry from "@sentry/nextjs"
import { initTRPC, TRPCError } from "@trpc/server"
import superjson from "superjson"
import { ZodError } from "zod"

import { getServerAuthSession } from "../auth"
import { db } from "@mito/db"
import { driverError } from "@mito/db/driverError"
import { operators } from "@mito/db/schema/operators"
import { eq } from "drizzle-orm"
import { users } from "@mito/db/schema/users"
import { operatorSelectCompleteResponse } from "@mito/domain/constants/schema"
import { supabaseClient } from "../client/supabase"
import { contactErrorFromCause } from "@mito/domain/contact/errors"

/**
 * 1. CONTEXT
 *
 * This section defines the "contexts" that are available in the backend API.
 *
 * These allow you to access things when processing a request, like the database, the session, etc.
 *
 * This helper generates the "internals" for a tRPC context. The API handler and RSC clients each
 * wrap this and provides the required context.
 *
 * @see https://trpc.io/docs/server/context
 */
export const createTRPCContext = async (opts: { headers: Headers }) => {
  const session = await getServerAuthSession()

  return {
    db,
    supabaseClient,
    session,
    ...opts,
  }
}

/**
 * 2. INITIALIZATION
 *
 * This is where the tRPC API is initialized, connecting the context and transformer. We also parse
 * ZodErrors so that you get typesafety on the frontend if your procedure fails due to validation
 * errors on the backend.
 */
const t = initTRPC.context<typeof createTRPCContext>().create({
  transformer: superjson,
  errorFormatter({ shape, error }) {
    return {
      ...shape,
      data: {
        ...shape.data,
        zodError:
          error.cause instanceof ZodError ? error.cause.flatten() : null,
        // A new plain object, never the cause: superjson drops an Error's fields
        contactError: contactErrorFromCause(error.cause),
      },
    }
  },
})

/**
 * 3. ROUTER & PROCEDURE (THE IMPORTANT BIT)
 *
 * These are the pieces you use to build your tRPC API. You should import these a lot in the
 * "/src/server/api/routers" directory.
 */

/**
 * This is how you create new routers and sub-routers in your tRPC API.
 *
 * @see https://trpc.io/docs/router
 */
export const createTRPCRouter = t.router

/**
 * Traces every procedure call and reports its failure to Sentry, for calls over HTTP and from
 * React Server Components alike. Client errors (UNAUTHORIZED, BAD_REQUEST, …) are dropped by
 * `dropExpectedTrpcErrors`, so only server faults become Sentry issues.
 */
const sentryMiddleware = t.middleware(Sentry.trpcMiddleware())

/**
 * A procedure that fails on a query fails with the database driver's error, as
 * before Drizzle 0.45: the message of the DrizzleQueryError around it holds
 * the SQL and its parameters, which must reach neither the response nor
 * Sentry. It sits inside `sentryMiddleware`, so Sentry gets the error it
 * returns. A TRPCError a procedure built with its own message stays as it is.
 */
const driverErrorMiddleware = t.middleware(async ({ next }) => {
  const result = await next()
  if (result.ok) return result
  const cause = driverError(result.error.cause)
  if (cause === result.error.cause || !(cause instanceof Error)) return result
  if (result.error.message !== result.error.cause?.message) return result
  return {
    ...result,
    error: new TRPCError({
      code: result.error.code,
      message: cause.message,
      cause,
    }),
  }
})

/**
 * Public (unauthenticated) procedure
 *
 * This is the base piece you use to build new queries and mutations on your tRPC API. It does not
 * guarantee that a user querying is authorized, but you can still access user session data if they
 * are logged in.
 */
export const publicProcedure = t.procedure
  .use(sentryMiddleware)
  .use(driverErrorMiddleware)

/**
 * Protected (authenticated) procedure
 *
 * If you want a query or mutation to ONLY be accessible to logged in users, use this. It verifies
 * the session is valid and guarantees `ctx.session.user` is not null.
 *
 * @see https://trpc.io/docs/procedures
 */
export const protectedProcedure = publicProcedure.use(async ({ ctx, next }) => {
  if (!ctx.session || !ctx.session.user) {
    throw new TRPCError({ code: "UNAUTHORIZED" })
  }
  return next({
    ctx: {
      // infers the `session` as non-nullable
      session: { ...ctx.session, user: ctx.session.user },
    },
  })
})

const enforceIsActiveOperator = t.middleware(async ({ ctx, next }) => {
  const user = ctx.session!.user
  const operator = await db
    .select({
      ...operatorSelectCompleteResponse,
      role: users.role,
    })
    .from(operators)
    .innerJoin(users, eq(operators.userId, users.id))
    .where(eq(operators.userId, user.id))

  if (!operator[0]) {
    throw new TRPCError({ code: "BAD_REQUEST" })
  }
  return next({
    ctx: {
      ...ctx,
      operator: operator[0],
    },
  })
})

export const operatorProcedure = protectedProcedure.use(enforceIsActiveOperator)

const enforceIsAdmin = t.middleware(async ({ ctx, next }) => {
  const user = ctx.session!.user
  const admin = await db
    .select({
      role: users.role,
    })
    .from(users)
    .where(eq(users.id, user.id))

  if (!admin[0] || admin[0].role !== "ADMIN") {
    throw new TRPCError({ code: "FORBIDDEN", message: "admin-only" })
  }
  return next()
})

export const adminProcedure = operatorProcedure.use(enforceIsAdmin)
