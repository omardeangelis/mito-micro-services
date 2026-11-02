// The day of the operator: the queue of open
// alerts, the diary of today's calls and the counters. Registering a call
// adds it to the diary (D2); Non risponde keeps the alert open (D1), the
// other outcomes close it. A closed row stays where it was until the page
// loads again, so a second click on the same spot never lands on the next
// client.

import * as React from "react"
import { format } from "date-fns"
import { toast } from "sonner"
import {
  type Callback,
  type Entry,
  type MyDay,
  type Outcome,
  type Scenario,
} from "./fixtures"
import { stateLabels } from "./shared"

export type Register = (
  row: Callback,
  outcome: Outcome,
  callbackOn?: Date,
  message?: string
) => void

export function useDay(scenario: Scenario) {
  const [queue, setQueue] = React.useState<Callback[]>(() => [
    ...scenario.overdue,
    ...scenario.today,
  ])
  const [diary, setDiary] = React.useState<Entry[]>(scenario.diary)
  const [myDay, setMyDay] = React.useState<MyDay>(scenario.myDay)

  const register: Register = (row, outcome, callbackOn, message) => {
    const at = new Date()
    setQueue((current) =>
      current.map((r) =>
        r.taskId !== row.taskId
          ? r
          : outcome === "non risponde"
            ? { ...r, state: "non risponde", triedAt: at }
            : { ...r, state: outcome, done: { outcome, callbackOn, at } }
      )
    )
    setMyDay((d) => ({
      calls: d.calls + 1,
      answered: d.answered + (outcome === "non risponde" ? 0 : 1),
      appointments: d.appointments + (outcome === "app.to" ? 1 : 0),
    }))
    setDiary((d) => [
      {
        id: `new-${at.getTime()}`,
        taskId: row.taskId,
        customer: row.customer,
        phone: row.phone,
        outcome,
        callbackOn,
        message,
        at,
        from: "richiamo",
      },
      ...d,
    ])
    toast(
      `Registrato: ${
        outcome === "richiamare" && callbackOn
          ? `richiamo il ${format(callbackOn, "dd/MM")}`
          : stateLabels[outcome]
      } · ${row.customer}`,
      message ? { description: message } : undefined
    )
  }

  return {
    queue,
    diary,
    myDay,
    register,
  }
}

/**
 * After a row closes, the link of the row at `index` gets the focus: the
 * caller picks the next open one. The focus moves in an effect, after the
 * commit that closed the row and hid its buttons.
 */
export function useRowFocus() {
  const pending = React.useRef<{
    container: React.RefObject<HTMLElement | null>
    index: number
  } | null>(null)
  const [request, setRequest] = React.useState(0)
  React.useEffect(() => {
    const p = pending.current
    if (!p) return
    pending.current = null
    p.container.current
      ?.querySelector<HTMLElement>(`[data-row="${p.index}"] a`)
      ?.focus()
  }, [request])
  return (container: React.RefObject<HTMLElement | null>, index: number) => {
    pending.current = { container, index }
    setRequest((n) => n + 1)
  }
}
