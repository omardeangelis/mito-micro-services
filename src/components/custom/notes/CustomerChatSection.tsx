import { CollassableSection } from "@/components/custom/CollassableItem"
import { CustomerChat, CustomerNewChat, CustomerNotes } from "./CustomerChat"
import { api } from "@/trpc/server"

export async function CustomerChatSection({
  customerId,
  limit,
}: {
  customerId: string
  limit?: number
}) {
  const customer = await api.customer.getCustomerById.query({ id: customerId })
  const chat = customer?.chatId
    ? {
        id: customer.chatId,
        ...(await api.chat.getChatMessagesById.query({
          id: customer.chatId,
          limit,
        })),
      }
    : null

  return (
    // The same element with or without a chat: it outlives the swap. A new
    // customer starts over: no text, draft or announcement carried over
    <CustomerNotes key={customerId}>
      {chat ? (
        <CollassableSection defaultValue={["item-1"]}>
          <CustomerChat
            className="bg-white"
            customerId={customerId}
            chatId={chat.id}
            messages={chat.messages}
            total={chat.total}
            limit={limit ?? 5}
          />
        </CollassableSection>
      ) : (
        <CustomerNewChat customerId={customerId} />
      )}
    </CustomerNotes>
  )
}
