import { screen, waitFor } from "@testing-library/react"
import userEvent from "@testing-library/user-event"
import { describe, expect, it, vi } from "vitest"
import { type AssignInput } from "@mito/contract/import"
import {
  useAssign,
  useMove,
  useMoveCandidates,
  useSetDeadline,
  useWave,
} from "@/api/import"
import { analyticsKeys } from "@/api/analytics"
import { customerKeys } from "@/api/customer"
import { taskKeys } from "@/api/task"
import { ada, renderWithApi, signedInAs } from "@/test/api"
import { fakeImport, waveView } from "@/test/import"

const REQUEST_ID = "7b1c3a4e-5d2f-4c8a-9e1b-0a2b3c4d5e6f"
const assignment: AssignInput = {
  requestId: REQUEST_ID,
  receivers: [{ operatorId: 7, count: 3 }],
}

function WavePage({
  onSuccess,
  onError,
}: {
  onSuccess?: () => void
  onError?: () => void
}) {
  const wave = useWave(5)
  const assign = useAssign(5, { onSuccess, onError })
  const deadline = useSetDeadline(5)
  const candidates = useMoveCandidates(5)
  const move = useMove(5)
  if (wave.isPending) return <p>Caricamento</p>
  if (wave.isError) return <p>Errore: {wave.error._tag}</p>
  return (
    <>
      <p>{wave.data.name}</p>
      <p>Da assegnare: {wave.data.toAssign}</p>
      <p>Scadenza: {wave.data.deadline ?? "nessuna"}</p>
      <button onClick={() => assign.mutate(assignment)}>Assegna</button>
      <button
        onClick={() =>
          deadline.mutate({ deadline: "2026-12-01", kind: "confirm" })
        }
      >
        Scadenza
      </button>
      <button onClick={() => candidates.mutate({ from: [7] })}>
        Candidati
      </button>
      <button
        onClick={() =>
          move.mutate({
            requestId: REQUEST_ID,
            which: "both",
            strategy: "equal",
            contacts: [{ fromOperatorId: 7, taskIds: [1] }],
            receivers: [{ operatorId: 8, count: 1 }],
          })
        }
      >
        Sposta
      </button>
      {assign.isError ? <p>Assegna: {assign.error._tag}</p> : null}
      {deadline.isError ? <p>Scadenza: {deadline.error._tag}</p> : null}
      {move.isError ? <p>Sposta: {move.error._tag}</p> : null}
      {candidates.data ? (
        <p>Candidati: {candidates.data.candidates.length}</p>
      ) : null}
    </>
  )
}

const noToast = () =>
  expect(document.querySelector("[data-sonner-toast]")).toBeNull()

