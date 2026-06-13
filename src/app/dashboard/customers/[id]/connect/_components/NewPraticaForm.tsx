"use client"

import z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
// import { useSearchParams } from "@/lib/hooks/useSearchParams"
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
import React, { Suspense, useCallback } from "react"
import { useHistoryBack } from "@/lib/hooks/useHistoryBack"
import {
  type CustomerToPraticaWrite,
  type CustomerWrite,
  insertCustomerSchema,
  insertPracticeSchema,
  type PracticeWrite,
} from "@/lib/types/schemas"

import {
  SelectContent,
  SelectLabel,
  SelectValue,
  Select,
  SelectGroup,
  SelectTrigger,
  SelectItem,
} from "@/components/ui/select"
import { getAllProductLabels } from "@/lib/constants/productMap"
import { stateEnum } from "@/server/db/schema/pratiche"
import { createNewPraticaAction } from "../../_actions/connectPratica"
import { type CustomerRole, customerRoleEnum } from "@/server/db/schema/index"
import { nanoid } from "nanoid"
import { DatePickerFormItem } from "@/components/custom/date-picker"
import { useRouter } from "next/navigation"
import { api } from "@/trpc/react"
import { CheckCircle } from "lucide-react"

type CustomerSaveResponse = Promise<{
  success: 0 | 1
  error: string
}>

type CustomerSave = (
  customer: NewRelatedCustomerFormValues
) => CustomerSaveResponse

type CustomerWithRole = CustomerWrite & {
  role: CustomerToPraticaWrite["customerRole"]
}

export type CreateNewPraticaInput = {
  pratica: Omit<PracticeWrite, "productId"> & { productId: string }
  customers: CustomerWithRole[]
  customerID: string
}

const praticaSchema = insertPracticeSchema
  .pick({
    id: true,
    praticaId: true,
    productId: true,
    state: true,
    importoFinanziato: true,
    importoErogato: true,
    dataLiquidazione: true,
    importoRata: true,
    rateTotali: true,
    ratePagate: true,
    // add new fields
    desPuntoVendita: true,
    importoRichiesto: true,
    tassoPratica: true,
    dataEstinzione: true,
    region: true,
    desConvenzionato: true,
  })
  .merge(
    z.object({
      praticaId: z.string(),
      productId: z.string(),
      importoFinanziato: z.string(),
      importoErogato: z.string(),
      importoRichiesto: z.string(),
      dataLiquidazione: z.date(),
      dataEstinzione: z.date().optional(),
      rateTotali: z.string(),
      ratePagate: z.string().optional(),
      importoRata: z.string(),
      tassoPratica: z.string().optional(),
    })
  )

const formInitialValues = z.object({
  customerID: z.string(),
})

const extendSchema = z.object({
  customerID: z.string(),
})

const schema = z.intersection(praticaSchema, extendSchema)

type InitialValues = z.infer<typeof formInitialValues>
type FormValues = z.infer<typeof schema>

function convertNullToUndefined<T>(value: T | null): T | undefined {
  return value ?? undefined
}

