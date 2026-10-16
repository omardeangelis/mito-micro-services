import { CollassableSection } from "@/components/custom/CollassableItem"
import { CustomerChat, CustomerNewChat } from "./CustomerChat"
import { api } from "@/trpc/server"

export async function CustomerChatSection({
  customerId,
  limit,
}: {
  customerId: string
  limit?: number
}) {
  const customer = await api.customer.getCustomerById.query({ id: customerId })
  if (!customer?.chatId) return <CustomerNewChat customerId={customerId} />
  const { messages, total } = await api.chat.getChatMessagesById.query({
    id: customer.chatId,
    limit,
  })

  return (
    <CollassableSection defaultValue={["item-1"]}>
      <CustomerChat
        // A new customer is a new chat: no text or draft carried over
        key={customerId}
        className="bg-white"
        customerId={customerId}
        chatId={customer.chatId}
        messages={messages}
        total={total}
        limit={limit ?? 5}
      />
    </CollassableSection>
  )
}
