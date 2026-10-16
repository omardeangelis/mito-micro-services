"use client"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { AccordionContent, AccordionTrigger } from "@/components/ui/accordion"
import {
  Fragment,
  useCallback,
  useEffect,
  useId,
  useLayoutEffect,
  useRef,
  useState,
  memo,
  type ComponentProps,
  type FormEvent,
} from "react"
import { api } from "@/trpc/react"
import { type Message } from "@/lib/types/schemas"
import { Skeleton } from "@/components/ui/skeleton"
import { LoadingSpinner } from "@/components/custom/loading-spinner"
import { useSavingUntilRefreshed } from "@/components/custom/contact/useSavingUntilRefreshed"
import { updateChatAction } from "./_actions/updateChat"
import { deleteMessageAction } from "./_actions/deleteMessage"
import { cn, formatDateAsDMHM } from "@/lib/utils"
import { Badge } from "@/components/ui/badge"
import { TrashIcon } from "lucide-react"
import { useRouter } from "next/navigation"
import { useToast } from "@/components/ui/use-toast"
import {
  checkUnsentNote,
  openUnsentNote,
  refuseUnsentNote,
  sendUnsentNote,
  typeUnsentNote,
  useUnsentNote,
} from "./unsentNote"

type MessageResponse = Pick<
  Message,
  "id" | "content" | "sendDate" | "operatorId"
>

// A note sent and not yet drawn by the server. `id` is the one of the saved
// message, known once the action answers
type PendingNote = Omit<MessageResponse, "id"> & {
  key: string
  id?: number
}

// A pending note is done only when the message with its id arrives: the chat
// shows at most `limit` notes, and two notes can share a text
const isSaved = (note: PendingNote, messages: MessageResponse[]) =>
  note.id !== undefined && messages.some((m) => m.id === note.id)

const TRASH_LABEL = "Elimina nota"

// The list shows the newest notes, at the bottom. Instant: nothing scrolls
// with an animation (P6)
const scrollToBottom = (list: HTMLElement | null) => {
  if (list) list.scrollTop = list.scrollHeight
}

// The customer whose chat was just started here: its field takes the focus
// once the refreshed page draws the chat in place of "Avvia una chat"
let focusOnStart: string | null = null

type SectionProps = ComponentProps<"section">

type CustomerChatProps = {
  customerId: string
  chatId: number
  messages: MessageResponse[]
  total: number
  limit: number
} & Omit<SectionProps, "id">

