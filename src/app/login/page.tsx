import { unstable_noStore as noStore } from "next/cache"
import { redirect } from "next/navigation"
import Image from "next/image"
import { env } from "@mito/env"
import { getPageSession } from "@/trpc/pageSession"
import { LoginForm } from "./_components/LoginForm"

export default async function Home({
  searchParams,
}: {
  searchParams: { error?: string }
}) {
  noStore()
  const session = await getPageSession()
  if (session?.user.name) {
    redirect("/dashboard")
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg bg-neutral-100 p-4">
        <Image src="/deutsche.png" alt="business-logo" width={24} height={24} />
        <p className="max-w-md text-center text-2xl">
          {
            "Dashboard è riservata agli utenti registrati. Accedi per continuare."
          }
        </p>
        {/* A refused or failed login, without why (spec auth-better-auth, AC13) */}
        {searchParams.error && (
          <p role="alert" className="text-sm text-red-600">
            {"Accesso non riuscito"}
          </p>
        )}
        <LoginForm testLogin={env.AUTH_TEST_LOGIN === "true"} />
      </div>
    </main>
  )
}
