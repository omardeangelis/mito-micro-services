import { PraticaActiveChat } from "./PraticaNotes"
import { api } from "@/trpc/server"

export default async function PraticaNotesSetcion(props: {
  chat_id: number
  limit: number
}) {
  const { messages, total } = await api.chat.getChatMessagesById.query({
    id: props.chat_id,
    limit: props.limit,
  })
  return (
    <PraticaActiveChat
      id={props.chat_id}
      messages={messages}
      total={total}
      limit={props.limit ?? 5}
    />
  )
}
