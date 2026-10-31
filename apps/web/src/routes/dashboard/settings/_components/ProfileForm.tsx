import { useForm } from "react-hook-form"
import { Schema } from "effect"
import { useSearchParams } from "react-router"
import { useUpdateOperatorInfo } from "@/api/me"
import { Button } from "@/components/ui/button"
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { toast } from "sonner"
import { Required, schemaResolver } from "@/lib/form"
import { useRouter } from "@/lib/navigation"

/** A name or a surname: the limits of `ProfileForm` of the Next.js app */
const NamePart = Required(Schema.String).check(
  Schema.isMinLength(2, { message: "Almeno 2 caratteri" }),
  Schema.isMaxLength(255, { message: "Al massimo 255 caratteri" })
)

const profileSchema = Schema.Struct({ name: NamePart, surname: NamePart })

type ProfileValues = typeof profileSchema.Encoded

/**
 * The own name and surname, as `ProfileForm` of the Next.js app, in a card:
 * at the first access (`?firstTime=true`) saving them opens the dashboard,
 * otherwise it says they are saved. A failed save says why in the toast
 */
export const ProfileForm = ({
  operator,
}: {
  operator: { name: string | null; surname: string | null }
}) => {
  const [searchParams] = useSearchParams()
  const isFirstTime = searchParams.get("firstTime") === "true"
  const router = useRouter()
  // `values`: the form takes the operator again when it changes
  const form = useForm<ProfileValues>({
    values: { name: operator.name ?? "", surname: operator.surname ?? "" },
    resolver: schemaResolver(profileSchema),
    mode: "onTouched",
  })
  const update = useUpdateOperatorInfo()

  const onSubmit = form.handleSubmit(async (values) => {
    try {
      await update.mutateAsync(values)
    } catch (_error) {
      // The toast of the failure is the one of every call
      return
    }
    if (isFirstTime) {
      router.push("/dashboard")
      return
    }
    toast.success("Profilo aggiornato", { duration: 1000 })
  })

  const pending = update.isPending
  return (
    <Form {...form}>
      <form onSubmit={(event) => void onSubmit(event)}>
        <Card>
          <CardHeader>
            <CardTitle>Dati personali</CardTitle>
            <CardDescription>
              Il nome con cui i colleghi ti vedono nelle note, nelle
              assegnazioni e nei filtri.
            </CardDescription>
          </CardHeader>
          <CardContent className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input autoComplete="given-name" {...field} />
                  </FormControl>
                  <FormMessage />
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
                    <Input autoComplete="family-name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </CardContent>
          <CardFooter className="justify-end border-t pt-6">
            <Button
              type="submit"
              disabled={pending || !form.formState.isDirty}
              aria-busy={pending}
            >
              {isFirstTime ? "Salva ed entra" : "Salva"}
            </Button>
          </CardFooter>
        </Card>
      </form>
    </Form>
  )
}
