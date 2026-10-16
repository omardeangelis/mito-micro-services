import { beforeEach, describe, expect, it, vi } from "vitest"
import { updateChatAction } from "../updateChat"

const mocks = vi.hoisted(() => ({
  getUniqueChatOperator: vi.fn(),
  getUserOperator: vi.fn(),
  addOperatorToChat: vi.fn(),
  insertMessage: vi.fn(),
  revalidatePath: vi.fn(),
}))

// The operator-authenticated tRPC caller: the boundary towards the database
vi.mock("@/trpc/server", () => ({
  api: {
    chat: {
      getUniqueChatOperator: { query: mocks.getUniqueChatOperator },
      addOperatorToChat: { mutate: mocks.addOperatorToChat },
      insertMessage: { mutate: mocks.insertMessage },
    },
    operator: { getUserOperator: { query: mocks.getUserOperator } },
  },
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.getUniqueChatOperator.mockResolvedValue([{ operator: 11 }])
  mocks.getUserOperator.mockResolvedValue({ id: 11 })
  mocks.insertMessage.mockResolvedValue({ id: 901 })
})

const valid = { chatId: 3, content: "Richiamare domani", customerId: "c-42" }

describe("updateChatAction", () => {
  it("salva la nota, rinfresca la pagina del cliente e restituisce l'id", async () => {
    await expect(updateChatAction(valid)).resolves.toEqual({
      ok: true,
      id: 901,
    })

    expect(mocks.insertMessage).toHaveBeenCalledWith({
      chatId: 3,
      content: "Richiamare domani",
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/customers/c-42",
      "page"
    )
  })

  it("aggiunge l'operatore alla chat se non ci ha ancora scritto", async () => {
    mocks.getUniqueChatOperator.mockResolvedValue([{ operator: 7 }])

    await updateChatAction(valid)

    expect(mocks.addOperatorToChat).toHaveBeenCalledWith({ chatId: 3 })
  })

  it.each([
    ["un chatId non numerico", { ...valid, chatId: "3" }],
    ["un chatId decimale", { ...valid, chatId: 1.5 }],
    ["un chatId negativo", { ...valid, chatId: -1 }],
    ["un customerId vuoto", { ...valid, customerId: "" }],
    ["un contenuto non di testo", { ...valid, content: 5 }],
  ])("con %s risponde { ok: false } senza scrivere", async (_case, input) => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    const result = await updateChatAction(input as typeof valid)

    expect(result.ok).toBe(false)
    expect(mocks.insertMessage).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("se l'inserimento non restituisce la nota risponde { ok: false }", async () => {
    mocks.insertMessage.mockResolvedValue(undefined)

    const result = await updateChatAction(valid)

    expect(result.ok).toBe(false)
  })
})
