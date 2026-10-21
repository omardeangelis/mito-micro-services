import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"

export type SearchParams = Record<string, string | string[] | undefined>

export type ServerPageDefaultProps = {
  params: Promise<{ slug: string }>
  searchParams?: Promise<SearchParams>
}

export type ServerPageProps<T> = {
  params: Promise<T>
  searchParams?: Promise<SearchParams>
}

export type DefaultLayoutProps<T> = {
  children: React.ReactNode
  params: Promise<T>
}

// const searchValue = ["asc", "desc"] as const;

export type SortedBy = "asc" | "desc"

export type Nullable<T> = T | null

export type NullableAllObjectKeys<T> = {
  [K in keyof T]: Nullable<T[K]>
}

export type SupaBaseDb = PostgresJsDatabase<
  // eslint-disable-next-line @typescript-eslint/consistent-type-imports
  typeof import("@/server/db/schema/index")
>
