import { unstable_noStore as noStore } from "next/cache"
import Link from "next/link"
import { redirect } from "next/navigation"
import Image from "next/image"
import { getServerAuthSession } from "@/server/auth"
import { Button } from "@/components/ui/button"

export default async function Home() {
  noStore()
  const session = await getServerAuthSession()
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
        <Link
          href={"/api/auth/signin"}
          className="rounded-full px-10 py-3 font-semibold no-underline transition"
        >
          <Button>{"Accedi"}</Button>
        </Link>
      </div>
    </main>
  )
}
