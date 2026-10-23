import { describe, expect, it } from "vitest"
import { type BackupRun, backupsToDelete } from "../backupsToDelete"

const NOW = new Date("2026-11-01T12:00:00Z")
const daysAgo = (days: number) =>
  new Date(NOW.getTime() - days * 86_400_000).toISOString()

const deploy = (id: string, days: number): BackupRun => ({
  id,
  type: "ON_DEMAND",
  description: `deploy ${id}abcdef`,
  windowStartTime: daysAgo(days),
})

describe("backupsToDelete", () => {
  it("deletes the oldest deploy backups past 7 days, keeping the last 3", () => {
    const backups: BackupRun[] = [
      deploy("1", 14),
      deploy("2", 13),
      deploy("3", 12),
      deploy("4", 11),
      deploy("5", 10),
      { id: "a1", type: "AUTOMATED", windowStartTime: daysAgo(20) },
      { id: "a2", type: "AUTOMATED", windowStartTime: daysAgo(30) },
    ]

    expect(backupsToDelete(backups, NOW).map((b) => b.id)).toStrictEqual([
      "1",
      "2",
    ])
  })

  it("never picks automated backups or those taken by hand", () => {
    const backups: BackupRun[] = [
      { id: "a", type: "AUTOMATED", windowStartTime: daysAgo(40) },
      {
        id: "m",
        type: "ON_DEMAND",
        description: "before the import",
        windowStartTime: daysAgo(40),
      },
      { id: "n", type: "ON_DEMAND", windowStartTime: daysAgo(40) },
    ]

    expect(backupsToDelete(backups, NOW)).toStrictEqual([])
  })

  it("keeps 3 deploy backups even when all of them are old", () => {
    const backups = [
      deploy("1", 40),
      deploy("2", 30),
      deploy("3", 20),
      deploy("4", 10),
    ]

    expect(backupsToDelete(backups, NOW).map((b) => b.id)).toStrictEqual(["1"])
  })

  it("keeps the deploy backups of the last 7 days, however many", () => {
    const backups = [1, 2, 3, 4, 5, 6].map((d) => deploy(String(d), d))

    expect(backupsToDelete(backups, NOW)).toStrictEqual([])
  })

  it("deletes nothing when there are no backups", () => {
    expect(backupsToDelete([], NOW)).toStrictEqual([])
  })
})
