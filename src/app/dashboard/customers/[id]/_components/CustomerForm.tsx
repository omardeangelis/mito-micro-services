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
import { assignToYouAction } from "../_actions/assignToYou"
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
    operatorId: true,
    sede: true,
    source: true,
  })
  .merge(
    z.object({
      operatorId: z.string().optional(),
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
      operatorId: props.customer.operatorId?.toString() ?? "",
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

  const getOperatorName = React.useCallback(
    (id: number) => {
      const operator = props.availableOperators.find((t) => t.id === id)
      return operator ? `${operator.name} ${operator.surname}` : ""
    },
    [props.availableOperators]
  )

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
          <div className="grid grid-cols-3 items-end gap-4">
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
            <FormField
              control={form.control}
              name="operatorId"
              render={({ field: { ref: _, ...field } }) => (
                <FormItem className="w-full bg-white">
                  <div className="flex items-center justify-between">
                    <FormLabel>Operatore</FormLabel>
                    {props.customer.operatorId ? null : (
                      <Button
                        size="sm"
                        variant="link"
                        type="button"
                        className="text-neutral-400"
                        onClick={async (e) => {
                          e.preventDefault()
                          form.setValue("operatorId", operatorId?.toString())
                          await assignToYouAction(props.customer.id)
                        }}
                      >
                        Assegna a te
                      </Button>
                    )}
                  </div>
                  <Select {...field} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger className="bg-white">
                        <SelectValue>
                          {getOperatorName(Number(field.value))}
                        </SelectValue>
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      <SelectGroup>
                        <SelectLabel>Operatore</SelectLabel>
                        {props.availableOperators
                          .filter(
                            (o) => Number(form.watch("operatorId")) !== o.id
                          )
                          .map((operator) => (
                            <SelectItem
                              key={operator.id}
                              value={operator.id.toString()}
                            >
                              {operator.name} {operator.surname}
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
              name="operatorId"
              control={form.control}
              render={({ field }) => (
                <FormItem className="w-full" hidden>
                  <FormControl hidden>
                    <Input
                      className="w-full"
                      placeholder="ID Pratica"
                      {...field}
                      value={field.value ?? ""}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </div>
  )
}
