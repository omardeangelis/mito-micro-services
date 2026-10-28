import {
  type QueryClient,
  queryOptions,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query"
import { Effect } from "effect"
import { useRun } from "./ApiProvider"
import { customerKeys } from "./customer"
import { routeErrorWhenEmpty } from "./queryClient"
import { ApiClient, type Run } from "./runtime"

/** The keys of the group `chat`: `[group, endpoint, input]` (H12) */
export const chatKeys = {
  all: ["chat"] as const,
  messages: (id: number, limit: number) =>
    [...chatKeys.all, "getChatMessagesById", { id, limit }] as const,
}

/**
 * The last `limit` notes of a chat, oldest first, and how many it has
 * (`GET /chat/:id?limit=`)
 */
export const chatMessagesOptions = (run: Run, id: number, limit: number) =>
  queryOptions({
    queryKey: chatKeys.messages(id, limit),
    queryFn: ({ signal }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.chat.getChatMessagesById({
            params: { id },
            query: { limit },
          })
        }),
        signal
      ),
  })

/**
 * The notes of the customer's chat, none without a chat. The section keeps
 * the notes on screen while a longer list loads; a first read that fails is
 * the error of the page, as it was for the server page of the Next.js app
 */
export const useChatMessages = (id: number | null, limit: number) =>
  useQuery({
    ...chatMessagesOptions(useRun(), id ?? 0, limit),
    ...routeErrorWhenEmpty,
    enabled: id !== null,
  })

/** Reads the notes of a chat, unless they are in the cache already */
export const useLoadChat = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return (id: number, limit: number) =>
    queryClient.ensureQueryData(chatMessagesOptions(run, id, limit))
}

/**
 * The customer, then its notes, read again, as `revalidatePath` refreshed
 * them in one step: in this order, the section sees a chat gone with its last
 * note (no `chatId`) before it could draw that chat empty
 */
const rereadCustomerAndChat = (queryClient: QueryClient) =>
  queryClient
    .invalidateQueries({ queryKey: customerKeys.all })
    .then(() => queryClient.invalidateQueries({ queryKey: chatKeys.all }))

/**
 * "Commenta" (`POST /chat/:id/messages`): the note saved, or null when the
 * backend saved none. Then the notes on screen are read again, as
 * `revalidatePath` of the server action did. The chat shows its failure
 * itself, no toast; a chat gone meanwhile (its last note deleted in another
 * tab) reads the customer again, which shows "Avvia una chat"
 */
export const useInsertMessage = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: [...chatKeys.all, "insertMessage"],
    mutationFn: ({ chatId, content }: { chatId: number; content: string }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.chat.insertMessage({
            params: { id: chatId },
            payload: { content },
          })
        })
      ),
    meta: { toastErrors: false },
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: chatKeys.all })
    },
    onError: (error) => {
      if (error._tag === "ChatMissing") void rereadCustomerAndChat(queryClient)
    },
  })
}

/**
 * The trash of a note (`DELETE /chat/messages/:id`): "deleted", or "gone"
 * when another tab deleted it first. Either way the notes and the customer
 * are read again, since the last note takes the chat with it. The chat shows
 * a failure itself, no toast
 */
export const useDeleteMessage = () => {
  const run = useRun()
  const queryClient = useQueryClient()
  return useMutation({
    mutationKey: [...chatKeys.all, "deleteMessage"],
    mutationFn: ({ id }: { id: number }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          yield* client.chat.deleteMessage({ params: { id } })
          return "deleted" as const
        }).pipe(
          Effect.catchTag("MessageMissing", () =>
            Effect.succeed("gone" as const)
          )
        )
      ),
    meta: { toastErrors: false },
    onSuccess: () => {
      void rereadCustomerAndChat(queryClient)
    },
  })
}

/**
 * "Avvia una chat" (`POST /chat`): the customer's chat, new or the one it
 * had. The caller reads the page again (`finishAfterRefresh`). It shows its
 * failure itself, no toast
 */
export const useCreateChat = () => {
  const run = useRun()
  return useMutation({
    mutationKey: [...chatKeys.all, "createNewCustomerChat"],
    mutationFn: ({ customerId }: { customerId: string }) =>
      run(
        Effect.gen(function* () {
          const client = yield* ApiClient
          return yield* client.chat.createNewCustomerChat({
            payload: { customerId },
          })
        })
      ),
    meta: { toastErrors: false },
  })
}
