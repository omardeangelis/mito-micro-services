// The unsent note of each customer (AC76): one state shared by every chat of
// that customer, so a send that settles after its chat closed, or while
// another chat of the customer is open, updates what the open chat shows.
// While the field holds a failed note, or a failed note is on its way again,
// the state is copied to the tab's sessionStorage and comes back after a
// reload. The copy belongs to the operator who wrote it: another operator in
// the same tab never sees it, and signing out clears it. Storage can be
// blocked: then the chat has no copy.

import { useSyncExternalStore } from "react"

const PREFIX = "mito:nota-non-inviata:"

/** `operatorId` is null when the operator was not loaded yet. */
export type StoredNote = { operatorId: number | null; text: string }

export type UnsentNote = {
  /** The text of the field */
  text: string
  /** The field holds a note that was not saved: "Nota non inviata, riprova" */
  failed: boolean
}

type Entry = {
  note: UnsentNote
  // Failed notes sent again: kept in the copy until the server has them
  resending: string[]
  // The operator of this tab, once loaded
  operatorId: number | null
  // The copy found in storage, until the operator says whose it is
  unchecked: StoredNote | null
  mounted: number
  listeners: Set<() => void>
}

const EMPTY: UnsentNote = { text: "", failed: false }
const entries = new Map<string, Entry>()
// Grows at each sign-out: a send started before it settles into nothing
let generation = 0

/** Failed text first, then what was typed after it. */
export const joinNotes = (...texts: string[]) =>
  texts.filter(Boolean).join("\n")

function readStored(customerId: string): StoredNote | null {
  try {
    const raw = window.sessionStorage.getItem(PREFIX + customerId)
    if (raw === null) return null
    const value = JSON.parse(raw) as Partial<StoredNote>
    if (typeof value.text !== "string") return null
    return {
      operatorId:
        typeof value.operatorId === "number" ? value.operatorId : null,
      text: value.text,
    }
  } catch {
    return null
  }
}

function writeStored(customerId: string, stored: StoredNote | null) {
  try {
    if (stored?.text) {
      window.sessionStorage.setItem(PREFIX + customerId, JSON.stringify(stored))
    } else {
      window.sessionStorage.removeItem(PREFIX + customerId)
    }
  } catch {
    // Blocked storage: no copy
  }
}

function entryOf(customerId: string): Entry {
  let entry = entries.get(customerId)
  if (!entry) {
    entry = {
      note: EMPTY,
      resending: [],
      operatorId: null,
      unchecked: readStored(customerId),
      mounted: 0,
      listeners: new Set(),
    }
    entries.set(customerId, entry)
  }
  return entry
}

function update(
  customerId: string,
  change: (entry: Entry) => Partial<UnsentNote> | void
) {
  const entry = entryOf(customerId)
  const next = change(entry)
  if (next) entry.note = { ...entry.note, ...next }
  // A copy not checked yet stays as it is: it may be this operator's, and
  // is joined with the field once the operator loads
  if (!entry.unchecked) {
    const keep = entry.note.failed || entry.resending.length > 0
    writeStored(
      customerId,
      keep
        ? {
            operatorId: entry.operatorId,
            text: joinNotes(...entry.resending, entry.note.text),
          }
        : null
    )
  }
  entry.listeners.forEach((listener) => listener())
}

function removeOne(list: string[], text: string) {
  const index = list.indexOf(text)
  if (index !== -1) list.splice(index, 1)
}

/** The unsent note of the customer, shared by all its chats. */
export function useUnsentNote(customerId: string): UnsentNote {
  return useSyncExternalStore(
    (listener) => {
      const { listeners } = entryOf(customerId)
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => entryOf(customerId).note,
    () => EMPTY
  )
}

/** A chat of the customer opens; the returned function closes it. */
export function openUnsentNote(customerId: string) {
  entryOf(customerId).mounted++
  return () => {
    const entry = entryOf(customerId)
    entry.mounted--
    // Text typed and never sent does not outlive the last chat
    if (entry.mounted === 0 && !entry.note.failed) {
      update(customerId, () => ({ text: "" }))
    }
  }
}

/** The operator loaded: the stored copy shows if it is theirs. */
export function checkUnsentNote(customerId: string, operatorId: number) {
  const entry = entryOf(customerId)
  entry.operatorId = operatorId
  const stored = entry.unchecked
  entry.unchecked = null
  update(customerId, ({ note }) => {
    if (!stored) return
    // A colleague's copy is removed unseen
    if (stored.operatorId !== null && stored.operatorId !== operatorId) return
    return { text: joinNotes(stored.text, note.text), failed: true }
  })
}

export function typeUnsentNote(customerId: string, text: string) {
  // An emptied field holds no unsent note any more
  update(customerId, ({ note }) => ({ text, failed: note.failed && !!text }))
}

/**
 * Takes the text of the field for a send, and returns it with the function
 * to call when the send answers: saved, or not.
 */
export function sendUnsentNote(customerId: string) {
  let sent = ""
  update(customerId, (entry) => {
    sent = entry.note.text
    if (entry.note.failed) entry.resending.push(sent)
    return { text: "", failed: false }
  })
  const startedIn = generation
  const settle = (saved: boolean) => {
    if (startedIn !== generation) return
    update(customerId, (entry) => {
      removeOne(entry.resending, sent)
      if (saved) return
      const text = joinNotes(sent, entry.note.text)
      return { text, failed: !!text }
    })
  }
  return { sent, settle }
}

/** The note could not leave: the operator was not loaded. */
export function refuseUnsentNote(customerId: string) {
  update(customerId, ({ note }) => ({ failed: !!note.text }))
}

/** On sign-out: the next person in this tab finds no note of the last one. */
export function clearUnsentNotes() {
  generation++
  try {
    const storage = window.sessionStorage
    const keys = Array.from({ length: storage.length }, (_, i) =>
      storage.key(i)
    )
    for (const key of keys) {
      if (key?.startsWith(PREFIX)) storage.removeItem(key)
    }
  } catch {
    // Blocked storage: nothing was saved
  }
  for (const [customerId, entry] of entries) {
    // A closed chat is forgotten; an open one is emptied
    if (entry.mounted === 0) entries.delete(customerId)
    entry.note = EMPTY
    entry.resending = []
    entry.operatorId = null
    entry.unchecked = null
    entry.listeners.forEach((listener) => listener())
  }
}
