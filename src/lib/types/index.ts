import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export type ServerPageDefaultProps = {
  params: { slug: string }
  searchParams?: Record<string, string | string[] | undefined>
}

export type ServerPageProps<T> = {
  params: T
  searchParams?: Record<string, string | string[] | undefined>
}

export type DefaultLayoutProps<T> = {
  children: React.ReactNode
  params: T
}

// const searchValue = ["asc", "desc"] as const;

export type SortedBy = "asc" | "desc"

export type SearchBy<T> = keyof T

export type Nullable<T> = T | null

export type NullableAllObjectKeys<T> = {
  [K in keyof T]: Nullable<T[K]>
}

export type SupaBaseDb = PostgresJsDatabase<
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  typeof import("@/server/db/schema/index")
>
