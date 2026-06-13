"use client"
import { handleCustomerBlackList } from "@/app/dashboard/customers/_actions/handleCustomerBlackList"
import { Button } from "@/components/ui/button"
import { Card, CardContent } from "@/components/ui/card"
import { Label } from "@/components/ui/label"
import { Switch } from "@/components/ui/switch"
import { type OperatorWithRole, type Customer } from "@/lib/types/schemas"
import Link from "next/link"
import { useCallback } from "react"

type BlackListProps = Pick<
  Customer,
  | "id"
  | "name"
  | "surname"
  | "fiscalCode"
  | "vatCode"
  | "birthdayDate"
  | "blackListStatus"
> & {
  operatore: Pick<OperatorWithRole, "id" | "name" | "surname"> | null
  signedPractices: number
}

export const BlackList = (props: { blackList: BlackListProps[] }) => {
  if (props.blackList.length === 0)
    return <span>No customers under review</span>
  return (
    <div>
      {props.blackList.map((customer) => (
        <BlackListItem key={customer.id} customer={customer} />
      ))}
    </div>
  )
}

const BlackListItem = (props: { customer: BlackListProps }) => {
  const { customer } = props
  const handleSwitch = useCallback(async () => {
    await handleCustomerBlackList({
      customerId: customer.id,
      blackListStatus:
        customer.blackListStatus === "blacklisted"
          ? "whitelisted"
          : "blacklisted",
    })
  }, [customer.id, customer.blackListStatus])
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
              <Label htmlFor="black-list">DM</Label>
              <Switch
                id="black-list"
                defaultChecked={customer.blackListStatus === "blacklisted"}
                onCheckedChange={handleSwitch}
              />
            </div>
            <Link href={`/dashboard/customers/${customer.id}`}>
              <Button variant="outline" size="sm" className="text-neutral-500">
                Profilo
              </Button>
            </Link>
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
