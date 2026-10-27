import { Navigate, useSearchParams } from "react-router"
import { env } from "@/env"
import { authClient } from "@/lib/authClient"
import { AppLoading } from "@/routes/AppLoading"
import { LoginForm } from "./LoginForm"

/**
 * The login, as `src/app/login` of the Next.js app: with a session it goes
 * to the dashboard; `?error` is the login the server refused or that failed
 * (spec auth-better-auth, AC13), without why. Where each login ends the
 * server decides (D15), first access included
 */
export function Component() {
  const { data: session, isPending } = authClient.useSession()
  const [searchParams] = useSearchParams()

  if (isPending) return <AppLoading />
  if (session) return <Navigate to="/dashboard" replace />

  return (
    <main className="flex min-h-screen flex-col items-center justify-center">
      <div className="flex flex-col items-center justify-center gap-4 rounded-lg bg-neutral-100 p-4">
        <img src="/deutsche.png" alt="business-logo" width={24} height={24} />
        <p className="max-w-md text-center text-2xl">
          Dashboard è riservata agli utenti registrati. Accedi per continuare.
        </p>
        {searchParams.has("error") ? (
          <p role="alert" className="text-sm text-red-600">
            Accesso non riuscito
          </p>
        ) : null}
        <LoginForm testLogin={env.VITE_AUTH_TEST_LOGIN === "true"} />
      </div>
    </main>
  )
}