export function CustomerChat({
  customerId,
  chatId,
  limit,
  messages,
  total,
  ...rest
}: CustomerChatProps) {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const fieldRef = useRef<HTMLTextAreaElement | null>(null)
  const pendingCounter = useRef(0)
  // Ignores a second submit before the first one re-renders
  const sendingRef = useRef(false)
  // The field and its unsent note, shared with every chat of the customer
  const { text: content, failed } = useUnsentNote(customerId)
  const failedId = useId()
  const [pending, setPending] = useState<PendingNote[]>([])
  // Read by screen readers: "Invio della nota", "Nota inviata", "Nota eliminata"
  const [announcement, setAnnouncement] = useState("")

  const waiting = pending.filter((note) => !isSaved(note, messages))
  // The note on its way to the server: it has no id until the action answers
  const sending = pending.some((note) => note.id === undefined)

  const router = useRouter()
  // Older notes appear at the top, next to the button: nothing scrolls
  const incrementLimit = useCallback(() => {
    const url = new URL(location.href)
    url.searchParams.set("limit", String(limit + 5))
    router.replace(url.toString(), {
      scroll: false,
    })
  }, [limit, router])

  const { toast } = useToast()
  const { data: operatorData } = api.operator.getUserOperator.useQuery()
  const operatorId = operatorData?.id
  const { mutate: touchCustomer } = api.customer.updateLastEdit.useMutation()

  // The note being deleted and its place among the saved notes: once the page
  // drops it, the focus moves to the trash of the note that takes its place
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const deletedRef = useRef<{ id: number; index: number } | null>(null)
  const handleDeleteStart = useCallback((id: number) => {
    const index = messagesRef.current.findIndex((m) => m.id === id)
    deletedRef.current = { id, index }
  }, [])
  const handleDeleted = useCallback(
    () => touchCustomer({ id: customerId }),
    [touchCustomer, customerId]
  )
  const handleDeleteFailed = useCallback(
    (id: number) => {
      if (deletedRef.current?.id === id) deletedRef.current = null
      toast({
        variant: "destructive",
        duration: 8000,
        description: "Nota non eliminata, riprova",
      })
    },
    [toast]
  )

  useEffect(() => {
    const deleted = deletedRef.current
    if (!deleted || messages.some((m) => m.id === deleted.id)) return
    deletedRef.current = null
    setAnnouncement("Nota eliminata")
    // Only when the focus was on the trash that is gone
    const focused = document.activeElement
    if (focused && focused !== document.body && focused.isConnected) return
    const trashes = scrollRef.current?.querySelectorAll<HTMLButtonElement>(
      `button[aria-label="${TRASH_LABEL}"]`
    )
    const next =
      trashes?.[deleted.index] ??
      trashes?.[deleted.index - 1] ??
      fieldRef.current
    next?.focus()
  }, [messages])

  // The list opens at the newest notes, and follows a note sent or arrived
  // While at the bottom the list stays there, also when the notes grow after
  // opening (names loaded); once the operator scrolls up it stays put
  const pinnedRef = useRef(true)
  const listRef = useCallback((list: HTMLDivElement | null) => {
    scrollRef.current = list
    pinnedRef.current = true
    scrollToBottom(list)
  }, [])
  const handleListScroll = useCallback(() => {
    const list = scrollRef.current
    if (!list) return
    pinnedRef.current =
      list.scrollTop + list.clientHeight >= list.scrollHeight - 4
  }, [])
  const resizeRef = useRef<ResizeObserver | null>(null)
  const contentRef = useCallback((content: HTMLDivElement | null) => {
    resizeRef.current?.disconnect()
    resizeRef.current = null
    if (!content || typeof ResizeObserver === "undefined") return
    resizeRef.current = new ResizeObserver(() => {
      if (pinnedRef.current) scrollToBottom(scrollRef.current)
    })
    resizeRef.current.observe(content)
  }, [])

  useEffect(() => {
    setPending((current) => {
      const remaining = current.filter((note) => !isSaved(note, messages))
      return remaining.length === current.length ? current : remaining
    })
  }, [messages])

  useEffect(() => openUnsentNote(customerId), [customerId])
  useEffect(() => {
    if (focusOnStart !== customerId) return
    focusOnStart = null
    fieldRef.current?.focus()
  }, [customerId])
  // In an effect, not in render: the server HTML and the first client render
  // must match. A note saved before a reload shows once the operator is known
  useEffect(() => {
    if (operatorId !== undefined) checkUnsentNote(customerId, operatorId)
  }, [customerId, operatorId])

  const rows = [
    ...messages.map((message) => ({
      ...message,
      key: message.id as number | string,
      sending: false,
    })),
    // A pending note has no trash: there is no message to delete yet
    ...waiting.map((note) => ({
      ...note,
      id: undefined,
      sending: note.id === undefined,
    })),
  ]
  const lastKey = rows.at(-1)?.key
  const scrolledKey = useRef(lastKey)
  useLayoutEffect(() => {
    if (scrolledKey.current === lastKey) return
    scrolledKey.current = lastKey
    pinnedRef.current = true
    scrollToBottom(scrollRef.current)
  }, [lastKey])

  const handleSubmit = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (sendingRef.current) return
    if (!operatorData) {
      // The text never left the field
      refuseUnsentNote(customerId)
      return
    }
    sendingRef.current = true
    setAnnouncement("Invio della nota")
    const { sent, settle } = sendUnsentNote(customerId)
    const key = `pending-${pendingCounter.current++}`
    setPending((current) => [
      ...current,
      {
        key,
        content: sent,
        sendDate: new Date(Date.now()),
        operatorId: operatorData.id,
      },
    ])
    const result = await updateChatAction({
      chatId,
      content: sent,
      customerId,
    }).catch(() => null)
    sendingRef.current = false
    // Anything but `{ ok: true }` failed: a rejection, `{ ok: false }`, or no
    // result at all (after a deploy Next resolves an unknown action without one)
    settle(result?.ok === true)
    setAnnouncement(result?.ok ? "Nota inviata" : "")
    if (result?.ok) {
      setPending((current) =>
        current.map((item) =>
          item.key === key ? { ...item, id: result.id } : item
        )
      )
      touchCustomer({ id: customerId })
    } else {
      setPending((current) => current.filter((item) => item.key !== key))
    }
  }

  return (
    <section {...rest}>
      <p role="status" className="sr-only">
        {announcement}
      </p>
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
                ref={listRef}
                onScroll={handleListScroll}
              >
                <div ref={contentRef}>
                  {rows.map((row, index) => (
                    <Fragment key={row.key}>
                      <CustomerNote
                        id={row.id}
                        content={row.content}
                        sendDate={row.sendDate}
                        operatorId={row.operatorId}
                        customerId={customerId}
                        sending={row.sending}
                        onDeleteStart={handleDeleteStart}
                        onDeleted={handleDeleted}
                        onDeleteFailed={handleDeleteFailed}
                      />
                      {index !== rows.length - 1 ? (
                        <hr className="mb-2 border border-neutral-100" />
                      ) : null}
                    </Fragment>
                  ))}
                </div>
              </div>
            </div>
          </div>
          <form onSubmit={handleSubmit}>
            <div className="mt-8 flex flex-col gap-6">
              <Textarea
                ref={fieldRef}
                placeholder="Scrivi qua il tuo messaggio"
                name="content"
                value={content}
                onChange={(event) =>
                  typeUnsentNote(customerId, event.target.value)
                }
                aria-describedby={failed ? failedId : undefined}
              />
              {failed ? (
                <p
                  id={failedId}
                  role="alert"
                  className="-mt-4 text-sm text-red-700"
                >
                  Nota non inviata, riprova
                </p>
              ) : null}
            </div>
            <div className="mt-8 flex items-center justify-end gap-4">
              <Button
                aria-busy={sending}
                aria-disabled={sending}
                type="submit"
                variant={sending ? "disabled" : "default"}
              >
                Commenta
                {sending ? (
                  <LoadingSpinner className="ml-2 h-4 w-4 motion-reduce:animate-none" />
                ) : null}
              </Button>
            </div>
          </form>
        </AccordionContent>
      </div>
    </section>
  )
}

