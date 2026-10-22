import { TRPCClientError } from "@trpc/client"
import { TRPCError } from "@trpc/server"
import { beforeEach, describe, expect, it, vi } from "vitest"
import {
  CONTACT_ERROR_MARKER,
  type ContactErrorCode,
} from "@mito/domain/contact/errors"
import { deactivateOperatorAction } from "../deactivateOperator"
import { updateOperatorsRoleAction } from "../updateOperatorsRole"

// The server actions return `{ error: code }` instead of throwing (AC20a, AC22)

const mocks = vi.hoisted(() => ({
  deactivate: vi.fn(),
  updateRole: vi.fn(),
  revalidatePath: vi.fn(),
}))

vi.mock("@/trpc/server", () => ({
  api: {
    operator: {
      deactivate: { mutate: mocks.deactivate },
      updateOperatorsRole: { mutate: mocks.updateRole },
    },
  },
}))

vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidatePath }))

/** An in-process failure: a TRPCClientError whose cause is the TRPCError. */
const rejection = (code: ContactErrorCode) =>
  new TRPCClientError(code, {
    cause: new TRPCError({
      code: "FORBIDDEN",
      message: code,
      cause: { [CONTACT_ERROR_MARKER]: true, code, payload: {} } as never,
    }),
  })

beforeEach(() => {
  vi.clearAllMocks()
})

describe("deactivateOperatorAction", () => {
  it.each([
    "OPERATOR_IS_ADMIN",
    "CANNOT_DEACTIVATE_SELF",
    "OPERATOR_NOT_FOUND",
    "HANDOVER_SAME_OPERATOR",
    "OPERATOR_DISABLED",
  ] as const)("restituisce { error: %s } e non lancia", async (code) => {
    mocks.deactivate.mockRejectedValue(rejection(code))

    const res = await deactivateOperatorAction({
      operatorId: 1,
      toOperatorId: 2,
    })

    expect(res).toEqual({ error: code })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("restituisce UNKNOWN per un errore che non è del dominio", async () => {
    mocks.deactivate.mockRejectedValue(new Error("boom"))

    const res = await deactivateOperatorAction({
      operatorId: 1,
      toOperatorId: 2,
    })

    expect(res).toEqual({ error: "UNKNOWN" })
  })

  it("rifiuta un input non valido senza chiamare il server", async () => {
    const res = await deactivateOperatorAction({ operatorId: "x" })

    expect(res.error).toBe("INVALID_INPUT")
    expect(mocks.deactivate).not.toHaveBeenCalled()
  })

  it("con successo rivalida /dashboard/profile e restituisce i conteggi", async () => {
    const result = { customersMoved: 3, contactsMoved: 2, practicesMoved: 1 }
    mocks.deactivate.mockResolvedValue(result)

    const res = await deactivateOperatorAction({
      operatorId: 1,
      toOperatorId: 2,
    })

    expect(res).toEqual({ result })
    expect(mocks.deactivate).toHaveBeenCalledWith({
      operatorId: 1,
      toOperatorId: 2,
    })
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/profile")
  })
})

describe("updateOperatorsRoleAction", () => {
  it("restituisce { error: LAST_ADMIN } e non lancia", async () => {
    mocks.updateRole.mockRejectedValue(rejection("LAST_ADMIN"))

    const res = await updateOperatorsRoleAction([{ id: 1, role: "OPERATORE" }])

    expect(res).toEqual({ error: "LAST_ADMIN" })
    expect(mocks.revalidatePath).not.toHaveBeenCalled()
  })

  it("rifiuta un input non valido", async () => {
    const res = await updateOperatorsRoleAction([{ id: 1, role: "BOSS" }])

    expect(res.error).toBe("INVALID_INPUT")
    expect(mocks.updateRole).not.toHaveBeenCalled()
  })

  it("con successo rivalida /dashboard/profile", async () => {
    mocks.updateRole.mockResolvedValue(undefined)

    const res = await updateOperatorsRoleAction([{ id: 1, role: "ADMIN" }])

    expect(res.error).toBeUndefined()
    expect(mocks.revalidatePath).toHaveBeenCalledWith("/dashboard/profile")
  })
})
