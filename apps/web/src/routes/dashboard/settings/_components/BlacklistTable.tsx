import { Link } from "react-router"
import { type CustomerUnderReview } from "@mito/contract/customer"
import { useSetBlackListStatus } from "@/api/customer"
import { Badge } from "@/components/ui/badge"
import { Card } from "@/components/ui/card"
import { Switch } from "@/components/ui/switch"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { blacklistTone } from "@/lib/tones"

type Customer = typeof CustomerUnderReview.Type

/** The name of the customer; one without, by its code, so the link has a name */
const customerName = (customer: Customer) =>
  [customer.name, customer.surname].filter(Boolean).join(" ") ||
  `Cliente ${customer.fiscalCode ?? customer.vatCode ?? customer.id}`

/**
 * The customers in review or blacklisted, as the parallel route `@blacklist`
 * of the Next.js app: "DM" blacklists a customer, or takes it off the
 * blacklist, and then it leaves the list. The name opens the customer
 */
export const BlacklistTable = ({
  customers,
}: {
  customers: readonly Customer[]
}) =>
  customers.length === 0 ? (
    <Card className="items-center gap-1 py-12 text-center">
      <p className="font-medium">Nessun cliente da verificare</p>
      <p className="text-sm text-muted-foreground">
        I clienti segnalati compaiono qui.
      </p>
    </Card>
  ) : (
    <Table>
      <TableHeader>
        <TableRow className="hover:bg-transparent">
          <TableHead>Cliente</TableHead>
          <TableHead>Codice fiscale / P. IVA</TableHead>
          <TableHead>Operatore</TableHead>
          <TableHead>Stato</TableHead>
          <TableHead className="text-right">DM</TableHead>
        </TableRow>
      </TableHeader>
      <TableBody>
        {customers.map((customer) => (
          <BlacklistRow key={customer.id} customer={customer} />
        ))}
      </TableBody>
    </Table>
  )

const BlacklistRow = ({ customer }: { customer: Customer }) => {
  const setStatus = useSetBlackListStatus()
  // While the change is saved the switch shows it; a failed one goes back
  const checked = setStatus.isPending
    ? setStatus.variables.blackListStatus === "blacklisted"
    : customer.blackListStatus === "blacklisted"
  const name = customerName(customer)
  return (
    <TableRow>
      <TableCell>
        <Link
          to={`/dashboard/customers/${customer.id}`}
          className="rounded-sm font-medium hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring"
        >
          {name}
        </Link>
      </TableCell>
      <TableCell className="font-mono text-sm">
        {customer.fiscalCode ?? customer.vatCode}
      </TableCell>
      <TableCell>
        {customer.operatore ? (
          [customer.operatore.name, customer.operatore.surname]
            .filter(Boolean)
            .join(" ")
        ) : (
          <span className="text-muted-foreground">Nessuno</span>
        )}
      </TableCell>
      <TableCell>
        <Badge tone={blacklistTone(customer.blackListStatus)}>
          {customer.blackListStatus === "blacklisted"
            ? "In blacklist"
            : "Da verificare"}
        </Badge>
      </TableCell>
      <TableCell className="text-right">
        <Switch
          aria-label={`DM ${name}`}
          checked={checked}
          disabled={setStatus.isPending}
          onCheckedChange={(blacklisted) =>
            setStatus.mutate({
              customerId: customer.id,
              blackListStatus: blacklisted ? "blacklisted" : "whitelisted",
            })
          }
        />
      </TableCell>
    </TableRow>
  )
}
