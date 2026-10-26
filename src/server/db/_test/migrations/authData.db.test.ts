import { beforeAll, describe, expect, it } from "vitest"
import { asc, eq } from "drizzle-orm"
import { authAccounts } from "@mito/db/schema/auth"
import { accounts, users } from "@mito/db/schema/users"
import {
  AUTH_TABLES_SCHEMA_TAG,
  migrateUpTo,
  testClient,
  testDb,
} from "@/test/db"

// The data migration of better-auth (spec auth-better-auth, T2) on a database
// already in use: migrated up to the tables, seeded with NextAuth's rows,
// then migrated to the end in one go, as the deploy runs it.

const base64url = (value: string) => Buffer.from(value).toString("base64url")

/** An Entra ID token as NextAuth saved it: only the payload matters. */
const idToken = (claims: Record<string, unknown>) =>
  [
    base64url(JSON.stringify({ alg: "RS256", typ: "JWT" })),
    base64url(JSON.stringify(claims)),
    "signature",
  ].join(".")

async function seedNextAuthRows() {
  await testClient.exec(`
    INSERT INTO "mito-deutsche_user" ("id", "email", "emailVerified", "email_confirmed") VALUES
      ('azure', 'Ada.Rossi@Dbmito.it', NULL, false),
      ('no-token', 'bruno@dbmito.it', NULL, false),
      ('malformed', 'carla@dbmito.it', NULL, false),
      ('no-oid', 'dario@dbmito.it', NULL, false),
      ('email-only', 'elena@x.it', now(), false),
      ('same-a', 'Franco@x.it', now(), false),
      ('same-b', 'franco@X.it', now(), false);
  `)
  await testDb.insert(accounts).values([
    {
      userId: "azure",
      type: "oauth",
      provider: "azure-ad",
      providerAccountId: "sub-of-ada",
      access_token: "access",
      refresh_token: "refresh",
      id_token: idToken({ sub: "sub-of-ada", oid: "oid-of-ada" }),
    },
    {
      userId: "no-token",
      type: "oauth",
      provider: "azure-ad",
      providerAccountId: "sub-of-bruno",
      id_token: null,
    },
    {
      userId: "malformed",
      type: "oauth",
      provider: "azure-ad",
      providerAccountId: "sub-of-carla",
      // Not base64url, and then not JSON: neither may stop the migration
      id_token: "header.%%%.signature",
    },
    {
      userId: "malformed",
      type: "oauth",
      provider: "azure-ad",
      providerAccountId: "sub-of-carla-2",
      id_token: `header.${base64url("not json")}.signature`,
    },
    {
      userId: "no-oid",
      type: "oauth",
      provider: "azure-ad",
      providerAccountId: "sub-of-dario",
      id_token: idToken({ sub: "sub-of-dario", oid: "  " }),
    },
    {
      userId: "email-only",
      type: "email",
      provider: "email",
      providerAccountId: "elena@x.it",
    },
  ])
}

beforeAll(async () => {
  await migrateUpTo(AUTH_TABLES_SCHEMA_TAG)
  await seedNextAuthRows()
  await migrateUpTo()
})

describe("migrazione auth_data", () => {
  it("copia l'account Azure con l'oid del suo id_token, senza token (AC2, AC31)", async () => {
    const rows = await testDb
      .select({
        userId: authAccounts.userId,
        providerId: authAccounts.providerId,
        accountId: authAccounts.accountId,
        accessToken: authAccounts.accessToken,
        refreshToken: authAccounts.refreshToken,
        idToken: authAccounts.idToken,
      })
      .from(authAccounts)
      .orderBy(asc(authAccounts.userId))

    expect(rows).toEqual([
      {
        userId: "azure",
        providerId: "microsoft",
        accountId: "oid-of-ada",
        accessToken: null,
        refreshToken: null,
        idToken: null,
      },
    ])
  })

  it("lascia gli account di NextAuth come sono, token compresi (D6)", async () => {
    const [ada] = await testDb
      .select({
        providerAccountId: accounts.providerAccountId,
        accessToken: accounts.access_token,
        refreshToken: accounts.refresh_token,
      })
      .from(accounts)
      .where(eq(accounts.userId, "azure"))
    expect(ada).toEqual({
      providerAccountId: "sub-of-ada",
      accessToken: "access",
      refreshToken: "refresh",
    })
    expect(await testDb.select().from(accounts)).toHaveLength(6)
  })

  it("conferma l'email di ogni utente di prima (D4)", async () => {
    const rows = await testDb
      .select({ confirmed: users.emailConfirmed })
      .from(users)
    expect(rows).toHaveLength(7)
    expect(rows.every((row) => row.confirmed)).toBe(true)
  })

  it("porta le email in minuscolo, tranne quelle che collidono (D7)", async () => {
    const rows = await testDb
      .select({ id: users.id, email: users.email })
      .from(users)
      .orderBy(asc(users.id))
    expect(rows).toEqual([
      { id: "azure", email: "ada.rossi@dbmito.it" },
      { id: "email-only", email: "elena@x.it" },
      { id: "malformed", email: "carla@dbmito.it" },
      { id: "no-oid", email: "dario@dbmito.it" },
      { id: "no-token", email: "bruno@dbmito.it" },
      { id: "same-a", email: "Franco@x.it" },
      { id: "same-b", email: "franco@X.it" },
    ])
  })

  it("non lascia la funzione di decodifica nel database", async () => {
    const result = await testClient.query(
      `SELECT count(*)::int AS n FROM pg_proc WHERE proname = 'mito_auth_jwt_oid'`
    )
    expect(result.rows).toEqual([{ n: 0 }])
  })
})
