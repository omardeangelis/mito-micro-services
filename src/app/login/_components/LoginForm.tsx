"use client"

import { useState, type FormEvent } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { authClient } from "@/lib/authClient"

/**
 * "Accedi" with Microsoft, and with `testLogin` the email of the test login
 * (AUTH_TEST_LOGIN, spec auth-better-auth OQ6). Where each login ends the
 * server decides (D15).
 */
export function LoginForm({ testLogin }: { testLogin: boolean }) {
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

  return (
    <div className="flex w-full flex-col items-center gap-4">
      <Button onClick={signInWithMicrosoft}>{"Accedi"}</Button>
      {testLogin && (
        <form
          onSubmit={sendLink}
          className="flex w-full max-w-xs flex-col gap-2"
        >
          <Label htmlFor="login-email">{"Email"}</Label>
          <Input
            id="login-email"
            type="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
          />
          <Button type="submit" variant="outline">
            {"Invia il link"}
          </Button>
        </form>
      )}
      {sent && (
        <p role="status" className="text-sm">
          {"Se l'indirizzo può accedere, riceverà il link"}
        </p>
      )}
      {failed && (
        <p role="alert" className="text-sm text-red-600">
          {"Accesso non riuscito"}
        </p>
      )}
    </div>
  )
}
