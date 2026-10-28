import React from "react"
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
import { Button } from "@/components/ui/button"
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
  type ProductMapKey,
  getProductLabel,
} from "@mito/domain/constants/productMap"
import { currencyFormatter, formatDateAsDMY } from "@mito/client/format"
import { PracticeState } from "@mito/contract/customer"
import { type Practice } from "@mito/contract/pratiche"
import { InputWithCopy } from "@/components/custom/input/InputWithCopy"
import { useToast } from "@/components/ui/use-toast"
import { useUpdatePracticeState } from "@/api/pratiche"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"

/** The practice, with the operator and the code of its holder */
export type PracticeFormValues = Practice & {
  intestatarioFiscalCode: string
  operatorId: number | undefined
}

type FormValues = { id: number; state: PracticeState }

/**
 * The general data of a practice, as `PraticaGeneralForm` of the Next.js app:
 * only the state changes, by the admin or the operator of the holder
 */
export function PracticeGeneralForm({
  initialValues,
}: {
  initialValues: PracticeFormValues
}) {
  const form = useForm<FormValues>({
    defaultValues: {
      id: initialValues.id,
      state: initialValues.state,
    },
  })

  // FIX: Reset form quando cambia la pratica (navigazione tra pratiche)
  React.useEffect(() => {
    form.reset({
      id: initialValues.id,
      state: initialValues.state,
    })
  }, [initialValues.state, initialValues.id, form])

  const { role, operatorId } = useUserPreferenceContext((state) => state)
  const canEdit = role === "ADMIN" || operatorId === initialValues.operatorId

  const goBack = useHistoryBack()

  const praticaStateOptions = React.useMemo(
    () => PracticeState.literals.filter((s) => initialValues.state !== s),
    [initialValues.state]
  )

  // FIX: Usa dirtyFields invece di isDirty per maggiore affidabilità
  const hasChanged = Object.keys(form.formState.dirtyFields).length > 0

  const { toast } = useToast()
  const updateState = useUpdatePracticeState()
  const pending = updateState.isPending
  // As the server action: then the practice is read again, and its new
  // state resets the form
  const onSubmit = form.handleSubmit(async ({ id, state }) => {
    try {
      await updateState.mutateAsync({ id, state })
    } catch (_error) {
      // Il toast dice il motivo
      return
    }
    toast({
      title: "Pratica aggiornata con successo",
      variant: "success",
      duration: 1000,
    })
  })

  return (
    <Form {...form}>
      <form onSubmit={onSubmit}>
        <div className="flex items-center justify-between">
          <div>
            <h4>Dettaglio Pratica</h4>
            {!canEdit ? (
              <span className="text-xs text-neutral-400">
                Modifica disabilitata: non sei l&apos;operatore assegnato
              </span>
            ) : null}
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
              disabled={!hasChanged || pending || !canEdit}
              variant={
                hasChanged && !pending && canEdit ? "default" : "disabled"
              }
              type="submit"
            >
              Modifica
            </Button>
          </div>
        </div>
        <div className="mt-8 flex flex-col gap-6">
          <div className="form-row">
            <FormField
              name="id"
              control={form.control}
              render={({ field }) => (
                <FormItem className="w-full" hidden>
                  <FormControl hidden>
                    <Input
                      className="w-full"
                      placeholder="ID Pratica"
                      {...field}
                    />
                  </FormControl>
                </FormItem>
              )}
            />
            <FormField
              name="praticaId"
              defaultValue={initialValues.praticaId}
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>ID Pratica</FormLabel>
                  <FormControl>
                    <InputWithCopy
                      className="w-full"
                      placeholder="ID Pratica"
                      canCopy
                      {...field}
                      disabled
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
            <FormField
              name="productId"
              defaultValue={
                // A practice may have no product: the Next.js app failed on it
                initialValues.productId
                  ? getProductLabel(initialValues.productId as ProductMapKey)
                  : ""
              }
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>Product</FormLabel>
                  <FormControl>
                    <Input
                      className="w-full"
                      placeholder="Product"
                      {...field}
                      disabled
                    />
                  </FormControl>
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
                        <SelectValue>{field.value}</SelectValue>
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
            <FormField
              defaultValue={initialValues.intestatarioFiscalCode}
              name="intestatarioFiscalCode"
              disabled
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>CF Intestatario</FormLabel>
                  <FormControl>
                    <Input
                      className="w-full"
                      placeholder="Codice Fiscale"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-2 gap-4">
              <FormField
                defaultValue={initialValues.importoFinanziato}
                name="importoFinanziato"
                disabled
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Importo Finanziato</FormLabel>
                    <FormControl>
                      <Input
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
                defaultValue={initialValues.importoErogato}
                name="importoErogato"
                disabled
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Importo Erogato</FormLabel>
                    <FormControl>
                      <Input
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

            <FormField
              defaultValue={formatDateAsDMY(initialValues.dataLiquidazione)}
              name="dataLiquidazione"
              disabled
              render={({ field }) => (
                <FormItem className="w-full">
                  <FormLabel>Data Liquidazione</FormLabel>
                  <FormControl>
                    <Input
                      className="w-full"
                      placeholder="Data Liquidazione"
                      {...field}
                    />
                  </FormControl>
                  <FormMessage className="text-red-400" />
                </FormItem>
              )}
            />
          </div>
          <div className="form-row">
            <div className="form-row">
              <FormField
                defaultValue={initialValues.importoRata}
                name="importoRata"
                disabled
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Importo Rata</FormLabel>
                    <FormControl>
                      <Input
                        className="w-full"
                        placeholder="Importo Rata"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />

              <FormField
                defaultValue={initialValues.rateTotali}
                name="rateTotali"
                disabled
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Rate Totali</FormLabel>
                    <FormControl>
                      <Input
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
                defaultValue={initialValues.ratePagate}
                name="ratePagate"
                disabled
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Rate Pagate</FormLabel>
                    <FormControl>
                      <Input
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

            <div className="w-full">
              <FormLabel>Importo Pagato</FormLabel>
              <Input
                className="mt-2 w-full"
                disabled
                title="Importo Pagato"
                defaultValue={currencyFormatter(
                  Number(initialValues.importoRata) * initialValues.ratePagate
                )}
              />
            </div>
            <div className="w-full">
              <FormLabel>Importo Richiesto</FormLabel>
              <Input
                className="mt-2 w-full"
                disabled
                title="Importo Pagato"
                defaultValue={currencyFormatter(
                  Number(initialValues.importoErogato)
                )}
              />
            </div>
          </div>
        </div>
      </form>
    </Form>
  )
}
