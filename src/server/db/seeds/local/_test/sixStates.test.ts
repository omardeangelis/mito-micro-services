// @vitest-environment node
import { describe, expect, it } from "vitest"
import { contactStates } from "@mito/domain/contact/status"
import { generateDataset } from "../generate"
import { legacyStateFailures } from "../verify"

const DAY = "2026-10-14"

describe("the six states (esiti-richiami-stati AC1, AC3)", () => {
  it("the check of `seed:local:verify` fails on a contact in `followup`, `erogata`, `nessuno` or without state, citing it", () => {
    const failures = legacyStateFailures([
      { id: 1, state: "chiamare" },
      { id: 2, state: "followup" },
      { id: 3, state: "erogata" },
      { id: 4, state: "nessuno" },
      { id: 5, state: null },
      { id: 6, state: "richiamare" },
    ])
    expect(failures).toEqual(
      [2, 3, 4, 5].map((id): unknown =>
        expect.objectContaining({ table: "task", key: id, column: "state" })
      )
    )
    expect(failures.map((failure) => failure.found)).toEqual([
      "followup",
      "erogata",
      "nessuno",
      null,
    ])
  })

  it("the check passes when every contact is in one of the six states", () => {
    expect(
      legacyStateFailures(contactStates.map((state, id) => ({ id, state })))
    ).toEqual([])
  })

  it("writes only the six states, in the contacts and in the log", () => {
    const dataset = generateDataset({ n: 300, day: DAY })
    const six = new Set<string | null | undefined>(contactStates)
    for (const task of dataset.tasks) {
      expect(six.has(task.state), `task ${task.id}`).toBe(true)
    }
    for (const row of dataset.taskEventLog) {
      for (const state of [row.fromState, row.toState, row.outcome]) {
        if (state == null) continue
        expect(six.has(state), `log ${row.id}`).toBe(true)
      }
    }
  })
})
