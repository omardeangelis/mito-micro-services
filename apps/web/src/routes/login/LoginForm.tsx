import { useState, type FormEvent, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/authClient"

type DevAccount = "admin" | "operator"

/**
 * "Accedi con Microsoft"; with `testLogin` the email of the test login
 * (AUTH_TEST_LOGIN, spec auth-better-auth OQ6); with `devLogin` the quick
 * login of local development, as admin or operator on the two accounts of
 * the seed. Where each login ends the server decides (D15).
 */
export function LoginForm({
  testLogin,
  devLogin = false,
}: {
  testLogin: boolean
  devLogin?: boolean
}) {
  const [email, setEmail] = useState("")
  const [sent, setSent] = useState(false)
  const [failed, setFailed] = useState(false)

  const signInWithMicrosoft = async () => {
    setFailed(false)
    const { error } = await authClient.signIn.social({
      provider: "microsoft",
      callbackURL: "/dashboard",
    })
    if (error) setFailed(true)
  }

  const sendLink = async (event: FormEvent) => {
    event.preventDefault()
    setFailed(false)
    setSent(false)
    const { error } = await authClient.signIn.magicLink({
      email,
      callbackURL: "/dashboard",
    })
    if (error) setFailed(true)
    else setSent(true)
  }

  const signInAs = async (account: DevAccount) => {
    setFailed(false)
    const { error } = await authClient.$fetch("/sign-in/dev-account", {
      method: "POST",
      body: { account },
    })
    if (error) setFailed(true)
    // A full load: the client's session doesn't watch this path
    else window.location.assign("/dashboard")
  }

  return (
    <div className="flex w-full flex-col gap-5">
      <Button size="lg" className="w-full" onClick={signInWithMicrosoft}>
        <img src="/microsoft.svg" alt="" className="size-4" />
        {"Accedi con Microsoft"}
      </Button>
      {testLogin && (
        <>
          <Divider>{"oppure"}</Divider>
          <form onSubmit={sendLink} className="flex flex-col gap-2">
            <Label htmlFor="login-email">{"Email"}</Label>
            <Input
              id="login-email"
              type="email"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <Button type="submit" variant="outline" size="lg" className="mt-1">
              {"Invia il link"}
            </Button>
          </form>
        </>
      )}
      {devLogin && (
        <>
          <Divider>{"accesso rapido, solo in locale"}</Divider>
          <div className="grid grid-cols-2 gap-2">
            <Button
              variant="outline"
              size="lg"
              onClick={() => signInAs("admin")}
            >
              {"Entra come admin"}
            </Button>
            <Button
              variant="outline"
              size="lg"
              onClick={() => signInAs("operator")}
            >
              {"Entra come operatore"}
            </Button>
          </div>
        </>
      )}
      {sent && (
        <p role="status" className="text-center text-sm">
          {"Se l'indirizzo può accedere, riceverà il link"}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-destructive-text text-center text-sm">
          {"Accesso non riuscito"}
        </p>
      )}
    </div>
  )
}

function Divider({ children }: { children: ReactNode }) {
  return (
    <div className="flex items-center gap-3 text-xs text-muted-foreground">
      <span className="h-px flex-1 bg-border" />
      {children}
      <span className="h-px flex-1 bg-border" />
    </div>
  )
}
