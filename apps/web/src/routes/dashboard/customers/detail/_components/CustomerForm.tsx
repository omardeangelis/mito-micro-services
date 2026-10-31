import React, { type PropsWithChildren } from "react"
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
import { type Customer, CustomerSource } from "@mito/contract/customer"
import { type Operator } from "@mito/contract/schemas"
import {
  SelectContent,
  SelectLabel,
  SelectValue,
  Select,
  SelectGroup,
  SelectTrigger,
  SelectItem,
} from "@/components/ui/select"
import { DatePickerFormItem } from "@/components/custom/date-picker"
import { InputWithCopy } from "@/components/custom/input/InputWithCopy"
import { toast } from "sonner"
import { useAssignToYourself, useUpdateCustomer } from "@/api/customer"
import { useRefreshAfterSave } from "@/components/custom/contact/useRefreshAfterSave"
import { focusIsLost } from "@/components/custom/contact/focus"
import {
  canHandover,
  canSelfAssign,
  operatorDisplayName,
} from "@mito/domain/contact/permissions"
import { cleanObject } from "@mito/domain/utils/object"
import {
  CustomerHandoverDialog,
  type HandoverActiveContact,
} from "./CustomerHandoverDialog"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { sanitizeRedditoValue } from "@mito/client/format"
import { Required } from "@/lib/form"
import { schemaResolver } from "@/lib/form"
import { column, redditoValue } from "../../_lib/customerForm"

const sourceValues = CustomerSource.literals

// The master data the form saves, with the limits of `insertCustomerSchema`
const customerformSchema = Schema.Struct({
  id: Schema.String,
  name: column(255),
  surname: column(255),
  email: column(255),
  phoneNumber: column(20),
  address: column(255),
  cap: column(5),
  comune: column(100),
  provincia: column(100),
  birthdayDate: Schema.optional(Schema.NullOr(Schema.Date)),
  reddito: redditoValue,
  occupazione: column(255),
  ambitoLavorativo: column(255),
  sede: column(255),
  source: Required(CustomerSource),
})

type CustomerInput = typeof customerformSchema.Encoded

type Props = PropsWithChildren<{
  customer: Customer
  availableOperators: readonly Operator[]
  activeContact: HandoverActiveContact | null
}>

// Chiavi del form derivate dallo schema: una sola fonte di verità (niente lista da tenere a mano)
const CUSTOMER_FORM_COMPARE_KEYS = Object.keys(
  customerformSchema.fields
) as (keyof CustomerInput)[]

// Normalizza un valore per il confronto: valori "vuoti" equivalenti, date coerenti.
function normalizeValueForComparison(value: unknown): string {
  if (value === null || value === undefined) return ""
  // The values of the form: strings, numbers and dates (R6, as in Next.js)
  // eslint-disable-next-line @typescript-eslint/no-base-to-string
  const s = typeof value === "string" ? value.trim() : String(value)
  if (s === "") return ""
  if (value instanceof Date) return value.toISOString().slice(0, 10) // YYYY-MM-DD
  // Stringhe che sembrano date (input type="date" o ISO) -> normalizza a YYYY-MM-DD
  if (typeof value === "string" && /^\d{4}-\d{2}-\d{2}/.test(s)) {
    return s.slice(0, 10)
  }
  if (typeof value === "object") return JSON.stringify(value)
  return s
}

// Ritorna true solo se almeno un campo del form è diverso dai valori iniziali.
// Confronta solo i campi in CUSTOMER_FORM_COMPARE_KEYS per evitare falsi positivi (es. focus).
function hasFormValuesChanged(
  currentValues: Partial<CustomerInput>,
  initialValues: Partial<CustomerInput>
): boolean {
  for (const key of CUSTOMER_FORM_COMPARE_KEYS) {
    const current = normalizeValueForComparison(currentValues[key])
    const initial = normalizeValueForComparison(initialValues[key])
    if (current !== initial) return true
  }
  return false
}

