import { TRPCClientError } from "@trpc/client"
import { TRPCError } from "@trpc/server"
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

const valid = { id: 905, customerId: "c-42" }

describe("deleteMessageAction", () => {
  it("elimina la nota, rinfresca la pagina del cliente e restituisce ok", async () => {
    await expect(deleteMessageAction(valid)).resolves.toEqual({ ok: true })

    // The operator is the one signed in: the action never sends one
    expect(mocks.deleteMessage).toHaveBeenCalledWith({ id: 905 })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/customers/c-42",
      "page"
    )
  })

  it("con una nota già eliminata rinfresca la pagina e lo dice, senza errore", async () => {
    // As the Server Component caller rejects: the procedure's error as `cause`
    mocks.deleteMessage.mockRejectedValue(
      TRPCClientError.from(
        new TRPCError({ code: "NOT_FOUND", message: "Nota non trovata" })
      )
    )

    await expect(deleteMessageAction(valid)).resolves.toEqual({
      ok: false,
      gone: true,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith(
      "/dashboard/customers/c-42",
      "page"
    )
  })

  it.each([
    ["FORBIDDEN", "Solo l'autore della nota può eliminarla"],
    ["INTERNAL_SERVER_ERROR", "Errore del database"],
  ] as const)(
    "con %s del server rifiuta, senza rinfrescare",
    async (code, message) => {
      const error = TRPCClientError.from(new TRPCError({ code, message }))
      mocks.deleteMessage.mockRejectedValue(error)

      await expect(deleteMessageAction(valid)).rejects.toBe(error)
      expect(mocks.revalidatePath).not.toHaveBeenCalled()
    }
  )

  it("con dati non validi non elimina niente e restituisce un errore", async () => {
    vi.spyOn(console, "error").mockImplementation(() => undefined)

    await expect(
      deleteMessageAction({ ...valid, customerId: "" })
    ).resolves.toEqual({ ok: false, error: "Invalid form data" })

    expect(mocks.deleteMessage).not.toHaveBeenCalled()
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })
})
