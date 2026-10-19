import { afterEach, beforeEach, describe, expect, it, vi } from "vitest"
import { saveReturnFocus, takeReturnFocus } from "../returnFocus"

const now = 1_700_000_000_000

beforeEach(() => {
  sessionStorage.clear()
})

afterEach(() => {
  vi.restoreAllMocks()
})

describe("returnFocus", () => {
  it("gives back the contact the detail was opened from, once", () => {
    saveReturnFocus(42, now)

    expect(takeReturnFocus(now + 1_000)).toEqual({ kind: "row", id: 42 })
    expect(takeReturnFocus(now + 1_000)).toEqual({ kind: "none" })
  })

  it("a detail that was no contact (a bad id in the address) gives back the table", () => {
    saveReturnFocus(undefined, now)

    expect(takeReturnFocus(now + 1_000)).toEqual({ kind: "table" })
    expect(takeReturnFocus(now + 1_000)).toEqual({ kind: "none" })
  })

  it("has nothing to give when nothing was saved", () => {
    expect(takeReturnFocus(now)).toEqual({ kind: "none" })
  })

  it("keeps the last contact saved", () => {
    saveReturnFocus(1, now)
    saveReturnFocus(2, now)

    expect(takeReturnFocus(now)).toEqual({ kind: "row", id: 2 })
  })

  it("ignores a value older than 30 seconds and forgets it", () => {
    saveReturnFocus(42, now)
    expect(takeReturnFocus(now + 30_000)).toEqual({ kind: "row", id: 42 })

    saveReturnFocus(42, now)
    expect(takeReturnFocus(now + 30_001)).toEqual({ kind: "none" })
    expect(sessionStorage.length).toBe(0)
  })

  it("ignores a value saved in the future", () => {
    saveReturnFocus(42, now + 5_000)

    expect(takeReturnFocus(now)).toEqual({ kind: "none" })
  })

  it.each([
    ["not json", "not json"],
    ["not an object", "42"],
    ["an id that is not a number", JSON.stringify({ id: "42", at: now })],
    ["a negative id", JSON.stringify({ id: -3, at: now })],
    ["a fractional id", JSON.stringify({ id: 1.5, at: now })],
    ["a missing time", JSON.stringify({ id: 42 })],
  ])("ignores and forgets a value that is %s", (_name, stored) => {
    saveReturnFocus(1, now)
    const key = sessionStorage.key(0)!
    sessionStorage.setItem(key, stored)

    expect(takeReturnFocus(now)).toEqual({ kind: "none" })
    expect(sessionStorage.length).toBe(0)
  })

  describe("when the storage is not available", () => {
    it("does not throw when saving", () => {
      vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
        throw new DOMException("denied", "SecurityError")
      })

      expect(() => saveReturnFocus(42, now)).not.toThrow()
    })

    it("says so when reading, so the caller can fall back to the table", () => {
      vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
        throw new DOMException("denied", "SecurityError")
      })

      expect(takeReturnFocus(now)).toEqual({ kind: "unavailable" })
    })
  })
})
