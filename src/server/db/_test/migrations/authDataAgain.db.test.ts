import { beforeAll, describe, expect, it } from "vitest"
import { asc } from "drizzle-orm"
import { authAccounts } from "@mito/db/schema/auth"
import { accounts, users } from "@mito/db/schema/users"
import {
  BEFORE_AUTH_SWITCH_SCHEMA_TAG,
  migrateUpTo,
  testClient,
  testDb,
} from "@/test/db"

// The second copy of NextAuth's rows (spec auth-better-auth, D5, PR C2): the
// users and accounts NextAuth created after the first copy, next to those the
// first one already copied.

const base64url = (value: string) => Buffer.from(value).toString("base64url")

const idToken = (claims: Record<string, unknown>) =>
  [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(JSON.stringify(claims)),
    "signature",
  ].join(".")

beforeAll(async () => {
  await migrateUpTo(BEFORE_AUTH_SWITCH_SCHEMA_TAG)
  await testClient.exec(`
    INSERT INTO "mito-deutsche_user" ("id", "email", "email_confirmed") VALUES
      ('copied', 'ada@dbmito.it', true),
      ('newer', 'Bruno@Dbmito.it', false),
      ('broken', 'carla@dbmito.it', false);
  `)
  await testDb.insert(accounts).values([
    {
      userId: "copied",
      type: "oauth",
      provider: "azure-ad",
      providerAccountId: "sub-of-ada",
      id_token: idToken({ sub: "sub-of-ada", oid: "oid-of-ada" }),
    },
    {
      userId: "newer",
      type: "oauth",
      provider: "azure-ad",
      providerAccountId: "sub-of-bruno",
      refresh_token: "refresh",
      id_token: idToken({ sub: "sub-of-bruno", oid: "oid-of-bruno" }),
    },
    {
      userId: "broken",
      type: "oauth",
      provider: "azure-ad",
      providerAccountId: "sub-of-carla",
      id_token: "header.%%%.signature",
    },
  ])
  // What the first copy left
  await testDb.insert(authAccounts).values({
    id: "first-copy",
    userId: "copied",
    providerId: "microsoft",
    accountId: "oid-of-ada",
  })
  await migrateUpTo()
})

describe("migrazione auth_data_c2", () => {
  it("copia gli account Azure nati dopo la prima copia, senza doppioni né token (D5, AC31)", async () => {
    const rows = await testDb
      .select({
        id: authAccounts.id,
        userId: authAccounts.userId,
        accountId: authAccounts.accountId,
        refreshToken: authAccounts.refreshToken,
      })
      .from(authAccounts)
      .orderBy(asc(authAccounts.userId))
    expect(rows).toEqual([
      {
        id: "first-copy",
        userId: "copied",
        accountId: "oid-of-ada",
        refreshToken: null,
      },
      {
        id: expect.any(String),
        userId: "newer",
        accountId: "oid-of-bruno",
        refreshToken: null,
      },
    ])
  })

  it("conferma e porta in minuscolo l'email degli utenti nuovi (D4, D7)", async () => {
    const rows = await testDb
      .select({
        id: users.id,
        email: users.email,
        confirmed: users.emailConfirmed,
      })
      .from(users)
      .orderBy(asc(users.id))
    expect(rows).toEqual([
      { id: "broken", email: "carla@dbmito.it", confirmed: true },
      { id: "copied", email: "ada@dbmito.it", confirmed: true },
      { id: "newer", email: "bruno@dbmito.it", confirmed: true },
    ])
  })

  it("non lascia la funzione di decodifica nel database", async () => {
    const result = await testClient.query(
      `SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'mito_auth_jwt_oid'`
    )
    expect(result.rows).toEqual([{ n: 0 }])
  })
})
