import { CollassableSection } from "@/app/dashboard/pratiche/[id]/_components/CollassableItem"
import {
  PraticaActiveChat,
  PraticaNewChat,
} from "@/app/dashboard/pratiche/[id]/_components/PraticaNotes"
import { api } from "@/trpc/server"

export async function CustomerChatSection(props: {
  id: string
  limit?: number
}) {
  const customer = await api.customer.getCustomerById.query({ id: props.id })
  if (!customer?.chatId) return <PraticaNewChat chat_owner_id={props.id} />
  const { messages, total } = await api.chat.getChatMessagesById.query({
    id: customer.chatId,
    limit: props.limit,
  })

  return (
    <CollassableSection defaultValue={["item-1"]}>
      <PraticaActiveChat
        className="bg-white"
        id={customer.chatId}
        messages={messages}
        total={total}
        limit={props.limit ?? 5}
      />
    </CollassableSection>
  )
}
