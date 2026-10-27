import { Link } from "react-router"
import { Button } from "@/components/ui/button"

/** A path that is no route of the app */
export function NotFound() {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-2xl font-bold">Pagina non trovata</h1>
      <p className="text-muted-foreground">
        L&apos;indirizzo non corrisponde a nessuna pagina
      </p>
      <Button asChild>
        <Link to="/dashboard">Torna alla dashboard</Link>
      </Button>
    </div>
  )
}