type CustomerNewChatProps = {
  customerId: string
  className?: string
}

export function CustomerNewChat({
  customerId,
  className,
}: CustomerNewChatProps) {
  const failedId = useId()
  const [failed, setFailed] = useState(false)
  // Busy from the click until the refreshed page draws the chat in its place
  const { pending, start, fail, finishAfterRefresh } = useSavingUntilRefreshed()
  // `mutateAsync` settles after an unmount too
  const { mutateAsync: createChat } =
    api.chat.createNewCustomerChat.useMutation()

  const handleCreateNewChat = () => {
    if (pending) return
    setFailed(false)
    start()
    focusOnStart = customerId
    createChat({ customerId }).then(finishAfterRefresh, () => {
      focusOnStart = null
      fail()
      setFailed(true)
    })
  }

  return (
    <section className={cn("bg-white shadow-sm", className)}>
      <div className="rounded-md border border-neutral-200 p-8">
        <div className="flex items-center justify-between">
          <h4 className="font-medium">Inizia una nuova chat</h4>
          <Button
            onClick={handleCreateNewChat}
            variant="outline"
            aria-busy={pending}
            aria-disabled={pending}
            aria-describedby={failed ? failedId : undefined}
          >
            Avvia una chat
            {pending ? (
              <LoadingSpinner className="ml-2 h-4 w-4 motion-reduce:animate-none" />
            ) : null}
          </Button>
        </div>
        {failed ? (
          <p
            id={failedId}
            role="alert"
            className="mt-4 text-right text-sm text-red-700"
          >
            Chat non avviata, riprova
          </p>
        ) : null}
      </div>
    </section>
  )
}

// A note without `id` is still pending: there is no message to delete yet
type CustomerNoteProps = Omit<MessageResponse, "id"> & {
  id?: number
  customerId: string
  /** On its way to the server: "Invio…" in place of the date */
  sending: boolean
  onDeleteStart: (id: number) => void
  onDeleted: () => void
  onDeleteFailed: (id: number) => void
}

// Memoized: typing in the field re-renders the chat, not every note
const CustomerNote = memo(function CustomerNote({
  id,
  content,
  sendDate,
  operatorId,
  customerId,
  sending,
  onDeleteStart,
  onDeleted,
  onDeleteFailed,
}: CustomerNoteProps) {
  const { data, isLoading } = api.operator.getOperatorById.useQuery({
    id: Number(operatorId),
  })
  // Until the page drops the note: nothing is removed in advance (P6)
  const [deleting, setDeleting] = useState(false)

  const handleDelete = async () => {
    if (id === undefined || deleting) return
    setDeleting(true)
    onDeleteStart(id)
    const result = await deleteMessageAction({
      id,
      operatorId,
      customerId,
    }).catch(() => null)
    // Anything but `{ ok: true }` failed, as for a note sent
    if (result?.ok) {
      onDeleted()
    } else {
      setDeleting(false)
      onDeleteFailed(id)
    }
  }
  if (data && !isLoading)
    return (
      <article
        aria-busy={sending || deleting}
        className="group relative flex w-full items-center gap-4 py-4"
      >
        <Avatar className="bg-neutral-400" />
        <div className="flex flex-col justify-between">
          <div className="flex w-full items-center gap-4">
            <h6 className="text-lg font-medium">
              {data.name} {data.surname}
            </h6>
            {sending ? (
              <span className="flex items-center gap-1 text-sm text-muted-foreground">
                <LoadingSpinner
                  aria-hidden
                  className="h-3 w-3 motion-reduce:animate-none"
                />
                Invio…
              </span>
            ) : (
              <p className="text-sm text-muted-foreground">
                {formatDateAsDMHM(sendDate)}
              </p>
            )}
          </div>
          <p className="text-md text-muted-foreground">{content}</p>
        </div>
        {id !== undefined && (
          // Shown by CSS, not state: moving the pointer onto the button must
          // not unmount it before the click lands. Opacity, not visibility:
          // the keyboard reaches it too. No transition (P6)
          <div className="absolute right-0 top-0 flex items-center gap-4">
            <Button
              variant="ghost"
              size="icon"
              aria-label={TRASH_LABEL}
              aria-busy={deleting}
              aria-disabled={deleting}
              className={
                deleting
                  ? "opacity-100"
                  : "opacity-0 focus-visible:opacity-100 group-hover:opacity-100 [@media(hover:none)]:opacity-100"
              }
              onClick={handleDelete}
            >
              {deleting ? (
                <LoadingSpinner className="h-4 w-4 motion-reduce:animate-none" />
              ) : (
                <TrashIcon size={16} />
              )}
            </Button>
          </div>
        )}
      </article>
    )
  return <Skeleton className="w-30 h-10" />
})