describe("il data layer sul gruppo import: la Wave", () => {
  it("una mutazione riuscita rilegge wave", async () => {
    const backend = fakeImport({ wave: waveView({ name: "Ottobre" }) })
    renderWithApi(<WavePage />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })
    await screen.findByText("Ottobre")
    expect(backend.asked("wave")).toBe(1)

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Assegna" }))

    await waitFor(() => expect(backend.asked("wave")).toBe(2))
    expect(backend.state.assigns).toEqual([{ id: 5, input: assignment }])
    expect(backend.state.waveReads).toEqual([5, 5])
  })

  it.each([
    ["Assegna", [taskKeys.all, customerKeys.all, analyticsKeys.all]],
    ["Sposta", [taskKeys.all, customerKeys.all, analyticsKeys.all]],
    ["Scadenza", [taskKeys.all]],
  ] as const)(
    "«%s» riuscito invalida le cache dei contatti e di ciò che li legge",
    async (button, roots) => {
      const backend = fakeImport()
      const { queryClient } = renderWithApi(<WavePage />, {
        handlers: backend.handlers,
        auth: signedInAs(ada, "ADMIN"),
      })
      await screen.findByText("Da assegnare: 4")
      const keys = [
        [...taskKeys.all, "cached"],
        [...customerKeys.all, "cached"],
        [...analyticsKeys.all, "cached"],
      ] as const
      for (const key of keys) queryClient.setQueryData(key, "old")

      await userEvent
        .setup()
        .click(screen.getByRole("button", { name: button }))

      await waitFor(() => expect(backend.asked("wave")).toBeGreaterThan(1))
      for (const key of keys) {
        const invalidated = queryClient.getQueryState(key)?.isInvalidated
        expect(invalidated).toBe(roots.some((root) => root[0] === key[0]))
      }
    }
  )

  it("la scadenza cambiata si rilegge nella Wave", async () => {
    const backend = fakeImport({ wave: waveView({ deadline: null }) })
    renderWithApi(<WavePage />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })
    await screen.findByText("Scadenza: nessuna")

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Scadenza" }))

    expect(await screen.findByText("Scadenza: 2026-12-01")).toBeInTheDocument()
  })

  it("i candidati sono una lettura: non si rileggono dalla cache né invalidano wave", async () => {
    const backend = fakeImport({
      candidates: [
        { operatorId: 7, contacts: [{ taskId: 1, state: "toCall" }] },
      ],
    })
    renderWithApi(<WavePage />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })
    await screen.findByText("Da assegnare: 4")

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Candidati" }))

    expect(await screen.findByText("Candidati: 1")).toBeInTheDocument()
    expect(backend.asked("wave")).toBe(1)
    expect(backend.state.candidateReads).toEqual([{ id: 5, from: [7] }])
  })

  it("una mutazione con esito incerto non mostra il toast globale", async () => {
    const backend = fakeImport()
    backend.state.outcome.assign = "uncertain"
    renderWithApi(<WavePage />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })
    await screen.findByText("Da assegnare: 4")

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Assegna" }))

    expect(
      await screen.findByText("Assegna: ApiUnavailable")
    ).toBeInTheDocument()
    noToast()
  })

  it("una lettura wave fallita con ApiUnavailable non mostra il toast globale", async () => {
    const backend = fakeImport()
    backend.state.outcome.wave = "uncertain"
    renderWithApi(<WavePage />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })

    expect(
      await screen.findByText("Errore: ApiUnavailable", {}, { timeout: 3000 })
    ).toBeInTheDocument()
    noToast()
  })

  it("gli errori dichiarati arrivano alla pagina col loro tag, senza toast", async () => {
    const backend = fakeImport()
    backend.state.outcome.assign = "numbersChanged"
    backend.state.outcome.setDeadline = "deadlineInvalid"
    backend.state.outcome.move = "nothingToMove"
    renderWithApi(<WavePage />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })
    await screen.findByText("Da assegnare: 4")
    const user = userEvent.setup()

    await user.click(screen.getByRole("button", { name: "Assegna" }))
    await user.click(screen.getByRole("button", { name: "Scadenza" }))
    await user.click(screen.getByRole("button", { name: "Sposta" }))

    expect(
      await screen.findByText("Assegna: NumbersChanged")
    ).toBeInTheDocument()
    expect(
      await screen.findByText("Scadenza: DeadlineInvalid")
    ).toBeInTheDocument()
    expect(await screen.findByText("Sposta: NothingToMove")).toBeInTheDocument()
    noToast()
  })

  it("un esito arrivato dopo lo smontaggio chiama la callback dell'hook", async () => {
    const backend = fakeImport()
    const onSuccess = vi.fn()
    const { unmount } = renderWithApi(<WavePage onSuccess={onSuccess} />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })
    await screen.findByText("Da assegnare: 4")

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Assegna" }))
    unmount()

    await waitFor(() => expect(onSuccess).toHaveBeenCalledTimes(1))
    expect(onSuccess.mock.calls[0]?.[0]).toMatchObject({ assigned: 4 })
  })

  it("un errore arrivato dopo lo smontaggio chiama la callback onError", async () => {
    const backend = fakeImport()
    backend.state.outcome.assign = "numbersChanged"
    const onError = vi.fn()
    const { unmount } = renderWithApi(<WavePage onError={onError} />, {
      handlers: backend.handlers,
      auth: signedInAs(ada, "ADMIN"),
    })
    await screen.findByText("Da assegnare: 4")

    await userEvent
      .setup()
      .click(screen.getByRole("button", { name: "Assegna" }))
    unmount()

    await waitFor(() => expect(onError).toHaveBeenCalledTimes(1))
    expect(onError.mock.calls[0]?.[0]).toMatchObject({ _tag: "NumbersChanged" })
  })
})
