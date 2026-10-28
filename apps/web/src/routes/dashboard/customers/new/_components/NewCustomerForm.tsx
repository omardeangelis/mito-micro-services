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
import { CustomerSource } from "@mito/contract/customer"
import { useFindCustomersByCode, useInsertCustomer } from "@/api/customer"
import { useRouter } from "@/lib/navigation"
import { Required, schemaResolver } from "@/lib/form"
import { sanitizeRedditoValue } from "@mito/client/format"
import { codeIssues, column, redditoValue } from "../../_lib/customerForm"

const sourceValues = CustomerSource.literals

// The form of the Next.js app, with the limits of `insertCustomerSchema`:
// one between the fiscal code and the VAT code, the reddito a number
const customerformSchema = Schema.Struct({
  id: Schema.String,
  name: column(255),
  surname: column(255),
  email: column(255),
  phoneNumber: column(20),
  fiscalCode: Schema.optional(
    Schema.String.check(
      Schema.isMinLength(16, { message: "Almeno 16 caratteri" }),
      Schema.isMaxLength(16, { message: "Al massimo 16 caratteri" })
    )
  ),
  vatCode: Schema.optional(
    Schema.String.check(
      Schema.isMinLength(11, { message: "Almeno 11 caratteri" }),
      Schema.isMaxLength(11, { message: "Al massimo 11 caratteri" })
    )
  ),
  address: column(255),
  cap: column(5),
  comune: column(100),
  provincia: column(100),
  birthdayDate: Schema.optional(Schema.Date),
  reddito: redditoValue,
  fileName: column(255),
  occupazione: column(255),
  ambitoLavorativo: column(255),
  tempID: Required(Schema.String).check(Schema.isMaxLength(255)),
  uniqueHash: Required(Schema.String).check(Schema.isMaxLength(255)),
  sede: Required(Schema.String),
  source: Required(CustomerSource),
}).check(codeIssues)

type CustomerInput = typeof customerformSchema.Encoded

export const NewCustomerForm = () => {
  const form = useForm<CustomerInput>({
    resolver: schemaResolver(customerformSchema),
    defaultValues: {
      id: nanoid(),
      uniqueHash: nanoid(),
      fileName: "Nessuno",
    },
  })

  const pending = form.formState.isSubmitting

  // FIX: Usa dirtyFields invece di isDirty per maggiore affidabilità
  const hasFormChanged = Object.keys(form.formState.dirtyFields).length > 0

  const createCustomer = useInsertCustomer()
  const router = useRouter()
  const getCustomer = useFindCustomersByCode()

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
        // Il valore reddito è già stato validato dallo schema
        // sanitizeRedditoValue lo porta al punto decimale
        const result = await createCustomer.mutateAsync({
          ...data,
          reddito: sanitizeRedditoValue(data.reddito),
        })
        const id = result[0]?.id
        router.replace(`/dashboard/customers/${id}`)
      } catch (_error) {
        // Il toast dice il motivo
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
              disabled={!hasFormChanged || pending || createCustomer.isPending}
              variant={
                hasFormChanged && !pending && !createCustomer.isPending
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
                          // La conversione avverrà al submit
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
