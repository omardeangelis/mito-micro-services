import { useForm } from "react-hook-form"
import { Schema } from "effect"
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
import React, { useCallback } from "react"
import { useHistoryBack } from "@/lib/hooks/useHistoryBack"
import {
  SelectContent,
  SelectLabel,
  SelectValue,
  Select,
  SelectGroup,
  SelectTrigger,
  SelectItem,
} from "@/components/ui/select"
import {
  getAllProductLabels,
  getProductKey,
} from "@mito/domain/constants/productMap"
import { PracticeState } from "@mito/contract/customer"
import { emailPattern, type NewPratica } from "@mito/contract/pratiche"
import { nanoid } from "nanoid"
import { DatePickerFormItem } from "@/components/custom/date-picker"
import { useRouter } from "@/lib/navigation"
import { useFindCustomersByCode, useSedi } from "@/api/customer"
import { useCreatePratica, useRegions } from "@/api/pratiche"
import { describeApiError } from "@/api/errors"
import { Required, schemaResolver } from "@/lib/form"
import { CheckCircle } from "lucide-react"
import { codeIssues, column } from "../../_lib/customerForm"

type CustomerSaveResponse = Promise<{
  success: 0 | 1
  error: string
}>

type CustomerSave = (
  customer: NewRelatedCustomerFormValues
) => CustomerSaveResponse

/**
 * A customer added to the practice: its values once its form is saved, as
 * `createPratica` takes them
 */
type RelatedCustomerEntry = {
  id: string
  values?: NewRelatedCustomerFormValues
}

// The form of the Next.js app, with the limits of `insertPracticeSchema`: the
// amounts and the instalments as the user types them
const schema = Schema.Struct({
  customerID: Schema.String,
  praticaId: Required(Schema.String).check(Schema.isMaxLength(255)),
  productId: Required(Schema.String),
  state: Required(PracticeState),
  importoFinanziato: Required(Schema.String),
  importoErogato: Required(Schema.String),
  importoRichiesto: Required(Schema.String),
  dataLiquidazione: Required(Schema.Date),
  dataEstinzione: Schema.optional(Schema.Date),
  rateTotali: Required(Schema.String).check(
    Schema.makeFilter((value) => !isNaN(parseInt(value)), {
      message: "Deve essere un numero",
    })
  ),
  ratePagate: Schema.optional(Schema.String),
  importoRata: Required(Schema.String),
  tassoPratica: Schema.optional(Schema.String),
  desPuntoVendita: column(255),
  region: column(100),
  desConvenzionato: column(255),
})

type FormValues = typeof schema.Encoded

function convertNullToUndefined<T>(value: T | null): T | undefined {
  return value ?? undefined
}

/** The sedi and the regions the selects offer: the form waits for them */
export default function NewPraticaForm({ customerID }: { customerID: string }) {
  const { data: availableSede } = useSedi({ required: true })
  const { data: availableRegion } = useRegions()
  if (availableSede === undefined || availableRegion === undefined)
    return <div>...Loading</div>
  return (
    <NewPraticaFormFields
      customerID={customerID}
      availableSede={availableSede}
      availableRegion={availableRegion}
    />
  )
}

