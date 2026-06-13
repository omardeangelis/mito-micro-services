"use client"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { AccordionContent, AccordionTrigger } from "@/components/ui/accordion"
import {
  Fragment,
  useCallback,
  useOptimistic,
  useRef,
  useState,
  type ComponentProps,
} from "react"
import { api } from "@/trpc/react"
import { type Message, type Chat } from "@/lib/types/schemas"
import { Skeleton } from "@/components/ui/skeleton"
import { Input } from "@/components/ui/input"
import { useFormStatus } from "react-dom"
import { updateChatAction } from "../_actions/updateChat"
import { createChatAction } from "../_actions/createNewChat"
import { cn, formatDateAsDMHM } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { TrashIcon } from "lucide-react"
import { deleteMessageAction } from "../_actions/deleteMessage"
import { startTransition } from "react"
import { useParams, useRouter } from "next/navigation"

type MessageResponse = Pick<
  Message,
  "id" | "content" | "sendDate" | "operatorId"
>

type SectionProps = ComponentProps<"section">

type PraticaNotesSetcionProps = Pick<Chat, "id"> &
  Omit<SectionProps, "id"> & {
    messages: Pick<Message, "id" | "content" | "sendDate" | "operatorId">[]
    total: number
    limit: number
  }

export function PraticaActiveChat({
  id,
  limit,
  messages,
  total,
  ...rest
}: PraticaNotesSetcionProps) {
  const formRef = useRef<HTMLFormElement | null>(null)
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const params = useParams<{ id: string }>()
  const isCustomerPath = location.pathname.includes("customer")

  const router = useRouter()
  const incrementLimit = useCallback(() => {
    const url = new URL(location.href)
    url.searchParams.set("limit", String(limit + 5))
    // scroll to the bottom of the chat
    router.replace(url.toString(), {
      scroll: false,
    })
    scrollRef.current?.scrollIntoView({ behavior: "smooth", block: "end" })
  }, [limit, router])

  const { pending } = useFormStatus()
  const { data: operatorData } = api.operator.getUserOperator.useQuery()
  const updateCustomer = api.customer.updateLastEdit.useMutation()
  const updatePratica = api.pratiche.updateLastEdit.useMutation()

  const [optimisticMessage, setOptimisitcMessage] = useOptimistic(
    messages,
    (state, newState: MessageResponse) => [...state, newState]
  )

  const optimisticFormAction = useCallback(
    async (formData: FormData) => {
      const message = {
        id: optimisticMessage.length + 1,
        content: formData.get("content")! as string,
        sendDate: new Date(Date.now()),
        operatorId: operatorData!.id,
      } satisfies Pick<Message, "id" | "content" | "sendDate" | "operatorId">
      startTransition(() => {
        formRef.current?.reset()
      })
      setOptimisitcMessage(message)
      await updateChatAction(formData)
      if (isCustomerPath) {
        updateCustomer.mutate({ id: params.id })
      } else {
        updatePratica.mutate({ praticaId: params.id })
      }
    },
    [
      optimisticMessage.length,
      operatorData,
      setOptimisitcMessage,
      isCustomerPath,
      updateCustomer,
      params.id,
      updatePratica,
    ]
  )

  const disabled = pending

  return (
    <section {...rest}>
      <div className="rounded-md border border-neutral-200 p-4">
        <div className="flex w-full items-center justify-between">
          <div className="flex items-center gap-4">
            <h4 className="font-medium">Note</h4>
            <Badge variant="outline">
              {messages.length} / {total}
            </Badge>
          </div>
          <AccordionTrigger />
        </div>
        <AccordionContent>
          <div className="p-4">
            <div className="flex flex-col gap-4">
              {total > limit ? (
                <Button variant="link" onClick={incrementLimit}>
                  Carica altri messaggi
                </Button>
              ) : null}

              <div
                className="relative max-h-96 overflow-y-auto"
                ref={scrollRef}
              >
                {optimisticMessage.map((note, index, array) => (
                  <Fragment key={note.id}>
                    <PraticaNote {...note} />
                    {index !== array.length - 1 ? (
                      <hr
                        className="mb-2 border border-neutral-100"
                        key={index}
                      />
                    ) : null}
                  </Fragment>
                ))}
              </div>
            </div>
          </div>
          <form action={optimisticFormAction} ref={formRef}>
            <div className="mt-8 flex flex-col gap-6">
              <Textarea
                placeholder="Scrivi qua il tuo messaggio"
                name="content"
              />
              <Input type="hidden" name="chatId" value={id} />
            </div>
            <div className="mt-8 flex items-center justify-end gap-4">
              <Button
                disabled={disabled}
                type="submit"
                variant={disabled ? "disabled" : "default"}
              >
                Commenta
              </Button>
            </div>
          </form>
        </AccordionContent>
      </div>
    </section>
  )
}

