import { Navigate, useSearchParams } from "react-router"
import { env } from "@/env"
import { authClient } from "@/lib/authClient"
import { AppLoading } from "@/routes/AppLoading"
import { LoginForm } from "./LoginForm"

/**
 * The login, as `src/app/login` of the Next.js app: with a session it goes
 * to the dashboard; `?error` is the login the server refused or that failed
 * (spec auth-better-auth, AC13), without why. Where each login ends the
 * server decides (D15), first access included. Split in two: the brand on
 * the left, from 1024 px, and the form on the right
 */
export function Component() {
  const { data: session, isPending } = authClient.useSession()
  const [searchParams] = useSearchParams()

  if (isPending) return <AppLoading />
  if (session) return <Navigate to="/dashboard" replace />

  const testLogin = env.VITE_AUTH_TEST_LOGIN === "true"

  return (
    <main className="grid min-h-screen bg-card lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
      <aside className="relative hidden overflow-hidden lg:block">
        <img
          src="/login-art.svg"
          alt=""
          className="absolute inset-0 size-full object-cover"
        />
        <div className="relative flex h-full flex-col justify-between p-10 text-primary-foreground">
          <Brand />
          <p className="max-w-xs text-2xl">
            Clienti, pratiche e chiamate in un unico posto.
          </p>
        </div>
      </aside>

      <section className="flex items-center justify-center px-4 py-12">
        <div className="flex w-full max-w-sm flex-col gap-8">
          <div className="lg:hidden">
            <Brand />
          </div>
          <header className="flex flex-col gap-2 text-center">
            <h1 className="text-2xl">Accedi a Mito</h1>
            <p className="text-sm text-muted-foreground">
              La dashboard è riservata agli utenti registrati.
            </p>
          </header>
          {searchParams.has("error") ? (
            <p
              role="alert"
              className="text-destructive-text text-center text-sm"
            >
              Accesso non riuscito
            </p>
          ) : null}
          <LoginForm
            testLogin={testLogin}
            // Only on `vite dev`: the backend opens it only in local (devLogin)
            devLogin={testLogin && import.meta.env.DEV}
          />
        </div>
      </section>
    </main>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      {/* On a card: the blue logo disappears on the dark art */}
      <span className="rounded-control bg-card p-1">
        <img src="/deutsche.png" alt="" width={24} height={24} />
      </span>
      <span className="font-heading text-xl">Mito SRL</span>
    </div>
  )
}
