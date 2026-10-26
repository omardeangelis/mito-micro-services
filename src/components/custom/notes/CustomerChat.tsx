"use client"
import { Button } from "@/components/ui/button"
import { Avatar } from "@/components/ui/avatar"
import { Textarea } from "@/components/ui/textarea"
import { AccordionContent, AccordionTrigger } from "@/components/ui/accordion"
import {
  Fragment,
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  memo,
  type ComponentProps,
  type FormEvent,
  type PropsWithChildren,
} from "react"
import { api } from "@/trpc/react"
import { type Message } from "@mito/domain/schemas"
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
import {
  isChatShown,
  leaveTrashes,
  showChat,
  startDeleting,
  stopDeleting,
  takeDeleted,
  useDeletingNotes,
} from "./deletingNotes"

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

type NotesStatus = {
  /** Read by screen readers: "Invio della nota", "Nota inviata", "Nota eliminata" */
  announce: (text: string) => void
  /** The notes of the customer on the page now, none without a chat. `focus` moves the focus after a deletion */
  shown: (
    customerId: string,
    ids: number[],
    focus: (next: number[]) => void
  ) => void
}

const NotesStatusContext = createContext<NotesStatus | null>(null)

const useNotesStatus = () => {
  const status = useContext(NotesStatusContext)
  if (!status) {
    throw new Error("CustomerChat and CustomerNewChat go inside CustomerNotes")
  }
  return status
}

/**
 * The notes of a customer, as a chat or as "Avvia una chat". It stays on the
 * page when one replaces the other: deleting the last note deletes the chat,
 * and "Nota eliminata" and the focus still have a place to go.
 */
