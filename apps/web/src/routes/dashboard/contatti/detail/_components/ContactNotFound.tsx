import { Link } from "react-router"
import { buttonVariants } from "@/components/ui/button"

/**
 * The detail of a contact that does not exist (AC26): shown inside the sheet,
 * with the way back to where the reader came from.
 */
export function ContactNotFound({
  href,
  label,
  replace,
}: {
  href: string
  label: string
  /** Whether it takes the place of the entry of the detail */
  replace?: boolean
}) {
  return (
    <div className="rounded-card flex flex-col items-start gap-4 border border-border bg-card p-4">
      <h3 className="font-heading text-lg">Contatto non trovato</h3>
      <Link
        to={href}
        preventScrollReset
        replace={replace}
        className={buttonVariants({ variant: "outline" })}
      >
        {label}
      </Link>
    </div>
  )
}
