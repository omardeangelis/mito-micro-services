import { beforeEach, describe, expect, it, vi } from "vitest"
import { deleteMessageAction } from "../deleteMessage"

const mocks = vi.hoisted(() => ({
  deleteMessage: vi.fn(),
  revalidatePath: vi.fn(),
}))

// The operator-authenticated tRPC caller: the boundary towards the database
vi.mock("@/trpc/server", () => ({
  api: { chat: { deleteMessage: { mutate: mocks.deleteMessage } } },
}))
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))

beforeEach(() => {
  vi.clearAllMocks()
  mocks.deleteMessage.mockResolvedValue(undefined)
})

const valid = { id: 905, operatorId: 11, customerId: "c-42" }

describe("deleteMessageAction", () => {
  it("elimina la nota, rinfresca la pagina del cliente e restituisce ok", async () => {
    await expect(deleteMessageAction(valid)).resolves.toEqual({ ok: true })

    expect(mocks.deleteMessage).toHaveBeenCalledWith({
      id: 905,
      operatorId: 11,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/customers/c-42",
      "page"
    )
  })

  it("con dati non validi non elimina niente e restituisce un errore", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      deleteMessageAction({ ...valid, customerId: "" })
    ).resolves.toEqual({ ok: false, error: "Invalid form data" })

    expect(mocks.deleteMessage).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
