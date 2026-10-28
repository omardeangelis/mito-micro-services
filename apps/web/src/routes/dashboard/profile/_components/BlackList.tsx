import { Link } from "react-router"
import { type CustomerUnderReview } from "@mito/contract/customer"
import { useCustomersUnderReview, useSetBlackListStatus } from "@/api/customer"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { LoadingSpinner } from "@/components/custom/loading-spinner"

type Customer = typeof CustomerUnderReview.Type

/**
 * The customers in review or blacklisted, as the parallel route `@blacklist`
 * of the Next.js app: "DM" blacklists a customer, or takes it off the
 * blacklist, and then it leaves the list
 */
export const BlackList = () => {
  const { data } = useCustomersUnderReview()
  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-xl font-bold">Blacklist</h2>
      <div className="flex flex-col gap-4">
        {data === undefined ? (
          <div className="flex h-36 items-center justify-center">
            <LoadingSpinner />
          </div>
        ) : data.length === 0 ? (
          <span>No customers under review</span>
        ) : (
          <div>
            {data.map((customer) => (
              <BlackListItem key={customer.id} customer={customer} />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

const BlackListItem = ({ customer }: { customer: Customer }) => {
  const setStatus = useSetBlackListStatus()
  // While the change is saved the switch shows it; a failed one goes back
  const checked = setStatus.isPending
    ? setStatus.variables.blackListStatus === "blacklisted"
    : customer.blackListStatus === "blacklisted"
  const switchId = `black-list-${customer.id}`
  return (
    <Card>
      <CardContent className="pt-6">
        <div className="flex justify-between">
          <div className="flex flex-col gap-2 text-neutral-500">
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">Nome:</span>
              <p>{customer.name}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">FC:</span>
              <p>{customer.fiscalCode ?? customer.vatCode}</p>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-lg font-semibold">Operatore</span>
              <p>
                {customer.operatore?.name} {customer.operatore?.surname}
              </p>
            </div>
          </div>
          <div className="flex flex-col justify-end gap-4">
            <div className="flex items-center space-x-2">
              <Label htmlFor={switchId}>DM</Label>
              <Switch
                id={switchId}
                checked={checked}
                disabled={setStatus.isPending}
                onCheckedChange={(blacklisted) =>
                  setStatus.mutate({
                    customerId: customer.id,
                    blackListStatus: blacklisted
                      ? "blacklisted"
                      : "whitelisted",
                  })
                }
              />
            </div>
            <Button
              asChild
              variant="outline"
              size="sm"
              className="text-neutral-500"
            >
              <Link to={`/dashboard/customers/${customer.id}`}>Profilo</Link>
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
