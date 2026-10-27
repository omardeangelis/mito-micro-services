import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { describe, expect, it } from "vitest"
import { MitoApi } from "@mito/contract/api"
import { OperatorDisabled, OperatorNotFound } from "@mito/contract/errors"
import { CurrentUser } from "@mito/contract/middleware"
import { type Operator } from "@mito/contract/schemas"
import { useCurrentUser, useUpdateOperatorInfo } from "@/api/me"
import { rejectingWith, renderWithApi, signedInAs } from "@/test/api"

const ada: Operator = {
  id: 7,
  name: "Ada",
  surname: "Lovelace",
  userId: "user-7",
  createdAt: new Date("2026-10-01T08:00:00.000Z"),
  updatedAt: null,
}

/** A backend in memory for the group `me`, with the operator it writes */
const fakeMe = (
  options: { onRead?: () => void; failWrite?: boolean; dies?: boolean } = {}
) => {
  let operator = ada
  return HttpApiBuilder.group(MitoApi, "me", (handlers) =>
    handlers
      .handle("getCurrentUser", () =>
        Effect.gen(function* () {
          options.onRead?.()
          if (options.dies === true) return yield* Effect.die("db down")
          const { actor } = yield* CurrentUser
          return {
            role: actor.role,
            operatorId: operator.id,
            operator,
            preferences: {},
          }
        })
      )
      .handle("updateOperatorInfo", ({ payload }) =>
        Effect.gen(function* () {
          if (options.failWrite === true) {
            return yield* new OperatorNotFound()
          }
          const { actor } = yield* CurrentUser
          operator = { ...operator, ...payload }
          return { ...operator, role: actor.role }
        })
      )
  )
}

function Profile() {
  const me = useCurrentUser()
  const update = useUpdateOperatorInfo()
  if (me.isPending) return <p>Caricamento</p>
  if (me.isError) return <p>Errore: {me.error._tag}</p>
  return (
    <>
      <p>
        {me.data.operator.name} {me.data.operator.surname} ({me.data.role})
      </p>
      <p>Iscritto il {me.data.operator.createdAt.toISOString()}</p>
      <button onClick={() => update.mutate({ name: "Grace" })}>Rinomina</button>
    </>
  )
}

describe("il data layer sul gruppo me", () => {
  it("legge l'utente corrente, con le date come Date", async () => {
    renderWithApi(<Profile />, {
      handlers: fakeMe(),
      auth: signedInAs(ada, "ADMIN"),
    })

    expect(await screen.findByText("Ada Lovelace (ADMIN)")).toBeInTheDocument()
    expect(
      screen.getByText("Iscritto il 2026-10-01T08:00:00.000Z")
    ).toBeInTheDocument()
  })

  it("dopo PATCH /me rilegge l'utente corrente", async () => {
    let reads = 0
    renderWithApi(<Profile />, {
      handlers: fakeMe({ onRead: () => reads++ }),
      auth: signedInAs(ada),
    })
    await screen.findByText("Ada Lovelace (OPERATORE)")

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Rinomina" }))

    expect(
      await screen.findByText("Grace Lovelace (OPERATORE)")
    ).toBeInTheDocument()
    expect(reads).toBe(2)
  })

  it("un operatore disattivato vede il testo di oggi nel toast, senza ritentare", async () => {
    let reads = 0
    renderWithApi(<Profile />, {
      handlers: fakeMe({ onRead: () => reads++ }),
      auth: rejectingWith(new OperatorDisabled()),
    })

    expect(
      await screen.findByText("Errore: OperatorDisabled")
    ).toBeInTheDocument()
    expect(await screen.findByText("Utente disattivato")).toBeInTheDocument()
    expect(reads).toBe(0)
  })

  it("l'errore dichiarato di una mutation arriva nel toast", async () => {
    renderWithApi(<Profile />, {
      handlers: fakeMe({ failWrite: true }),
      auth: signedInAs(ada),
    })
    await screen.findByText("Ada Lovelace (OPERATORE)")

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Rinomina" }))

    expect(await screen.findByText("Operatore non trovato")).toBeInTheDocument()
  })

  it("un 500 diventa ApiUnavailable, ritentato tre volte", async () => {
    let reads = 0
    renderWithApi(<Profile />, {
      handlers: fakeMe({ onRead: () => reads++, dies: true }),
      auth: signedInAs(ada),
    })

    expect(
      await screen.findByText("Errore: ApiUnavailable", {}, { timeout: 3000 })
    ).toBeInTheDocument()
    await waitFor(() =>
      expect(
        screen.getByText("Il servizio non risponde, riprova tra poco")
      ).toBeInTheDocument()
    )
    expect(reads).toBe(4)
  })
})
