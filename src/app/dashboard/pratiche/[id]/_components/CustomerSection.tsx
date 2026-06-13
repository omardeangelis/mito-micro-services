"use client"

import React, { useCallback } from "react"
import { Badge } from "@/components/ui/badge"
import { AccordionTrigger } from "@/components/ui/accordion"
import { useForm } from "react-hook-form"
import { z } from "zod"
import { zodResolver } from "@hookform/resolvers/zod"
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form"
import { Input } from "@/components/ui/input"
import { AccordionContent } from "@radix-ui/react-accordion"
import { Button } from "@/components/ui/button"
import { convertNullToUndefined } from "@/lib/utils/form"
import { useRouter } from "next/navigation"
import { updateCustomerPreviewAction } from "../_actions/updateCustomerPreview"
import { useFormState, useFormStatus } from "react-dom"
import {
  selectCustomerSchema,
  selectCustomerToPraticaSchema,
} from "@/lib/types/schemas"
import { useFormIssueManager } from "@/lib/hooks/useFormIssueManager"
import { BlackListBadge } from "@/app/dashboard/customers/_components/BlackListBadge"
import { InputWithCopy } from "@/components/custom/input/InputWithCopy"
import { type Nullable } from "@/lib/types"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"

const customerSchema = selectCustomerSchema.pick({
  id: true,
  name: true,
  surname: true,
  email: true,
  fiscalCode: true,
  vatCode: true,
  phoneNumber: true,
  operatorId: true,
  blackListStatus: true,
})

const customersToPraticaSchema = selectCustomerToPraticaSchema.pick({
  customerRole: true,
})

const schema = z.intersection(customerSchema, customersToPraticaSchema)

type DesiredCustomer = z.infer<typeof schema> & {
  operatorName?: Nullable<string>
  operatorSurname?: Nullable<string>
}

const formUpdatableFieldSchema = customerSchema.pick({
  id: true,
  email: true,
  phoneNumber: true,
})

type UpdatableField = z.infer<typeof formUpdatableFieldSchema>

export const CustomerSection = (props: DesiredCustomer) => {
  const { customerRole, id, email, phoneNumber, ...rest } = props
  const { role, operatorId } = useUserPreferenceContext((state) => state)
  const canEdit = role === "ADMIN" || operatorId === props.operatorId
  const form = useForm<UpdatableField>({
    defaultValues: {
      id,
      email,
      phoneNumber,
    },
    resolver: zodResolver(schema),
  })

  const router = useRouter()

  const handleProfileClick = useCallback(() => {
    router.push(`/dashboard/customers/${id}`)
  }, [router, id])

  const { pending } = useFormStatus()
  const [formState, formAction] = useFormState(updateCustomerPreviewAction, {
    message: "",
  })

  useFormIssueManager(formState)

  const hasChanged = form.formState.isDirty
  return (
    <div className="rounded-md bg-neutral-50 p-4 shadow-sm">
      <div className="flex w-full items-center justify-between rounded-md">
        <div className="flex w-full items-center gap-4">
          <h4 className="font-medium">Cliente</h4>
          <Badge variant="default">{customerRole}</Badge>
          <BlackListBadge state={props.blackListStatus} />
        </div>
        <div className="flex items-center gap-4">
          {canEdit ? (
            <Button
              form="customer-preview"
              type="submit"
              disabled={!hasChanged || pending || !canEdit}
            >
              Salva
            </Button>
          ) : null}

          <Button variant="secondary" onClick={handleProfileClick}>
            Vedi profilo
          </Button>
          <AccordionTrigger />
        </div>
      </div>
      <AccordionContent className="mt-4">
        <Form {...form}>
          <form action={formAction} id="customer-preview">
            <div className="flex items-center justify-between gap-6">
              <FormField
                control={form.control}
                name="id"
                render={({ field }) => (
                  <FormItem hidden className="w-full">
                    <FormControl>
                      <Input
                        type="number"
                        hidden
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
                defaultValue={rest.name}
                name="name"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Nome</FormLabel>
                    <FormControl>
                      <Input
                        disabled
                        className="w-full"
                        placeholder="Nome"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                defaultValue={rest.surname}
                name="surname"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Cognome</FormLabel>
                    <FormControl>
                      <Input
                        disabled
                        className="w-full"
                        placeholder="Cognome"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                defaultValue={rest.fiscalCode ?? rest.vatCode}
                name="fiscalCode"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Codice Fiscale</FormLabel>
                    <FormControl>
                      <InputWithCopy
                        disabled
                        canCopy
                        className="w-full"
                        placeholder="CF"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
            </div>
            <div className="flex items-center justify-between gap-6">
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Email</FormLabel>
                    <FormControl>
                      <InputWithCopy
                        className="w-full"
                        placeholder="Email"
                        canCopy
                        {...field}
                        value={convertNullToUndefined(field.value)}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="phoneNumber"
                render={({ field }) => (
                  <FormItem className="w-full">
                    <FormLabel>Telefono</FormLabel>
                    <FormControl>
                      <Input
                        className="w-full"
                        placeholder="Telefono"
                        {...field}
                        value={convertNullToUndefined(field.value)}
                      />
                    </FormControl>
                    <FormMessage className="text-red-400" />
                  </FormItem>
                )}
              />
              <FormItem className="w-full">
                <FormLabel>Operatore</FormLabel>
                <Input
                  defaultValue={
                    props.operatorName && props.operatorSurname
                      ? `${props.operatorName} ${props.operatorSurname}`
                      : "Non assegnato"
                  }
                  disabled
                />
              </FormItem>
            </div>
          </form>
        </Form>
      </AccordionContent>
    </div>
  )
}
