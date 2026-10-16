// The notes being deleted, for each customer (AC78). Outside the components:
// closing "Note", or opening another customer and coming back, unmounts the
// notes, and the wait must still be there until the page drops the note.

import { useSyncExternalStore } from "react"

export type Deletion = {
  id: number
  /** The notes whose trash takes the focus once it is gone, nearest first */
  next: number[]
  /** The focus is still on its trash: nothing else was clicked or focused since */
  focused: boolean
}

const EMPTY: number[] = []
const deletions = new Map<string, Deletion[]>()
// The ids of each customer, a new array at each change: the snapshot
const ids = new Map<string, number[]>()
// The chats of each customer on screen
const chats = new Map<string, number>()
const listeners = new Set<() => void>()

function keep(customerId: string, kept: Deletion[]) {
  deletions.set(customerId, kept)
  ids.set(customerId, kept.length ? kept.map((d) => d.id) : EMPTY)
  listeners.forEach((listener) => listener())
}

const deletionsOf = (customerId: string) => deletions.get(customerId) ?? []

/** The ids of the notes of `customerId` being deleted. */
export function useDeletingNotes(customerId: string): number[] {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => ids.get(customerId) ?? EMPTY,
    () => EMPTY
  )
}

export function startDeleting(customerId: string, id: number, next: number[]) {
  const trash = document.activeElement
  keep(customerId, [
    ...deletionsOf(customerId).filter((d) => d.id !== id),
    {
      id,
      next,
      focused: trash?.getAttribute("data-note-id") === String(id),
    },
  ])
}

export function stopDeleting(customerId: string, id: number) {
  keep(
    customerId,
    deletionsOf(customerId).filter((d) => d.id !== id)
  )
}

/** The deletions whose note is not among `shown` any more: they are done. */
export function takeDeleted(customerId: string, shown: number[]): Deletion[] {
  const current = deletionsOf(customerId)
  const gone = current.filter((d) => !shown.includes(d.id))
  if (gone.length) {
    keep(
      customerId,
      current.filter((d) => shown.includes(d.id))
    )
  }
  return gone
}

/**
 * The operator clicked or focused something: only the trash it lands on keeps
 * the focus (a second click on a busy trash).
 */
export function leaveTrashes(event: Event) {
  const trash =
    event.target instanceof Element
      ? event.target.closest("[data-note-id]")?.getAttribute("data-note-id")
      : undefined
  deletions.forEach((list) =>
    list.forEach((d) => {
      if (String(d.id) !== trash) d.focused = false
    })
  )
}

/** A chat of `customerId` is on screen until the returned cleanup runs. */
export function showChat(customerId: string) {
  chats.set(customerId, (chats.get(customerId) ?? 0) + 1)
  return () => {
    const count = (chats.get(customerId) ?? 1) - 1
    if (count) chats.set(customerId, count)
    else chats.delete(customerId)
  }
}

export const isChatShown = (customerId: string) => chats.has(customerId)

/** Signing out: the next operator in this tab sees no wait. */
export function clearDeletingNotes() {
  deletions.clear()
  ids.clear()
  listeners.forEach((listener) => listener())
}
