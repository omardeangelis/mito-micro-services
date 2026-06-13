"use client"

import z from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import { useForm } from "react-hook-form"

import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { convertNullToUndefined } from "@/lib/utils/form"
import { type Operator } from "@/lib/types/schemas"
import { Button } from "@/components/ui/button"
import { useFormState, useFormStatus } from "react-dom"
import { updateOperatorInfo } from "../_actions/updateOperatorInfo"
import { useManualFormIssueManager } from "@/lib/hooks/useFormIssueManager"
import { useEffect } from "react"
import { useRouter, useSearchParams } from "next/navigation"

type OperatorForm = z.infer<z.ZodType<Operator>>

const formSchema = z.object({
  name: z.string().min(2).max(255),
  surname: z.string().min(2).max(255),
})

export const ProfileForm = ({
  operator,
}: {
  operator: Pick<Operator, "name" | "surname">
}) => {
  const router = useRouter()
  const searchParams = useSearchParams()
  const isFirstTime = searchParams.get("firstTime") === "true"
  const form = useForm<OperatorForm>({
    defaultValues: operator,
    resolver: zodResolver(formSchema),
    mode: "onTouched",
  })

  // FIX: Reset form quando cambiano i dati operator
  useEffect(() => {
    form.reset(operator)
  }, [operator, operator.name, operator.surname, form])

  const { pending } = useFormStatus()
  const [formState, formAction] = useFormState(updateOperatorInfo, {
    message: "",
  })

  const { manageIssues } = useManualFormIssueManager(formState)

  useEffect(() => {
    if (isFirstTime && formState.message) {
      router.push("/dashboard")
    } else {
      manageIssues()
    }
  }, [formState.message, isFirstTime, router, manageIssues])

  return (
    <div>
      <Form {...form}>
        <form className="flex flex-col gap-4" action={formAction}>
          <FormField
            control={form.control}
            name="name"
            render={({ field }) => {
              return (
                <FormItem>
                  <FormLabel>Nome Operatore</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={convertNullToUndefined(field.value)}
                    />
                  </FormControl>
                </FormItem>
              )
            }}
          />
          <FormField
            control={form.control}
            name="surname"
            render={({ field }) => {
              return (
                <FormItem>
                  <FormLabel>Cognome Operatore</FormLabel>
                  <FormControl>
                    <Input
                      {...field}
                      value={convertNullToUndefined(field.value)}
                    />
                  </FormControl>
                </FormItem>
              )
            }}
          />
          <Button
            type="submit"
            disabled={
              pending || Object.keys(form.formState.dirtyFields).length === 0
            }
            aria-disabled={pending}
          >
            Aggiorna
          </Button>
        </form>
      </Form>
    </div>
  )
}
