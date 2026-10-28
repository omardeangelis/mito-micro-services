import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import {
  ChatMissing,
  CustomerNotFound,
  MessageMissing,
  NotMessageAuthor,
} from "@mito/contract/errors"
import { CurrentUser } from "@mito/contract/middleware"
import { type Db } from "../effect/db"
import { type ErrorReporter } from "../effect/errorReporter"
import { createCustomerChat } from "../services/chat/createCustomerChat"
import { deleteCustomerMessage } from "../services/chat/deleteCustomerMessage"
import { listChatMessages } from "../services/chat/queries"
import { sendCustomerMessage } from "../services/chat/sendCustomerMessage"
import { unexpectedAs500 } from "./unexpected"

/**
 * The group `chat`: adapters of the services the procedures of the tRPC
 * router `chat` call, with no logic of their own (H16)
 */
export const chatLayer = HttpApiBuilder.group(MitoApi, "chat", (handlers) =>
  Effect.gen(function* () {
    // The database and the reporter of the layer, so the handlers need
    // nothing per request but `CurrentUser`
    const services = yield* Effect.context<Db | ErrorReporter>()
    return handlers
      .handle("getChatMessagesById", ({ params, query }) =>
        listChatMessages({ chatId: params.id, limit: query.limit ?? 5 }).pipe(
          unexpectedAs500("getChatMessagesById"),
          Effect.provide(services)
        )
      )
      .handle("insertMessage", ({ params, payload }) =>
        Effect.gen(function* () {
          const { operator } = yield* CurrentUser
          const message = yield* sendCustomerMessage({
            chatId: params.id,
            content: payload.content,
            operatorId: operator.id,
          }).pipe(
            Effect.catchTag("ChatMissing", ({ chatId }) =>
              Effect.fail(new ChatMissing({ chatId }))
            ),
            unexpectedAs500("insertMessage")
          )
          return message ?? null
        }).pipe(Effect.provide(services))
      )
      .handle("createNewCustomerChat", ({ payload }) =>
        Effect.gen(function* () {
          const { operator } = yield* CurrentUser
          return yield* createCustomerChat({
            customerId: payload.customerId,
            operatorId: operator.id,
          }).pipe(
            Effect.catchTag("CustomerMissing", () =>
              Effect.fail(new CustomerNotFound())
            ),
            unexpectedAs500("createNewCustomerChat")
          )
        }).pipe(Effect.provide(services))
      )
      .handle("deleteMessage", ({ params }) =>
        Effect.gen(function* () {
          const { operator } = yield* CurrentUser
          yield* deleteCustomerMessage({
            messageId: params.id,
            operator,
          }).pipe(
            Effect.catchTags({
              MessageMissing: ({ messageId }) =>
                Effect.fail(new MessageMissing({ messageId })),
              NotMessageAuthor: ({ messageId }) =>
                Effect.fail(new NotMessageAuthor({ messageId })),
            }),
            unexpectedAs500("deleteMessage")
          )
        }).pipe(Effect.provide(services))
      )
  })
)