type NewPraticaProps = SectionProps & {
  chat_owner_id: string
  type?: "pratica" | "customer"
}

export function PraticaNewChat({
  className,
  type = "customer",
  ...props
}: NewPraticaProps) {
  const [loading, setLoading] = useState(false)
  const handleCreateNewChat = useCallback(async () => {
    setLoading(true)
    const formdata = new FormData()
    formdata.append("id", props.chat_owner_id.toString())
    formdata.append("type", type)
    try {
      await createChatAction(formdata)
    } catch (error) {
      console.error(error)
    } finally {
      setLoading(false)
    }
  }, [props, type])
  if (!loading)
    return (
      <section className={cn("bg-white shadow-sm", className)} {...props}>
        <div className="rounded-md border border-neutral-200 p-8">
          <div className="-w-full flex items-center justify-between">
            <h4 className="font-medium">Inizia una nuova chat</h4>
            <Button
              onClick={handleCreateNewChat}
              disabled={loading}
              variant={loading ? "disabled" : "outline"}
            >
              {loading ? "Caricamento..." : "Avvia una chat"}
            </Button>
          </div>
        </div>
      </section>
    )
  return <Skeleton className="h-20 w-full rounded-lg" />
}

type PraticaNoteProps = Omit<Message, "chatId" | "notifyDate">

const PraticaNote = (props: PraticaNoteProps) => {
  const { data, isLoading } = api.operator.getOperatorById.useQuery({
    id: Number(props.operatorId),
  })
  const params = useParams<{ id: string }>()
  const isCustomerPath = location.pathname.includes("customer")
  const updateCustomer = api.customer.updateLastEdit.useMutation()
  const updatePratica = api.pratiche.updateLastEdit.useMutation()

  const [show, setShow] = useState(false)
  const handleDelete = useCallback(async () => {
    setShow(false)
    const formData = new FormData()
    formData.append("id", props.id.toString())
    formData.append("operatorId", props.operatorId.toString())
    await deleteMessageAction(formData)
    if (isCustomerPath) {
      updateCustomer.mutate({ id: params.id })
    } else {
      updatePratica.mutate({ praticaId: params.id })
    }
  }, [
    isCustomerPath,
    params.id,
    props.id,
    props.operatorId,
    updateCustomer,
    updatePratica,
  ])
  if (data && !isLoading)
    return (
      <article
        className="relative flex w-full items-center gap-4 py-4"
        onMouseEnter={() => setShow(true)}
        onMouseLeave={() => setShow(false)}
      >
        <Avatar className="bg-neutral-400" />
        <div className="flex flex-col justify-between">
          <div className="flex w-full items-center gap-4">
            <h6 className="text-lg font-medium">
              {data?.name} {data.surname}
            </h6>
            <p className="text-sm text-muted-foreground">
              {formatDateAsDMHM(props.sendDate)}
            </p>
          </div>
          <p className="text-md text-muted-foreground">{props.content}</p>
        </div>
        {show && (
          <div className="absolute right-0 top-0 flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={handleDelete}>
              <TrashIcon size={16} />
            </Button>
          </div>
        )}
      </article>
    )
  return <Skeleton className="w-30 h-10" />
}
