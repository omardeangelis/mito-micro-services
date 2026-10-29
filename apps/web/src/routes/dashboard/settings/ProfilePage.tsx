import { useSearchParams } from "react-router"
import { useCurrentUser } from "@/api/me"
import { Alert, AlertDescription } from "@/components/ui/alert"
import { Badge } from "@/components/ui/badge"
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { LogoutButton } from "./_components/LogoutButton"
import { ProfileForm } from "./_components/ProfileForm"
import { SettingsLoading, SettingsPage } from "./_components/SettingsPage"
import { roleLabel } from "./_lib/role"

/**
 * Profilo, in the settings: the own name and surname, the role and the exit.
 * At the first access (`?firstTime=true`, where the server sends a new user)
 * it says what is missing. Without the current user the page can't show
 * them: a failed read goes to the error of the route
 */
export function Component() {
  const [searchParams] = useSearchParams()
  const isFirstTime = searchParams.get("firstTime") === "true"
  const { data, error } = useCurrentUser()
  if (!data && error) throw error

  return (
    <SettingsPage
      title="Profilo"
      description="I tuoi dati nel gestionale e la tua sessione."
    >
      {isFirstTime ? (
        <Alert variant="info">
          <AlertDescription>
            È il tuo primo accesso: scrivi nome e cognome per entrare nella
            dashboard.
          </AlertDescription>
        </Alert>
      ) : null}
      {data ? (
        <>
          <ProfileForm operator={data.operator} />
          <Card>
            <CardHeader>
              <CardTitle>Account</CardTitle>
              <CardDescription>
                Il ruolo lo cambia un admin, dalla pagina Team.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col divide-y divide-border">
              <div className="flex items-center justify-between gap-4 pb-4">
                <span className="text-sm">Ruolo</span>
                <Badge tone={data.role === "ADMIN" ? "indigo" : "neutral"}>
                  {roleLabel(data.role)}
                </Badge>
              </div>
              <div className="flex items-center justify-between gap-4 pt-4">
                <div className="flex flex-col gap-0.5">
                  <span className="text-sm">Esci dal gestionale</span>
                  <span className="text-sm text-muted-foreground">
                    Chiude la sessione in questo browser.
                  </span>
                </div>
                <LogoutButton />
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <SettingsLoading />
      )}
    </SettingsPage>
  )
}