export function CustomerNotes({ children }: PropsWithChildren) {
  // Each announcement is a new node: the same text twice in a row is read twice
  const [announcement, setAnnouncement] = useState({ text: "", key: 0 })
  const status = useMemo<NotesStatus>(() => {
    const announce = (text: string) =>
      setAnnouncement((current) => ({ text, key: current.key + 1 }))
    return {
      announce,
      shown: (customerId, ids, focus) => {
        // Several at once: each trash starts its own
        const gone = takeDeleted(customerId, ids)
        if (gone.length === 0) return
        announce(gone.length === 1 ? "Nota eliminata" : "Note eliminate")
        // The last trash clicked, only if the focus stayed on it
        const last = gone.at(-1)!
        if (!last.focused) return
        focus(last.next.filter((id) => !gone.some((d) => d.id === id)))
      },
    }
  }, [])
  // A click or a focus elsewhere leaves the focus where the operator put it
  useEffect(() => {
    document.addEventListener("pointerdown", leaveTrashes, true)
    document.addEventListener("focusin", leaveTrashes, true)
    return () => {
      document.removeEventListener("pointerdown", leaveTrashes, true)
      document.removeEventListener("focusin", leaveTrashes, true)
      // The operator left before the started chat was drawn
      focusOnStart = null
    }
  }, [])

  return (
    <NotesStatusContext.Provider value={status}>
      <p role="status" className="sr-only">
        <span key={announcement.key}>{announcement.text}</span>
      </p>
      {children}
    </NotesStatusContext.Provider>
  )
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
  const notes = useNotesStatus()
  const deleting = useDeletingNotes(customerId)

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
  // Only the author of a note deletes it, an administrator too, as the server
  // checks. Until the operator is known no note has the trash
  const canDelete = (message: MessageResponse) =>
    operatorData !== undefined && message.operatorId === operatorData.id
  const { mutate: touchCustomer } = api.customer.updateLastEdit.useMutation()

  // Once the page drops a deleted note, the focus moves to the trash that
  // takes its place: the next note's, else the previous one's
  const messagesRef = useRef(messages)
  messagesRef.current = messages
  const handleDeleteStart = useCallback(
    (id: number) => {
      const ids = messagesRef.current.map((m) => m.id)
      const index = ids.indexOf(id)
      startDeleting(customerId, id, [
        ...ids.slice(index + 1),
        ...ids.slice(0, index).reverse(),
      ])
    },
    [customerId]
  )
  const handleDeleted = useCallback(
    () => touchCustomer({ id: customerId }),
    [touchCustomer, customerId]
  )
  const handleDeleteFailed = useCallback(
    (id: number) => {
      stopDeleting(customerId, id)
      // Not on the page of another customer opened in the meantime
      if (!isChatShown(customerId)) return
      toast({
        variant: "destructive",
        duration: 8000,
        description: "Nota non eliminata, riprova",
      })
    },
    [customerId, toast]
  )

  useEffect(() => showChat(customerId), [customerId])
  useEffect(() => {
    notes.shown(
      customerId,
      messages.map((m) => m.id),
      (next) => {
        // A note without a trash (a colleague's, or one still loading) is skipped
        const trash = next
          .map((id) =>
            scrollRef.current?.querySelector<HTMLButtonElement>(
              `button[data-note-id="${id}"]`
            )
          )
          .find(Boolean)
        ;(trash ?? fieldRef.current)?.focus()
      }
    )
  }, [customerId, messages, notes])

  // The list opens at the newest notes. While at the bottom it stays there,
  // when a note arrives or the notes grow after opening (names loaded); once
  // the operator scrolls up it stays put, until they send a note
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
      deleting: deleting.includes(message.id),
      deletable: canDelete(message),
    })),
    // A pending note has no trash: there is no message to delete yet
    ...waiting.map((note) => ({
      ...note,
      id: undefined,
      sending: note.id === undefined,
      deleting: false,
      deletable: false,
    })),
  ]
  const lastKey = rows.at(-1)?.key
  const scrolledKey = useRef(lastKey)
  useLayoutEffect(() => {
    if (scrolledKey.current === lastKey) return
    scrolledKey.current = lastKey
    if (pinnedRef.current) scrollToBottom(scrollRef.current)
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
    // The note sent shows at the bottom, wherever the operator had scrolled
    pinnedRef.current = true
    notes.announce("Invio della nota")
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
    notes.announce(result?.ok ? "Nota inviata" : "")
    if (result?.ok) {
      // Already on the page (another refresh came first): the pending note is
      // done, or it would come back once the saved one is deleted
      const saved = messagesRef.current.some((m) => m.id === result.id)
      setPending((current) =>
        current.flatMap((item) =>
          item.key !== key ? [item] : saved ? [] : [{ ...item, id: result.id }]
        )
      )
      touchCustomer({ id: customerId })
    } else {
      setPending((current) => current.filter((item) => item.key !== key))
    }
  }

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
                        deleting={row.deleting}
                        deletable={row.deletable}
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
  // The last note deleted takes the chat with it: the focus comes here
  const startRef = useRef<HTMLButtonElement | null>(null)
  const notes = useNotesStatus()
  useEffect(
    () => notes.shown(customerId, [], () => startRef.current?.focus()),
    [customerId, notes]
  )
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
            ref={startRef}
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
  /** Until the page drops the note: nothing is removed in advance (P6) */
  deleting: boolean
  /** The trash: only on a saved note of the operator */
  deletable: boolean
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
  deleting,
  deletable,
  onDeleteStart,
  onDeleted,
  onDeleteFailed,
}: CustomerNoteProps) {
  // The note is drawn at once; the author's name comes when it is there. No
  // skeleton: it would pulse for ever if the lookup never answers
  const { data } = api.operator.getOperatorById.useQuery(
    { id: operatorId },
    // An id no operator can have (0, a negative one) is not looked up
    { enabled: Number.isInteger(operatorId) && operatorId > 0 }
  )

  const handleDelete = async () => {
    if (id === undefined || !deletable || deleting) return
    onDeleteStart(id)
    const result = await deleteMessageAction({ id, customerId }).catch(
      () => null
    )
    // Already deleted, in another tab: the refreshed page drops it
    if (result && "gone" in result) return
    // Anything but `{ ok: true }` failed, as for a note sent
    if (result?.ok) {
      onDeleted()
    } else {
      onDeleteFailed(id)
    }
  }
  return (
    <article
      aria-busy={sending || deleting}
      className="group relative flex w-full items-center gap-4 py-4"
    >
      <Avatar className="bg-neutral-400" />
      <div className="flex flex-col justify-between">
        {/* min-h-7: the line keeps its height when the name arrives */}
        <div className="flex min-h-7 w-full items-center gap-4">
          {data ? (
            <h6 className="text-lg font-medium">
              {data.name} {data.surname}
            </h6>
          ) : null}
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
      {id !== undefined && deletable && (
        // Shown by CSS, not state: moving the pointer onto the button must
        // not unmount it before the click lands. Opacity, not visibility:
        // the keyboard reaches it too. No transition (P6)
        <div className="absolute right-0 top-0 flex items-center gap-4">
          <Button
            variant="ghost"
            size="icon"
            aria-label={TRASH_LABEL}
            data-note-id={id}
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
})
