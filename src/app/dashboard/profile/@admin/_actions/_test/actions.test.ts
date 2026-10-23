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

// The message differs from the code: the action must read the code, not the
// text the server wrote

/** In process (`rscLink`): a TRPCClientError whose cause is the TRPCError. */
const inProcess = (code: ContactErrorCode) =>
  new TRPCClientError("Messaggio del server", {
    cause: new TRPCError({
      code: "FORBIDDEN",
      message: "Messaggio del server",
      cause: { [CONTACT_ERROR_MARKER]: true, code, payload: {} } as never,
    }),
  })

/** With `BACKEND_URL` (`backendLink`): the code is in `data.contactError`. */
const overHttp = (code: ContactErrorCode) =>
  TRPCClientError.from({
    error: {
      message: "Messaggio del server",
      code: -32603,
      data: {
        code: "FORBIDDEN",
        httpStatus: 403,
        contactError: { code, payload: {} },
      },
    },
  })

const shapes = [
  ["in-process", inProcess],
  ["BACKEND_URL", overHttp],
] as const

beforeEach(() => {
  vi.clearAllMocks()
})

describe.each(shapes)("deactivateOperatorAction, errore %s", (_, rejection) => {
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
})

describe("deactivateOperatorAction", () => {
  it("restituisce UNKNOWN per un errore tRPC senza codice di dominio", async () => {
    mocks.deactivate.mockRejectedValue(
      new TRPCClientError("Forbidden", {
        cause: new TRPCError({ code: "FORBIDDEN", message: "admin-only" }),
      })
    )

    const res = await deactivateOperatorAction({
      operatorId: 1,
      toOperatorId: 2,
    })

    expect(res).toEqual({ error: "UNKNOWN" })
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

describe.each(shapes)(
  "updateOperatorsRoleAction, errore %s",
  (_, rejection) => {
    it.each(["LAST_ADMIN", "OPERATOR_NOT_FOUND"] as const)(
      "restituisce { error: %s } e non lancia",
      async (code) => {
        mocks.updateRole.mockRejectedValue(rejection(code))

        const res = await updateOperatorsRoleAction([
          { id: 1, role: "OPERATORE" },
        ])

        expect(res).toEqual({ error: code })
        expect(mocks.revalidatePath).not.toHaveBeenCalled()
      }
    )
  }
)

describe("updateOperatorsRoleAction", () => {
  it("restituisce UNKNOWN per un errore che non è del dominio", async () => {
    mocks.updateRole.mockRejectedValue(new Error("boom"))

    const res = await updateOperatorsRoleAction([{ id: 1, role: "OPERATORE" }])

    expect(res).toEqual({ error: "UNKNOWN" })
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
