import { type ServerPageProps } from "@/lib/types"
import PraticaGeneralForm from "./_components/PraticaGeneralForm"
import { CollassableSection } from "@/components/custom/CollassableItem"
import { CustomerSection } from "./_components/CustomerSection"
import { api } from "@/trpc/server"
import { notFound } from "next/navigation"
import { readContactError } from "@mito/domain/contact/errors"

export default async function SinglePratica({
  params,
}: ServerPageProps<{
  id: string
}>) {
  const { id } = params

  const pratica = await api.pratiche.getPraticaById
    .query({ id })
    .catch((error: unknown) => {
      if (readContactError(error)?.code === "PRACTICE_NOT_FOUND") notFound()
      throw error
    })
  const customers = await api.customer.getAllCustomerForPratica.query({
    id: pratica.praticaId,
  })

  const intestatario = customers.find((c) => c.customerRole === "Intestatario")

  const intestatarioFiscalCode =
    intestatario?.fiscalCode ?? intestatario?.vatCode ?? ""

  const praticaInitialValues = {
    ...pratica,
    operatorId:
      intestatario?.operatorId ??
      customers.find((c) => c.operatorId)?.operatorId ??
      undefined,
    intestatarioFiscalCode: intestatarioFiscalCode,
  }

  return (
    <div className="dashbaord-layout">
      <div className="relative">
        <div className="dashboard-content">
          <div className="rounded-lg border border-neutral-200 p-4">
            <PraticaGeneralForm initialValues={praticaInitialValues} />
            <hr className="my-8 border border-neutral-100" />

            <CollassableSection defaultValue={["item-1"]}>
              {customers.map((user) => {
                return <CustomerSection key={user.id} {...user} />
              })}
            </CollassableSection>
          </div>
        </div>
      </div>
    </div>
  )
}
