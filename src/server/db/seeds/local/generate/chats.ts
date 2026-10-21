// Chats and notes of the local seed (AC25). A note is a row of `messages` in a
// chat; chats sit only on customers (`customers.chatId`), one per customer,
// never on practices. Pure and seeded: the result depends only on the
// customers, the operators and `day`; every instant is Rome noon of a day not
// after D.
import type {
  ChatRow,
  CustomerRow,
  Day,
  MessageRow,
  OperatorRow,
} from "../types"
import { createDayClock } from "./clock"
import { EMPTY_OPERATOR_ID, SYSTEM_OPERATOR_ID } from "./operators"
import { createRandom, range } from "./random"

export const CHAT_ID_START = 1000
export const MESSAGE_ID_START = 10000

/** Share of the customers with a chat (AC25 asks for at least 5%). */
export const CHAT_SHARE = 0.08

const NOTES = [
  "Cliente contattato, richiede un preventivo aggiornato.",
  "Inviata la documentazione via email.",
  "Il cliente preferisce essere chiamato in mattinata.",
  "In attesa della busta paga per la valutazione.",
  "Segnalato interesse per un consolidamento.",
  "Numero non raggiungibile, riprovare la prossima settimana.",
  "Ha gia' un finanziamento in corso con un'altra banca.",
  "Richiesta la copia del documento d'identita'.",
]

export function generateChats({
  day,
  customers,
  operators,
}: {
  day: Day
  customers: readonly CustomerRow[]
  operators: readonly OperatorRow[]
}): { chats: ChatRow[]; messages: MessageRow[]; customers: CustomerRow[] } {
  const rng = createRandom("chats")
  const clock = createDayClock(day)
  const realOperatorIds = operators
    .map((operator) => operator.id)
    .filter((id) => id !== EMPTY_OPERATOR_ID && id !== SYSTEM_OPERATOR_ID)
  const withChat = new Set(
    rng
      .shuffle(range(customers.length))
      .slice(0, Math.round(customers.length * CHAT_SHARE))
  )

  const chats: ChatRow[] = []
  const messages: MessageRow[] = []
  const rows = customers.map((customer, i) => {
    if (!withChat.has(i)) return customer
    const chatId = CHAT_ID_START + chats.length
    // 1-4 notes on days from `first` (oldest) to D, oldest first
    const count = rng.int(1, 4)
    const first = rng.int(count, 120)
    const days = [first, ...range(count - 1).map(() => rng.int(0, first))].sort(
      (a, b) => b - a
    )
    chats.push({
      id: chatId,
      createdAt: clock.noon(first),
      isRead: rng.chance(0.6),
    })
    for (const offset of days) {
      messages.push({
        id: MESSAGE_ID_START + messages.length,
        operatorId: customer.operatorId ?? rng.pick(realOperatorIds),
        chatId,
        sendDate: clock.noon(offset),
        notifyDate: rng.chance(0.2) ? clock.noon(rng.int(0, offset)) : null,
        content: rng.pick(NOTES),
      })
    }
    return { ...customer, chatId }
  })

  return { chats, messages, customers: rows }
}