function NewPraticaFormFields({
  customerID,
  availableSede,
  availableRegion,
}: {
  customerID: string
  availableSede: readonly { sede: string | null }[]
  availableRegion: readonly { region: string | null }[]
}) {
  const form = useForm<FormValues>({
    resolver: schemaResolver(schema),
    defaultValues: {
      customerID,
      dataLiquidazione: new Date(Date.now()),
    },
  })
  const goBack = useHistoryBack()
  const getCustomer = useFindCustomersByCode()
  const createPratica = useCreatePratica()

  const praticaStateOptions = PracticeState.literals

  const hasChanged = form.formState.isDirty

  const [relatedCustomers, setRelatedCustomers] = React.useState<
    RelatedCustomerEntry[]
  >([])

  const router = useRouter()

  const handleSubmit = form.handleSubmit(
    async (values) => {
      const saved = relatedCustomers.flatMap((c) =>
        c.values ? [c.values] : []
      )
      // A customer never saved has no values to send: the Next.js app sent
      // its empty fields, and the server refused them
      if (saved.length < relatedCustomers.length)
        return form.setError("praticaId", {
          message: "Salva o rimuovi i clienti aggiunti",
        })
      const { customerID: _, ...pratica } = values
      const data = {
        pratica: {
          ...pratica,
          productId: getProductKey(pratica.productId),
          rateTotali: parseInt(pratica.rateTotali),
          ratePagate: pratica.ratePagate ? parseInt(pratica.ratePagate) : 0,
        },
        customerId: customerID,
        relatedCustomers: saved.map((c) => ({
          ...c,
          source: "spontaneo",
          uniqueHash: nanoid(),
        })),
      } satisfies NewPratica
      try {
        await createPratica.mutateAsync(data)
      } catch (error) {
        return form.setError("praticaId", {
          message: describeApiError(
            error as Parameters<typeof describeApiError>[0]
          ),
        })
      }
      router.replace(`/dashboard/customers/${customerID}`)
    },
    (error) => {
      console.error(error)
    }
  )

  const addRelatedCustomer = () => {
    setRelatedCustomers((prev) => [...prev, { id: nanoid() }])
  }

  const deleteRelatedCustomer = useCallback((id: string) => {
    setRelatedCustomers((prev) => prev.filter((customer) => customer.id !== id))
  }, [])

  // A saved customer opened again with "Modifica" is unsaved until it is
  // saved again: the Next.js app sent its old values
  const editRelatedCustomer = useCallback((id: string) => {
    setRelatedCustomers((prev) =>
      prev.map((c) => (c.id === id ? { id: c.id } : c))
    )
  }, [])

  const onCustomerSave = useCallback(
    async (customer: NewRelatedCustomerFormValues): CustomerSaveResponse => {
      const data = await getCustomer({
        fiscalCode: customer.fiscalCode,
        vatCode: customer.vatCode,
        tempID: customer.tempID,
      })
      if (data[0]) {
        return {
          success: 0,
          error: "Cliente già presente",
        }
      }
      setRelatedCustomers((prev) =>
        prev.map((c) => (c.id === customer.id ? { ...c, values: customer } : c))
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
                            value={
                              // An empty value is none too, as in the Next.js app
                              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                              field.value ? field.value : undefined
                            }
                            defaultValue={
                              availableSede[0] ? availableSede[0].sede! : ""
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
                            value={
                              // An empty value is none too, as in the Next.js app
                              // eslint-disable-next-line @typescript-eslint/prefer-nullish-coalescing
                              field.value ? field.value : undefined
                            }
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
                            <SelectContent>
                              <SelectGroup>
                                <SelectLabel>Ruolo</SelectLabel>
                                {availableRegion
                                  .filter((role) => role.region)
                                  .map((role) => (
                                    <SelectItem
                                      key={role.region}
                                      value={
                                        role.region ??
                                        availableRegion[0]!.region!
                                      }
                                    >
                                      {role.region}
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
          onEdit={editRelatedCustomer}
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

/** A fiscal code or a VAT code of `length` characters, or none */
const code = (length: number) =>
  Schema.optional(
    Schema.String.check(
      Schema.isMinLength(length, {
        message: `Deve avere almeno ${length} caratteri`,
      }),
      Schema.isMaxLength(length, {
        message: `Deve avere al massimo ${length} caratteri`,
      })
    )
  )

// The related customer of the Next.js app, with the limits of
// `insertCustomerSchema`: one between the VAT code and the fiscal code
const newRelatedCustomerSchema = Schema.Struct({
  id: Schema.String,
  name: column(255),
  surname: column(255),
  phoneNumber: column(20),
  tempID: Required(Schema.String).check(Schema.isMaxLength(255)),
  role: Required(Schema.Literals(["Coobbligato", "Garante"])),
  email: Required(Schema.String).check(
    Schema.isPattern(emailPattern, { message: "Invalid email" })
  ),
  fiscalCode: code(16),
  vatCode: code(11),
}).check(codeIssues)

type NewRelatedCustomerFormValues = typeof newRelatedCustomerSchema.Encoded

const relatedRoles = ["Coobbligato", "Garante"] as const

type NewRelatedCustomerFormListProps = {
  customers: RelatedCustomerEntry[]
  onDelete: (id: string) => void
  onEdit: (id: string) => void
  onCustomerSave: CustomerSave
}

const NewRelatedCustomerFormList = ({
  customers,
  onDelete,
  onEdit,
  onCustomerSave,
}: NewRelatedCustomerFormListProps) => {
  return (
    <div className="bg-background">
      <div className="flex flex-col">
        {customers.map((customer) => (
          // By its id: a removed customer takes its form with it
          <div key={customer.id}>
            <div className="h-6 w-full bg-background" />
            <NewRelatedCustomerForm
              onDelete={onDelete}
              onEdit={onEdit}
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
  onEdit,
  customers,
  onCustomerSave,
}: {
  customers: RelatedCustomerEntry
  onDelete: (id: string) => void
  onEdit: (id: string) => void
  onCustomerSave: CustomerSave
}) => {
  const form = useForm<NewRelatedCustomerFormValues>({
    defaultValues: {
      id: customers.id,
    },
    resolver: schemaResolver(newRelatedCustomerSchema),
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
            <Button
              variant="default"
              onClick={() => {
                setSaved(false)
                onEdit(customers.id)
              }}
            >
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
                onClick={() => onDelete(customers.id)}
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
            defaultValue={customers.id}
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
                        value={field.value ? field.value : undefined}
                      >
                        <FormControl>
                          <SelectTrigger className="bg-white">
                            <SelectValue />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectGroup>
                            <SelectLabel>Ruolo</SelectLabel>
                            {relatedRoles.map((role) => (
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