export default function NewPraticaForm({
  initialValues,
}: {
  initialValues: InitialValues
}) {
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      customerID: initialValues.customerID,
      dataLiquidazione: new Date(Date.now()),
    },
  })
  const goBack = useHistoryBack()
  const getCustomer =
    // eslint-disable-next-line @typescript-eslint/unbound-method
    api.useUtils().customer.getCustomersByFiscalCodeOrVatCode.ensureData
  const [availableSede] = api.customer.getAllAvaliableSede.useSuspenseQuery()
  const [availableRegion] =
    api.pratiche.getAllAvailableRegion.useSuspenseQuery()

  const praticaStateOptions = stateEnum

  const hasChanged = form.formState.isDirty

  const [relatedCustomers, setRelatedCustomers] = React.useState<
    NewRelatedCustomerFormValues[]
  >([])

  const router = useRouter()

  const handleSubmit = form.handleSubmit(
    async (values) => {
      const data = {
        pratica: {
          ...values,
          rateTotali: parseInt(values.rateTotali),
          ratePagate: values.ratePagate ? parseInt(values.ratePagate) : 0,
        },
        customerID: initialValues.customerID,
        customers: relatedCustomers.map((c) => ({
          ...c,
          source: "spontaneo",
          uniqueHash: nanoid(),
        })),
      } satisfies CreateNewPraticaInput
      const { redirectUrl, error } = await createNewPraticaAction(data)
      if (error)
        return form.setError("praticaId", {
          message: "Errore durante la creazione",
        })
      router.replace(redirectUrl)
    },
    (error) => {
      console.error(error)
    }
  )

  const addRelatedCustomer = () => {
    setRelatedCustomers((prev) => [
      ...prev,
      {
        id: nanoid(),
        tempID: "",
        name: "",
        surname: "",
        email: "",
        phoneNumber: "",
        fiscalCode: "",
        vatCode: "",
        role: "Garante",
      },
    ])
  }

  const deleteRelatedCustomer = useCallback((id: string) => {
    setRelatedCustomers((prev) => prev.filter((customer) => customer.id !== id))
  }, [])

  const onCustomerSave = useCallback(
    async (
      customer: NewRelatedCustomerFormValues,
      type?: "new" | "existing"
    ): CustomerSaveResponse => {
      const defualtType = type ?? "new"
      if (defualtType === "existing") {
        setRelatedCustomers((prev) =>
          prev.map((c) => (c.id === customer.id ? customer : c))
        )

        return {
          success: 1,
          error: "",
        }
      }
      const data = await getCustomer({
        fiscalCode: customer.fiscalCode,
        vatCode: customer.vatCode,
        tempID: customer.tempID,
      })
      if (data?.[0]) {
        return {
          success: 0,
          error: "Cliente già presente",
        }
      }
      setRelatedCustomers((prev) =>
        prev.map((c) => (c.id === customer.id ? customer : c))
      )

      return {
        success: 1,
        error: "",
      }
    },
    [getCustomer]
  )

  return (
    <>
      <div className="flex flex-col">
        <div className="bg-background">
          <Form {...form}>
            <form onSubmit={handleSubmit} className="mb-2 bg-white p-4">
              <div className="flex items-center justify-between">
                <div>
                  <h4>Dettaglio Pratica</h4>
                </div>
                <div className="flex items-center gap-4">
                  <Button
                    variant="secondary"
                    type="button"
                    onClick={() => goBack("/dashboard/pratiche")}
                  >
                    Indietro
                  </Button>
                  <Button
                    disabled={!hasChanged || form.formState.isSubmitting}
                    variant={
                      hasChanged && !form.formState.isSubmitting
                        ? "default"
                        : "disabled"
                    }
                    type="submit"
                  >
                    Aggiungi Pratica
                  </Button>
                </div>
              </div>
              <div className="mt-8 flex flex-col gap-6">
                <div className="form-row">
                  <FormField
                    name="customerID"
                    render={({ field }) => (
                      <FormItem className="w-full" hidden>
                        <FormControl hidden>
                          <Input
                            className="w-full"
                            placeholder="Customer ID"
                            {...field}
                          />
                        </FormControl>
                      </FormItem>
                    )}
                  />
                  <FormField
                    name="praticaId"
                    control={form.control}
                    render={({ field }) => (
                      <FormItem className="w-full">
                        <FormLabel>ID Pratica</FormLabel>
                        <FormControl>
                          <Input
                            className="w-full"
                            placeholder="ID Pratica"
                            {...field}
                          />
                        </FormControl>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="productId"
                    render={({ field: { ref: _, ...field } }) => (
                      <FormItem className="w-full bg-white">
                        <FormLabel>Tipo di Prodotto</FormLabel>
                        <Select
                          {...field}
                          onValueChange={field.onChange}
                          value={field.value ?? ""}
                        >
                          <FormControl>
                            <SelectTrigger className="bg-white">
                              <SelectValue>{field.value ?? ""}</SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Stato</SelectLabel>
                              {getAllProductLabels().map((state) => (
                                <SelectItem key={state} value={state}>
                                  {state}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="state"
                    render={({ field: { ref: _, ...field } }) => (
                      <FormItem className="w-full bg-white">
                        <FormLabel>Stato</FormLabel>
                        <Select
                          {...field}
                          onValueChange={field.onChange}
                          value={field.value}
                        >
                          <FormControl>
                            <SelectTrigger className="bg-white">
                              <SelectValue>
                                {field.value
                                  ? convertNullToUndefined(field.value)
                                  : "Seleziona Stato"}
                              </SelectValue>
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectGroup>
                              <SelectLabel>Stato</SelectLabel>
                              {praticaStateOptions.map((state) => (
                                <SelectItem key={state} value={state}>
                                  {state}
                                </SelectItem>
                              ))}
                            </SelectGroup>
                          </SelectContent>
                        </Select>
                        <FormMessage className="text-red-400" />
                      </FormItem>
                    )}
                  />
                </div>
                <div className="form-row">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      name="importoFinanziato"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Importo Finanziato</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              className="w-full"
                              placeholder="Importo Finanziato"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="importoErogato"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Importo Erogato</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              className="w-full"
                              placeholder="Importo Erogato"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="importoRata"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Importo Rata</FormLabel>
                          <FormControl>
                            <Input
                              className="w-full"
                              placeholder="Importo Rata"
                              type="number"
                              step="any"
                              min={0}
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      control={form.control}
                      name="rateTotali"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Rate Totali</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step={1}
                              min={0}
                              className="w-full"
                              placeholder="Rate Totali"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="ratePagate"
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Rate Pagate</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step={1}
                              min={0}
                              className="w-full"
                              placeholder="Rate Pagate"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="dataLiquidazione"
                    render={({ field }) => (
                      <DatePickerFormItem
                        fieldValue={field.value}
                        onChange={field.onChange}
                        label="Data di nascita"
                        onlyFuture
                      />
                    )}
                  />
                </div>
                <div className="form-row">
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      name="desPuntoVendita"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Punto Vendita</FormLabel>
                          <Select
                            {...field}
                            onValueChange={field.onChange}
                            value={field.value ? field.value : undefined}
                            defaultValue={
                              availableSede[0] ? availableSede[0].sede! : ""
                            }
                          >
                            <FormControl>
                              <SelectTrigger className="bg-white">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <Suspense fallback={<>Loading..</>}>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectLabel>Ruolo</SelectLabel>
                                  {availableSede
                                    .filter((role) => role.sede)
                                    .map((role) => (
                                      <SelectItem
                                        key={role.sede}
                                        value={
                                          role.sede ?? availableSede[0]!.sede!
                                        }
                                      >
                                        {role.sede}
                                      </SelectItem>
                                    ))}
                                </SelectGroup>
                              </SelectContent>
                            </Suspense>
                          </Select>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />

                    <FormField
                      name="region"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Regione</FormLabel>
                          <Select
                            {...field}
                            onValueChange={field.onChange}
                            value={field.value ? field.value : undefined}
                            defaultValue={
                              availableRegion[0]
                                ? availableRegion[0].region!
                                : ""
                            }
                          >
                            <FormControl>
                              <SelectTrigger className="bg-white">
                                <SelectValue />
                              </SelectTrigger>
                            </FormControl>
                            <Suspense fallback={<>Loading..</>}>
                              <SelectContent>
                                <SelectGroup>
                                  <SelectLabel>Ruolo</SelectLabel>
                                  {availableRegion
                                    .filter((role) => role.region)
                                    .map((role) => (
                                      <SelectItem
                                        key={role.region}
                                        value={
                                          role.region
                                            ? role.region
                                            : availableRegion[0]!.region!
                                        }
                                      >
                                        {role.region}
                                      </SelectItem>
                                    ))}
                                </SelectGroup>
                              </SelectContent>
                            </Suspense>
                          </Select>

                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <FormField
                      name="importoRichiesto"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Importo Richiesto</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              className="w-full"
                              placeholder="Importo Richiesto"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />
                    <FormField
                      name="tassoPratica"
                      control={form.control}
                      render={({ field }) => (
                        <FormItem className="w-full">
                          <FormLabel>Tasso Pratica</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              step="any"
                              className="w-full"
                              placeholder="Tasso Pratica"
                              {...field}
                            />
                          </FormControl>
                          <FormMessage className="text-red-400" />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    name="dataEstinzione"
                    control={form.control}
                    render={({ field }) => (
                      <DatePickerFormItem
                        fieldValue={field.value}
                        onChange={field.onChange}
                        label="Data Estinzione"
                        onlyFuture
                      />
                    )}
                  />
                </div>
              </div>
            </form>
          </Form>
        </div>
        <NewRelatedCustomerFormList
          customers={relatedCustomers}
          onDelete={deleteRelatedCustomer}
          onCustomerSave={onCustomerSave}
        />
        <div className="h-6 w-full bg-background" />
        <Button
          variant="outline"
          className="mr-auto w-fit"
          onClick={addRelatedCustomer}
        >
          Nuovo Cliente
        </Button>
      </div>
    </>
  )
}

const newRelatedCustomerSchema = insertCustomerSchema
  .pick({
    id: true,
    name: true,
    surname: true,
    phoneNumber: true,
    tempID: true,
  })
  .extend({
    role: z.enum(["Coobbligato", "Garante"]),
    email: z.string().email(),
    fiscalCode: z
      .string()
      .min(16, "Deve avere almeno 16 caratteri")
      .max(16, "Deve avere al massimo 16 caratteri"),
    vatCode: z
      .string()
      .min(11, "Deve avere almeno 11 caratteri")
      .max(11, "Deve avere al massimo 11 caratteri"),
  })
  .partial({
    vatCode: true,
    fiscalCode: true,
  })
  .superRefine((schema, ctx) => {
    if (!schema.vatCode && !schema.fiscalCode) {
      ctx.addIssue({
        code: "custom",
        message: "Uno tra Partita Iva e Codice Fiscale è obbligatorio",
        path: ["vatCode"],
      })
      ctx.addIssue({
        code: "custom",
        message: "Uno tra Partita Iva e Codice Fiscale è obbligatorio",
        path: ["fiscalCode"],
      })
    }
  })

type NewRelatedCustomerFormValues = z.infer<typeof newRelatedCustomerSchema>

type NewRelatedCustomerFormListProps = {
  customers: NewRelatedCustomerFormValues[]
  onDelete: (id: string) => void
  onCustomerSave: CustomerSave
}

const NewRelatedCustomerFormList = ({
  customers,
  onDelete,
  onCustomerSave,
}: NewRelatedCustomerFormListProps) => {
  return (
    <div className="bg-background">
      <div className="flex flex-col">
        {customers.map((customer, index) => (
          <div key={index}>
            <div className="h-6 w-full bg-background" />
            <NewRelatedCustomerForm
              onDelete={onDelete}
              onCustomerSave={onCustomerSave}
              customers={customer}
            />
          </div>
        ))}
      </div>
    </div>
  )
}

const NewRelatedCustomerForm = ({
  onDelete,
  customers,
  onCustomerSave,
}: {
  customers: NewRelatedCustomerFormValues
  onDelete: (id: string) => void
  onCustomerSave: CustomerSave
}) => {
  const form = useForm<NewRelatedCustomerFormValues>({
    defaultValues: {
      id: customers.id,
    },
    resolver: zodResolver(newRelatedCustomerSchema),
  })

  const isEditing = form.formState.submitCount > 0
  const [saved, setSaved] = React.useState(false)

  const handleSubmit = form.handleSubmit(async (values) => {
    const { success } = await onCustomerSave(values)
    if (!success) {
      form.setError("fiscalCode", { message: "Cliente già presente" })
      form.setError("vatCode", { message: "Cliente già presente" })
      form.setError("tempID", { message: "Cliente già presente" })
    } else {
      setSaved(true)
    }
  })

  if (saved) {
    return (
      <div className="rounded-md bg-background">
        <div className="flex items-center justify-between rounded-md border border-emerald-100 bg-emerald-50 p-4">
          <div className="flex items-center gap-2">
            <CheckCircle size={16} className="fill-green-400"></CheckCircle>
            <h4>{form.getValues("fiscalCode")}</h4>
          </div>
          <div className="flex items-center gap-4">
            <Button variant="default" onClick={() => setSaved(false)}>
              Modifica
            </Button>
          </div>
        </div>
      </div>
    )
  }
  return (
    <div className="rounded-md bg-background">
      <Form {...form}>
        <form className="rounded-md bg-white p-4" onSubmit={handleSubmit}>
          <div className="flex items-center justify-between">
            <div>
              <h4>Aggiungi Cliente</h4>
            </div>
            <div className="flex items-center gap-4">
              <Button
                variant="secondary"
                type="button"
                onClick={() => onDelete(customers.id!)}
              >
                Rimuovi
              </Button>
              <Button variant="default" type="submit">
                {isEditing ? "Modifica" : "Salva"}
              </Button>
            </div>
          </div>
          <FormField
            name="id"
            defaultValue={customers.id!}
            render={({ field }) => (
              <FormItem className="w-full" hidden>
                <FormControl hidden>
                  <Input
                    className="w-full"
                    placeholder="ID Cliente"
                    {...field}
                  />
                </FormControl>
              </FormItem>
            )}
          />
          <div className="mt-8 flex flex-col gap-6">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  name="name"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Nome</FormLabel>
                      <FormControl>
                        <Input
                          className="w-full"
                          placeholder="Nome"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
                <FormField
                  name="surname"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Cognome</FormLabel>
                      <FormControl>
                        <Input
                          className="w-full"
                          placeholder="Cognome"
                          {...field}
                          value={field.value ?? undefined}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  name="email"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Email</FormLabel>
                      <FormControl>
                        <Input
                          className="w-full"
                          placeholder="Email"
                          {...field}
                          value={field.value ?? ""}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
                <FormField
                  name="phoneNumber"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Telefono</FormLabel>
                      <FormControl>
                        <Input
                          className="w-full"
                          placeholder="Telefono"
                          {...field}
                          value={field.value ?? undefined}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  name="fiscalCode"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Codice Fiscale</FormLabel>
                      <FormControl>
                        <Input
                          className="w-full"
                          placeholder="Codice Fiscale"
                          {...field}
                          value={field.value ?? undefined}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
                <FormField
                  name="vatCode"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Partita Iva</FormLabel>
                      <FormControl>
                        <Input
                          className="w-full"
                          placeholder="Partita Iva"
                          {...field}
                          value={field.value ?? undefined}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  name="tempID"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="w-full">
                      <FormLabel>Codice Cliente (NDG)</FormLabel>
                      <FormControl>
                        <Input
                          className="w-full"
                          placeholder="Codice Cliente"
                          {...field}
                          value={field.value ?? undefined}
                        />
                      </FormControl>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
                <FormField
                  name="role"
                  control={form.control}
                  render={({ field }) => (
                    <FormItem className="w-full bg-white">
                      <FormLabel>Ruolo</FormLabel>
                      <Select
                        {...field}
                        onValueChange={field.onChange}
                        value={
                          field.value
                            ? (field.value as CustomerRole)
                            : undefined
                        }
                      >
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Ruolo</SelectLabel>
                            {customerRoleEnum
                              .filter((role) => role !== "Intestatario")
                              .map((role) => (
                                <SelectItem key={role} value={role}>
                                  {role}
                                </SelectItem>
                              ))}
                          </SelectGroup>
                        </SelectContent>
                      </Select>
                      <FormMessage className="text-red-400" />
                    </FormItem>
                  )}
                />
              </div>
            </div>
          </div>
        </form>
      </Form>
    </div>
  )
}
