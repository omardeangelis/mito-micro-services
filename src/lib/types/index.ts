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

export type Nullable<T> = T | null

export type NullableAllObjectKeys<T> = {
  [K in keyof T]: Nullable<T[K]>
}

export type { SupaBaseDb } from "@mito/db/types"
