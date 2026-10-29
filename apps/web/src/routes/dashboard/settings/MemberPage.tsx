import { useRef, useState } from "react"
import { Link, useNavigate, useParams } from "react-router"
import { ChevronLeftIcon } from "lucide-react"
import { type Role } from "@mito/contract/schemas"
import { describeApiError, isApiFailure } from "@/api/errors"
import {
  useDeactivationImpact,
  useTeam,
  useUpdateOperatorsRole,
} from "@/api/operator"
import { Badge } from "@/components/ui/badge"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { useToast } from "@/components/ui/use-toast"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { DeactivateOperatorDialog } from "./_components/DeactivateOperatorDialog"
import {
  AdminOnly,
  SettingsLoading,
  SettingsPage,
} from "./_components/SettingsPage"
import { memberName, roleLabel } from "./_lib/role"
import { type TeamLocationState } from "./TeamPage"

type Member = { id: number; name: string | null; surname: string | null }

const isRole = (value: string): value is Role =>
  value === "ADMIN" || value === "OPERATORE"

/**
 * A member of the team (admins only): its role, what it holds and its
 * deactivation (gestione-operatori, AC20a–AC23). The member comes from the
 * team, so one that isn't active is not found; once deactivated the page goes
 * back to the team
 */
export function Component() {
  return (
    <AdminOnly>
      <MemberOfTeam />
    </AdminOnly>
  )
}

const backToTeam = (
  <Link
    to="/dashboard/settings/team"
    className="flex w-fit items-center gap-1 rounded-sm text-sm text-muted-foreground hover:text-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
  >
    <ChevronLeftIcon aria-hidden className="size-4" />
    Team
  </Link>
)

const MemberOfTeam = () => {
  const { id } = useParams()
  const { data } = useTeam()
  const me = useUserPreferenceContext((state) => state.operatorId)
  const headingRef = useRef<HTMLHeadingElement>(null)
  const navigate = useNavigate()

  if (data === undefined) return <SettingsLoading />
  const member = data.find((row) => String(row.id) === id)
  if (!member)
    return (
      <SettingsPage
        title="Membro non trovato"
        back={backToTeam}
        description="Non è nel team: forse è stato disattivato."
      >
        {null}
      </SettingsPage>
    )

  const isMe = member.id === me
  return (
    <SettingsPage
      title={memberName(member)}
      headingRef={headingRef}
      back={backToTeam}
      description={member.email}
      aside={
        <Badge tone={member.role === "ADMIN" ? "indigo" : "neutral"}>
          {roleLabel(member.role)}
        </Badge>
      }
    >
      {/* Keyed: another member starts from its own role */}
      <RoleCard key={member.id} member={member} role={member.role} />
      <Portfolio operatorId={member.id} />
      <Card>
        <CardHeader>
          <CardTitle>Disattivazione</CardTitle>
          <CardDescription>
            {isMe
              ? "Non puoi disattivare te stesso."
              : member.role === "ADMIN"
                ? "Un admin non si può disattivare: prima cambia il suo ruolo in Operatore."
                : "Non potrà più entrare nel gestionale. Clienti, contatti attivi e pratiche passano a un altro membro."}
          </CardDescription>
        </CardHeader>
        {!isMe && member.role === "OPERATORE" ? (
          <CardFooter className="justify-end">
            <DeactivateOperatorDialog
              operator={{
                id: member.id,
                name: member.name ?? "",
                surname: member.surname ?? "",
              }}
              onDeactivated={() =>
                navigate("/dashboard/settings/team", {
                  state: { focusHeading: true } satisfies TeamLocationState,
                })
              }
              returnFocusTo={headingRef}
            />
          </CardFooter>
        ) : null}
      </Card>
    </SettingsPage>
  )
}

/**
 * The role of the member, saved with "Salva": the server keeps at least one
 * admin (LastAdmin) and says when the member is gone
 */
const RoleCard = ({ member, role }: { member: Member; role: Role }) => {
  const [chosen, setChosen] = useState<Role>(role)
  const updateRoles = useUpdateOperatorsRole()
  const { toast } = useToast()

  const save = async () => {
    try {
      await updateRoles.mutateAsync([{ id: member.id, role: chosen }])
    } catch (failure) {
      toast({
        // The errors of the roles say what to do; the others don't
        title:
          isApiFailure(failure) &&
          (failure._tag === "LastAdmin" || failure._tag === "OperatorNotFound")
            ? describeApiError(failure)
            : "Errore durante l'aggiornamento del ruolo",
        duration: 2000,
        variant: "destructive",
      })
      return
    }
    toast({ title: "Ruolo aggiornato", duration: 2000, variant: "success" })
  }

  const selectId = `role-${member.id}`
  return (
    <Card>
      <CardHeader>
        <CardTitle>Ruolo</CardTitle>
        <CardDescription>
          Un admin vede anche Import, Team e Blacklist, e gestisce il team.
        </CardDescription>
      </CardHeader>
      <CardContent className="flex items-center justify-between gap-4">
        <Label htmlFor={selectId}>Ruolo</Label>
        <Select
          value={chosen}
          disabled={updateRoles.isPending}
          onValueChange={(value) => {
            if (isRole(value)) setChosen(value)
          }}
        >
          <SelectTrigger id={selectId} className="w-48">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="ADMIN">Admin</SelectItem>
            <SelectItem value="OPERATORE">Operatore</SelectItem>
          </SelectContent>
        </Select>
      </CardContent>
      <CardFooter className="justify-end border-t pt-6">
        <Button
          disabled={chosen === role || updateRoles.isPending}
          aria-busy={updateRoles.isPending}
          onClick={() => void save()}
        >
          Salva
        </Button>
      </CardFooter>
    </Card>
  )
}

/** What the member holds: what a deactivation would move */
const Portfolio = ({ operatorId }: { operatorId: number }) => {
  const impact = useDeactivationImpact(operatorId, true)
  const stats = impact.data
    ? [
        ["Clienti", impact.data.customers],
        ["Contatti attivi", impact.data.contacts],
        ["Pratiche", impact.data.practices],
      ]
    : null
  return (
    <Card>
      <CardHeader>
        <CardTitle>Portafoglio</CardTitle>
        <CardDescription>
          Quello che è assegnato a questo membro.
        </CardDescription>
      </CardHeader>
      <CardContent>
        {impact.isError ? (
          <div className="flex items-center justify-between gap-3">
            <p role="alert" className="text-destructive-text text-sm">
              Impossibile caricare il portafoglio
            </p>
            <Button
              variant="outline"
              size="sm"
              onClick={() => void impact.refetch()}
            >
              Riprova
            </Button>
          </div>
        ) : stats ? (
          <dl className="grid grid-cols-3 gap-4">
            {stats.map(([label, value]) => (
              <div
                key={label}
                className="rounded-control flex flex-col gap-1 bg-muted px-4 py-3"
              >
                <dt className="text-sm text-muted-foreground">{label}</dt>
                <dd className="text-title font-heading tabular-nums">
                  {value}
                </dd>
              </div>
            ))}
          </dl>
        ) : (
          <SettingsLoading />
        )}
      </CardContent>
    </Card>
  )
}
