import React, { useCallback } from "react"
import { useForm } from "react-hook-form"
import { Schema } from "effect"
import { type PracticeCustomer } from "@mito/contract/customer"
import { emailPattern } from "@mito/contract/pratiche"
import { Badge } from "@/components/ui/badge"
import { AccordionContent, AccordionTrigger } from "@/components/ui/accordion"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { Button } from "@/components/ui/button"
import { toast } from "sonner"
import { InputWithCopy } from "@/components/custom/input/InputWithCopy"
import { useUpdateCustomerPreview } from "@/api/pratiche"
import { schemaResolver } from "@/lib/form"
import { useRouter } from "@/lib/navigation"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { BlackListBadge } from "../../../customers/_components/BlackListBadge"

/**
 * The fields the form saves, as the server action checked them: an empty
 * email clears it (a customer may have none), the phone number goes as it is
 */
const previewSchema = Schema.Struct({
  email: Schema.Union([
    Schema.Literal(""),
    Schema.String.check(
      Schema.isMaxLength(255),
      Schema.isPattern(emailPattern, { message: "Invalid email" })
    ),
  ]),
  phoneNumber: Schema.String.check(Schema.isMaxLength(20)),
})

type PreviewValues = typeof previewSchema.Encoded

type Props = typeof PracticeCustomer.Type

/**
 * A customer of the practice, as `CustomerSection` of the Next.js app: its
 * email and phone number change here, by the admin or its operator
 */
export const CustomerSection = (props: Props) => {
  const { customerRole, id } = props
  const { role, operatorId } = useUserPreferenceContext((state) => state)
  const canEdit = role === "ADMIN" || operatorId === props.operatorId
  const form = useForm<PreviewValues>({
    defaultValues: {
      email: props.email ?? "",
      phoneNumber: props.phoneNumber ?? "",
    },
    resolver: schemaResolver(previewSchema),
  })

  const router = useRouter()

  const handleProfileClick = useCallback(() => {
    router.push(`/dashboard/customers/${id}`)
  }, [router, id])

  const updatePreview = useUpdateCustomerPreview()
  const pending = updatePreview.isPending
  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await updatePreview.mutateAsync({
        id,
        values: {
          email: values.email === "" ? null : values.email,
          phoneNumber: values.phoneNumber,
        },
      })
    } catch (_error) {
      toast.error("Errore durante l'aggiornamento del cliente", {
        duration: 1000,
      })
      return
    }
    toast.success("Cliente aggiornato con successo", { duration: 1000 })
    // The saved values are the ones of the form now
    form.reset(values)
  })

  // Each customer has its form: "Salva" in the header submits this one
  const formId = `customer-preview-${id}`
  const hasChanged = form.formState.isDirty
  return (
    <div className="rounded-card bg-muted p-4 shadow-card">
      <div className="flex w-full items-center justify-between rounded-md">
        <div className="flex w-full items-center gap-4">
          <h4 className="font-medium">Cliente</h4>
          <Badge tone="neutral">{customerRole}</Badge>
          <BlackListBadge state={props.blackListStatus} />
        </div>
        <div className="flex items-center gap-4">
          {canEdit ? (
            <Button
              type="button"
              onClick={() => void onSubmit()}
              disabled={!hasChanged || pending}
              aria-busy={pending}
            >
              Salva
            </Button>
          ) : null}

          <Button variant="secondary" onClick={handleProfileClick}>
            Vedi profilo
          </Button>
          <AccordionTrigger aria-label="Mostra i dati del cliente" />
        </div>
      </div>
      <AccordionContent className="mt-4">
        <Form {...form}>
          <form id={formId} onSubmit={(event) => void onSubmit(event)}>
            <div className="flex items-center justify-between gap-6">
              <FormItem className="w-full">
                <FormLabel>Nome</FormLabel>
                <Input
                  disabled
                  className="w-full"
                  placeholder="Nome"
                  defaultValue={props.name ?? ""}
                />
              </FormItem>
              <FormItem className="w-full">
                <FormLabel>Cognome</FormLabel>
                <Input
                  disabled
                  className="w-full"
                  placeholder="Cognome"
                  defaultValue={props.surname ?? ""}
                />
              </FormItem>
              <FormItem className="w-full">
                <FormLabel>Codice Fiscale</FormLabel>
                <InputWithCopy
                  disabled
                  canCopy
                  className="w-full"
                  placeholder="CF"
                  defaultValue={props.fiscalCode ?? props.vatCode ?? ""}
                />
              </FormItem>
            </div>
            <div className="flex items-center justify-between gap-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <InputWithCopy
                        className="w-full"
                        placeholder="Email"
                        canCopy
                        disabled={!canEdit}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Telefono</FormLabel>
                    <FormControl>
                      <Input
                        className="w-full"
                        placeholder="Telefono"
                        disabled={!canEdit}
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormItem className="w-full">
                <FormLabel>Operatore</FormLabel>
                <Input
                  defaultValue={
                    props.operatorName && props.operatorSurname
                      ? `${props.operatorName} ${props.operatorSurname}`
                      : "Non assegnato"
                  }
                  disabled
                />
              </FormItem>
            </div>
          </form>
        </Form>
      </AccordionContent>
    </div>
  )
}
