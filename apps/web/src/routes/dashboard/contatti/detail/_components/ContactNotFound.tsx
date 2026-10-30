import { Link } from "react-router"
import { buttonVariants } from "@/components/ui/button"
import { returnHref } from "@mito/client/contact/searchParams"

/**
 * The detail of a contact that does not exist (AC26): shown inside the sheet,
 * with the way back to the list the reader came from. `da` is the `da`
 * parameter of the address, as the page got it.
 */
export function ContactNotFound({ da }: { da: string | string[] | undefined }) {
  return (
    <div className="rounded-card flex flex-col items-start gap-4 border border-border bg-card p-4">
      <h3 className="font-heading text-lg">Contatto non trovato</h3>
      <Link
        to={returnHref(da)}
        preventScrollReset
        className={buttonVariants({ variant: "outline" })}
      >
        Torna a Contatti
      </Link>
    </div>
  )
}
