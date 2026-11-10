import { ChartColumn, Upload, UserPlus, Users } from "lucide-react"
import { Link } from "react-router"
import { Button } from "@/components/ui/button"

const ACTIONS = [
  { label: "Assegna da Clienti", to: "/dashboard/customers", icon: UserPlus },
  { label: "Importa", to: "/dashboard/import", icon: Upload },
  { label: "Analisi", to: "/dashboard/analisi", icon: ChartColumn },
  { label: "Team", to: "/dashboard/settings/team", icon: Users },
]

/** The pages an admin goes to from the home (AC5) */
export function QuickActions() {
  return (
    <nav aria-label="Azioni rapide" className="flex flex-wrap gap-2">
      {ACTIONS.map(({ label, to, icon: Icon }) => (
        <Button key={to} asChild variant="secondary">
          <Link to={to}>
            <Icon aria-hidden />
            {label}
          </Link>
        </Button>
      ))}
    </nav>
  )
}