export const CustomerForm = (props: Props) => {
  const { role, operatorId } = useUserPreferenceContext((state) => state)
  const canEdit = role === "ADMIN" || operatorId === props.customer.operatorId

  // Prepara i valori iniziali normalizzati (solo quando cambia l'ID customer)
  const initialFormValues = React.useMemo<CustomerInput>(
    () => ({
      ...props.customer,
      reddito: props.customer.reddito ?? undefined,
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps -- dipendenza voluta solo su id per evitare reset inutili
    [props.customer.id]
  )

  // Traccia i valori iniziali con un ref (non cambiano durante il ciclo di vita del componente)
  const initialValuesRef = React.useRef<CustomerInput>(initialFormValues)

  // Aggiorna il ref solo quando cambia effettivamente il customer ID
  React.useEffect(() => {
    initialValuesRef.current = initialFormValues
  }, [initialFormValues])

  const form = useForm<CustomerInput>({
    resolver: schemaResolver(customerformSchema),
    defaultValues: initialFormValues,
  })

  // FIX: Reset form quando cambia il customer (navigazione tra clienti)
  React.useEffect(() => {
    form.reset(initialFormValues)
    // Aggiorna anche il ref quando resettiamo
    initialValuesRef.current = initialFormValues
  }, [props.customer.id, form, initialFormValues])

  // Non usiamo dirtyFields: al focus l’input non deve attivare il pulsante.
  const currentFormValues = form.watch()
  const hasFormChanged = React.useMemo(
    () => hasFormValuesChanged(currentFormValues, initialValuesRef.current),
    [currentFormValues]
  )

  const updateCustomer = useUpdateCustomer()
  const pending = updateCustomer.isPending

  // As the server action of the Next.js app: the empty fields keep their
  // value (`cleanObject`), a birthday left out is cleared. The operator
  // changes only through the handover (D13)
  const onSubmit = form.handleSubmit(async (data) => {
    const { id, birthdayDate, reddito, ...rest } = data
    try {
      await updateCustomer.mutateAsync({
        id,
        profile: {
          ...cleanObject(rest),
          source: rest.source,
          birthdayDate: birthdayDate ?? null,
          reddito: sanitizeRedditoValue(reddito),
        },
      })
    } catch (_error) {
      // Il toast dice il motivo
      return
    }
    toast.success("Cliente aggiornato con successo", { duration: 1000 })
    // Questo assicura che dopo un salvataggio, i nuovi valori diventino i
    // valori iniziali
    const currentValues = form.getValues()
    initialValuesRef.current = currentValues
    // Resetta anche il form per sincronizzare dirtyFields
    form.reset(currentValues, { keepValues: true })
  })

  const { refresh, refreshing } = useRefreshAfterSave()
  const customerOperator =
    props.customer.operatorId === null
      ? undefined
      : props.availableOperators.find((o) => o.id === props.customer.operatorId)
  const operatorLabel = customerOperator
    ? operatorDisplayName(customerOperator)
    : props.customer.operatorId === null
      ? "Non assegnato"
      : `Operatore ${props.customer.operatorId}`
  const showHandover =
    role !== undefined &&
    operatorId !== undefined &&
    canHandover({ operatorId, role }, props.customer)
  const showSelfAssign =
    role !== undefined &&
    operatorId !== undefined &&
    canSelfAssign({ operatorId, role }, props.customer, props.activeContact)

  const operatorTextRef = React.useRef<HTMLParagraphElement>(null)
  const handoverButtonRef = React.useRef<HTMLButtonElement>(null)
  const [handoverOpen, setHandoverOpen] = React.useState(false)
  // Set when the server answered the handover: after the refresh the button
  // may be gone, and the focus must not fall on the body
  const focusAfterRefresh = React.useRef(false)

  const focusHandoverOrigin = React.useCallback(() => {
    const button = handoverButtonRef.current
    const target =
      button && document.contains(button) ? button : operatorTextRef.current
    target?.focus()
  }, [])

  // Set when the server answered "Assegna a te": the link is gone after the
  // refresh either way, and the operator text says who has the customer now
  const focusOperatorAfterRefresh = React.useRef(false)

  // The refresh has landed: if the button is gone the focus goes to the
  // operator text
  React.useEffect(() => {
    if (refreshing) return
    // Only when the focus is lost: the user may have moved it meanwhile
    if (focusOperatorAfterRefresh.current) {
      focusOperatorAfterRefresh.current = false
      if (focusIsLost()) operatorTextRef.current?.focus()
    }
    if (!focusAfterRefresh.current) return
    focusAfterRefresh.current = false
    if (focusIsLost()) focusHandoverOrigin()
  }, [refreshing, focusHandoverOrigin])

  const assignToYourself = useAssignToYourself()
  // On success and on a rejection alike, even after an unmount: the toast of
  // the mutation gives the reason and the refresh shows the current operator
  const assign = () => {
    const settled = () => {
      focusOperatorAfterRefresh.current = true
      refresh()
    }
    assignToYourself
      .mutateAsync({ id: props.customer.id })
      .then(settled, settled)
  }
  // The wait lasts until the refreshed operator is on screen
  const assigning = assignToYourself.isPending || refreshing

  return (
    <div className="rounded-card mt-8 border border-border bg-card p-4">
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          id="customer-form"
          onSubmit={onSubmit}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Anagrafica</h2>
            <Button
              disabled={!hasFormChanged || pending || !canEdit}
              variant={
                hasFormChanged && !pending && canEdit ? "default" : "disabled"
              }
              type="submit"
              form="customer-form"
            >
              Salva
            </Button>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="id"
              render={({ field }) => (
                <FormItem hidden>
                  <FormLabel>Nome</FormLabel>
                  <Input {...field} value={field.value ?? ""} />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="name"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Nome</FormLabel>
                    <Input {...field} value={field.value ?? ""} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="surname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cognome</FormLabel>
                    <Input {...field} value={field.value ?? ""} />
                  </FormItem>
                )}
              />
            </div>
            {props.customer.fiscalCode ? (
              <FormField
                defaultValue={props.customer.fiscalCode}
                name="fiscalCode"
                disabled
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Codice Fiscale</FormLabel>
                    <InputWithCopy {...field} canCopy={true} />
                  </FormItem>
                )}
              />
            ) : (
              <FormField
                defaultValue={props.customer.vatCode}
                name="vatCode"
                disabled
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partita IVA</FormLabel>
                    <Input {...field} />
                  </FormItem>
                )}
              />
            )}

            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <Input {...field} value={field.value ?? ""} />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefono</FormLabel>
                  <Input {...field} value={field.value ?? ""} />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Indirizzo</FormLabel>
                  <Input {...field} value={field.value ?? ""} />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="cap"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>CAP</FormLabel>
                    <Input {...field} value={field.value ?? ""} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="comune"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comune</FormLabel>
                    <Input {...field} value={field.value ?? ""} />
                  </FormItem>
                )}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 items-baseline gap-4">
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="provincia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provincia</FormLabel>
                    <Input {...field} value={field.value ?? ""} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sede"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sede</FormLabel>
                    <Input {...field} value={field.value ?? ""} />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="reddito"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Reddito</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={field.value ?? ""}
                      placeholder="Es: 10000, 1000.50 o 1000,50"
                      onChange={(e) => {
                        // Permetti all'utente di digitare liberamente, anche con virgola
                        // La conversione avverrà al submit tramite lo schema Zod
                        field.onChange(e.target.value)
                      }}
                      onBlur={field.onBlur}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="birthdayDate"
              render={({ field }) => (
                <DatePickerFormItem
                  fieldValue={field.value}
                  onChange={field.onChange}
                  label="Data di nascita"
                />
              )}
            />
            <FormField
              name="birthdayDate"
              control={form.control}
              render={({ field }) => (
                <FormItem className="w-full" hidden>
                  <FormControl hidden>
                    <Input
                      className="w-full"
                      {...field}
                      value={field.value?.toString()}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-3 items-start gap-4">
            <FormField
              control={form.control}
              name="occupazione"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Occupazione</FormLabel>
                  <Input {...field} value={field.value ?? ""} />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="ambitoLavorativo"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ambito</FormLabel>
                    <Input {...field} value={field.value ?? ""} />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="source"
                render={({ field: { ref: _, ...field } }) => (
                  <FormItem>
                    <FormLabel>Provenienza</FormLabel>
                    <Select
                      {...field}
                      onValueChange={field.onChange}
                      value={field.value?.toString()}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue>
                            {field.value ?? "Seleziona"}
                          </SelectValue>
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectGroup>
                          <SelectLabel>Fonte</SelectLabel>
                          {sourceValues.map((source) => (
                            <SelectItem key={source} value={source}>
                              {source}
                            </SelectItem>
                          ))}
                        </SelectGroup>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex w-full flex-col gap-2">
              <span
                id="customer-operator-label"
                className="text-sm font-medium leading-none"
              >
                Operatore
              </span>
              <p
                ref={operatorTextRef}
                tabIndex={-1}
                aria-labelledby="customer-operator-label"
                className="flex h-10 items-center text-sm"
              >
                {operatorLabel}
              </p>
              <div className="flex flex-wrap items-center gap-2">
                {showSelfAssign ? (
                  <Button
                    size="sm"
                    variant="link"
                    type="button"
                    aria-disabled={assigning}
                    className="px-0 text-muted-foreground"
                    onClick={() => {
                      if (assigning) return
                      assign()
                    }}
                  >
                    Assegna a te
                  </Button>
                ) : null}
                {showHandover ? (
                  <Button
                    ref={handoverButtonRef}
                    size="sm"
                    variant="outline"
                    type="button"
                    onClick={() => setHandoverOpen(true)}
                  >
                    {props.customer.operatorId === null
                      ? "Assegna operatore"
                      : "Passaggio di consegne"}
                  </Button>
                ) : null}
              </div>
            </div>
          </div>
        </form>
      </Form>
      <CustomerHandoverDialog
        open={handoverOpen}
        onClose={({ settled }) => {
          setHandoverOpen(false)
          if (!settled) return
          focusAfterRefresh.current = true
        }}
        restoreFocus={focusHandoverOrigin}
        refresh={refresh}
        customer={props.customer}
        operators={props.availableOperators}
        activeContact={props.activeContact}
      />
    </div>
  )
}
