"use client"
import React, { type PropsWithChildren } from "react"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { z } from "zod"
import { Button } from "@/components/ui/button"
import {
  type Operator,
  insertCustomerSchema,
  type Customer,
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
import { DatePickerFormItem } from "@/components/custom/date-picker"
import { updateCustomerAction } from "../_actions/updateCustomer"
import { useFormState, useFormStatus } from "react-dom"
import { useFormIssueManager } from "@/lib/hooks/useFormIssueManager"
import { InputWithCopy } from "@/components/custom/input/InputWithCopy"
import { api } from "@/trpc/react"
import { useContactMutationFeedback } from "@/components/custom/contact/useContactMutationFeedback"
import { useRefreshAfterSave } from "@/components/custom/contact/useRefreshAfterSave"
import {
  canHandover,
  canSelfAssign,
  operatorDisplayName,
} from "@/lib/domain/contact/permissions"
import {
  CustomerHandoverDialog,
  type HandoverActiveContact,
} from "./CustomerHandoverDialog"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { sourceValues } from "@/server/db/schema/customers"
import { parseInputValue, parseStringToNumber } from "@/lib/utils/format"

const customerformSchema = insertCustomerSchema
  .pick({
    id: true,
    name: true,
    surname: true,
    email: true,
    phoneNumber: true,
    address: true,
    cap: true,
    comune: true,
    provincia: true,
    birthdayDate: true,
    reddito: true,
    occupazione: true,
    ambitoLavorativo: true,
    sede: true,
    source: true,
  })
  .merge(
    z.object({
      reddito: z
        .string()
        .optional()
        .refine(
          (val) => {
            // Se è vuoto o undefined, è valido (campo opzionale)
            if (!val || val === "") return true

            // Prova a parsare il valore
            const parsed = parseInputValue(val)

            // Se dopo il parsing è vuoto, significa che non era un numero valido
            if (!parsed || parsed === "") return false

            // Verifica che sia un numero valido
            const num = parseStringToNumber(parsed)
            return !isNaN(num) && isFinite(num)
          },
          {
            message: "Il reddito deve essere un numero valido",
          }
        )
        .transform((val) => {
          // Converti sempre il valore nel formato corretto (punto decimale)
          // Accetta anche virgola come separatore decimale
          if (!val || val === "") return undefined
          const parsed = parseInputValue(val)
          if (!parsed || parsed === "") return undefined
          const num = parseStringToNumber(parsed)
          if (isNaN(num) || !isFinite(num)) return undefined
          return parsed // Ritorna la stringa già parsata con punto decimale
        }),
    })
  )

type CustomerInput = z.infer<typeof customerformSchema>

type Props = PropsWithChildren<{
  customer: Customer
  availableOperators: Operator[]
  activeContact: HandoverActiveContact | null
}>

// Chiavi del form derivate dallo schema: una sola fonte di verità (niente lista da tenere a mano)
const CUSTOMER_FORM_COMPARE_KEYS = Object.keys(
  customerformSchema.shape
) as (keyof CustomerInput)[]

// Normalizza un valore per il confronto: valori "vuoti" equivalenti, date coerenti.
function normalizeValueForComparison(value: unknown): string {
  if (value === null || value === undefined) return ""
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
    resolver: zodResolver(customerformSchema),
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

  const { pending } = useFormStatus()
  const [formState, formAction] = useFormState(updateCustomerAction, {
    message: "",
    error: "",
  })

  // Questo assicura che dopo un salvataggio, i nuovi valori diventino i valori iniziali
  React.useEffect(() => {
    if (formState.message && !pending) {
      // Aggiorna i valori iniziali con i valori attuali del form
      const currentValues = form.getValues()
      initialValuesRef.current = currentValues
      // Resetta anche il form per sincronizzare dirtyFields
      form.reset(currentValues, { keepValues: true })
    }
  }, [formState.message, pending, form])

  const { refresh, refreshing } = useRefreshAfterSave()
  const { onError: onContactError } = useContactMutationFeedback({ refresh })
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
  const showSelfAssign = canSelfAssign(props.customer)

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

  // The refresh has landed: if the button is gone the focus goes to the
  // operator text
  React.useEffect(() => {
    if (refreshing || !focusAfterRefresh.current) return
    focusAfterRefresh.current = false
    focusHandoverOrigin()
  }, [refreshing, focusHandoverOrigin])

  const assignToYourself = api.customer.assignToYourself.useMutation({
    onSuccess: () => refresh(),
    // The toast gives the reason and the refresh shows the current operator
    onError: (error) => {
      onContactError(error)
    },
  })
  // The wait lasts until the refreshed operator is on screen
  const assigning = assignToYourself.isLoading || refreshing

  useFormIssueManager(formState)
  return (
    <div className="mt-8 rounded-md border bg-white p-4">
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          id="customer-form"
          action={formAction}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-medium">Anagrafica</h2>
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
                  <FormMessage className="text-red-400" />
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
                        <SelectTrigger className="bg-white">
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
                    <FormMessage className="text-red-400" />
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
                    className="h-auto px-0 text-neutral-400"
                    onClick={() => {
                      if (assigning) return
                      assignToYourself.mutate({ id: props.customer.id })
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
