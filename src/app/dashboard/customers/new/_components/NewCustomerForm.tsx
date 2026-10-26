"use client"
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
import { insertCustomerSchema } from "@mito/domain/schemas"
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
import { nanoid } from "nanoid"
import { sourceValues } from "@mito/db/schema/index"
import { api } from "@/trpc/react"
import { useRouter } from "next/navigation"
import {
  parseInputValue,
  parseStringToNumber,
  sanitizeRedditoValue,
} from "@/lib/utils/format"

const customerformSchema = insertCustomerSchema
  .pick({
    id: true,
    name: true,
    surname: true,
    email: true,
    phoneNumber: true,
    fiscalCode: true,
    vatCode: true,
    address: true,
    cap: true,
    comune: true,
    provincia: true,
    birthdayDate: true,
    reddito: true,
    fileName: true,
    occupazione: true,
    ambitoLavorativo: true,
    tempID: true,
    uniqueHash: true,
    sede: true,
    source: true,
  })
  .merge(
    z.object({
      id: z.string(),
      sede: z.string(),
      fiscalCode: z
        .string()
        .min(16, "Almeno 16 caratteri")
        .max(16, "Al massimo 16 caratteri"),
      vatCode: z
        .string()
        .min(11, "Almeno 11 caratteri")
        .max(11, "Al massimo 11 caratteri"),
      birthdayDate: z.date().optional(),
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

type CustomerInput = z.infer<typeof customerformSchema>

export const NewCustomerForm = () => {
  const form = useForm<CustomerInput>({
    resolver: zodResolver(customerformSchema),
    defaultValues: {
      id: nanoid(),
      uniqueHash: nanoid(),
      fileName: "Nessuno",
    },
  })

  const pending = form.formState.isSubmitting

  // FIX: Usa dirtyFields invece di isDirty per maggiore affidabilità
  const hasFormChanged = Object.keys(form.formState.dirtyFields).length > 0

  const createCustomer = api.customer.insertCustomer.useMutation()
  const router = useRouter()
  const getCustomer =
    // eslint-disable-next-line @typescript-eslint/unbound-method
    api.useUtils().customer.getCustomersByFiscalCodeOrVatCode.ensureData

  const onSubmit = form.handleSubmit(
    async (data) => {
      const existing = await getCustomer({
        fiscalCode: data.fiscalCode,
        vatCode: data.vatCode,
        tempID: data.tempID,
      })
      if (existing.length > 0) {
        // Segna solo i codici che appartengono già a un cliente. Il codice
        // fiscale torna dal database con gli spazi del char(16), da cui il trim
        for (const code of ["tempID", "fiscalCode", "vatCode"] as const) {
          const value = data[code]?.trim()
          if (
            value &&
            existing.some((customer) => customer[code]?.trim() === value)
          )
            form.setError(code, {
              message: "Cliente già esistente",
            })
        }
        return
      }

      try {
        // Il valore reddito è già stato trasformato e validato dallo schema Zod
        // sanitizeRedditoValue è una doppia sicurezza
        const result = await createCustomer.mutateAsync({
          ...data,
          reddito: sanitizeRedditoValue(data.reddito),
        })
        const id = result[0]?.id
        router.replace(`/dashboard/customers/${id}`)
      } catch (_error) {
        form.setError("root", {
          message: "Errore durante la creazione del cliente",
        })
      }
    },
    (errors) => {
      // Gestisci errori di validazione
      // Gli errori vengono già mostrati automaticamente dal FormMessage
      console.log("Validation errors:", errors)
    }
  )

  return (
    <div>
      <Form {...form}>
        <form
          className="flex flex-col gap-4"
          id="customer-form"
          onSubmit={onSubmit}
        >
          <div className="flex items-center justify-between">
            <h2 className="text-lg">Nuovo cliente</h2>
            <Button
              disabled={!hasFormChanged || pending || createCustomer.isLoading}
              variant={
                hasFormChanged && !pending && !createCustomer.isLoading
                  ? "default"
                  : "disabled"
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
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="surname"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Cognome</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </div>
            <FormField
              control={form.control}
              name="email"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Email</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="fiscalCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Codice Fiscale</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? undefined} />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="vatCode"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Partita IVA</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? undefined} />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 gap-4">
            <FormField
              control={form.control}
              name="phoneNumber"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Telefono</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
            <FormField
              control={form.control}
              name="address"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Indirizzo</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage className="text-red-400" />
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
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="comune"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Comune</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </div>
          </div>
          <div className="grid grid-cols-3 items-baseline gap-4">
            <div className="grid grid-cols-2 items-baseline gap-2">
              <FormField
                control={form.control}
                name="provincia"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Provincia</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="sede"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Sede</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              <FormField
                control={form.control}
                name="source"
                render={({ field }) => (
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
              <FormField
                control={form.control}
                name="tempID"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Codice Cliente (NDG)</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="birthdayDate"
              render={({ field }) => (
                <DatePickerFormItem
                  fieldValue={field.value}
                  onChange={field.onChange}
                  label="Data di nascita"
                  disabled={(date) => date < new Date("1900-01-01")}
                  fromYear={1980}
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
                      placeholder="ID Pratica"
                      {...field}
                      value={field.value?.toString()}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
          </div>
          <div className="grid grid-cols-3 items-end gap-4">
            <div className="grid grid-cols-2 gap-2">
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
                name="occupazione"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Occupazione</FormLabel>
                    <FormControl>
                      <Input {...field} value={field.value ?? ""} />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="ambitoLavorativo"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Ambito</FormLabel>
                  <FormControl>
                    <Input {...field} value={field.value ?? ""} />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
          </div>
        </form>
      </Form>
    </div>
  )
}
