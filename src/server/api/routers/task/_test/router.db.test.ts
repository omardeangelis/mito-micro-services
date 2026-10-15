import { describe, expect, it } from "vitest"
import { appRouter } from "@/server/api/root"

describe("task router", () => {
  it.each([
    "updateTask",
    "updateTaskFromDashboard",
    "createTask",
    "createAlert",
    "resolveAlerts",
    "deleteTasks",
    "bulkCreateTask",
  ])("non espone più la mutation senza guardia %s", (procedure) => {
    expect(Object.keys(appRouter._def.record.task._def.record)).not.toContain(
      procedure
    )
  })

  it.each([
    "changeState",
    "createContact",
    "setPriority",
    "setCallback",
    "resolveAlert",
    "reassign",
    "bulkHandleTask",
  ])("espone la mutation %s", (procedure) => {
    expect(Object.keys(appRouter._def.record.task._def.record)).toContain(
      procedure
    )
  })
})
