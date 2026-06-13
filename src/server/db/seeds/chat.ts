/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import { faker } from "@faker-js/faker"
import * as schema from "../schema/index"
import { chat, operators, practices } from "../schema/index"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { asc, eq } from "drizzle-orm"
import { loadEnv } from "@/lib/global/env"

loadEnv()

export const createChatAndMessages = async function seed(
  db: PostgresJsDatabase<typeof schema>
): Promise<void> {
  try {
    const operatorsDTO = await db.selectDistinct().from(operators)
    const getRandomOperator = () => {
      return operatorsDTO[Math.floor(Math.random() * operatorsDTO.length)]!.id
    }
    const last20Practices = await db
      .select()
      .from(practices)
      .limit(20)
      .orderBy(asc(practices.updatedAt))

    for (const practice of last20Practices) {
      const newChat = await db
        .insert(chat)
        .values({
          isRead: false,
        })
        .returning({ id: chat.id })

      const operatorOneId = getRandomOperator()
      const operatorTwoId = getRandomOperator()

      const messagesArray = Array.from({ length: randomNumber() }, (_, i) => {
        const operatorId = i % 2 === 0 ? operatorOneId : operatorTwoId
        return {
          operatorId: operatorId,
          chatId: newChat[0]!.id,
          content: faker.lorem.sentence(),
        }
      })

      const newMessages = await db
        .insert(schema.messages)
        .values(messagesArray)
        .returning({
          id: schema.messages.id,
          operatorId: schema.messages.operatorId,
        })

      const operatorMessages = new Set(newMessages.map((m) => m.operatorId))

      for (const operatorId of operatorMessages) {
        await db.insert(schema.chatToOperator).values({
          chatId: newChat[0]!.id,
          operatorId: Number(operatorId),
        })
      }

      await db
        .update(practices)
        .set({
          chatId: newChat[0]!.id,
        })
        .where(eq(practices.id, practice.id))
    }
  } catch (error) {
    console.error(error)
  }
}

const randomNumber = () => {
  const random = Math.random()
  const randomNumber = Math.floor(random * 4) + 1
  return randomNumber
}
