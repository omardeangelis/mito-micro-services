"use client"

import { useCallback, useEffect, useRef } from "react"

/** The trigger of `ContactStateSelect` carries this attribute. */
const TRIGGER_SELECTOR = "[data-contact-state-trigger]"

/** Where the save started: the cell, its row and the row's position. */
type Origin = {
  cell: HTMLElement
  row: HTMLTableRowElement
  table: HTMLTableElement
  rowIndex: number
}

const focusIsLost = () =>
  document.activeElement === null || document.activeElement === document.body

const bodyRows = (table: HTMLTableElement) =>
  Array.from(table.querySelectorAll<HTMLTableRowElement>(":scope > tbody > tr"))

/**
 * Focuses the selector of the first row from `next` on, else of the last row
 * before `previous` (included), else the table itself.
 */
const focusNearestRow = (
  table: HTMLTableElement,
  next: number,
  previous: number
) => {
  const rows = bodyRows(table)
  const after = rows.slice(next)
  const before = rows.slice(0, Math.max(previous + 1, 0)).reverse()
  for (const row of [...after, ...before]) {
    const trigger = row.querySelector<HTMLElement>(TRIGGER_SELECTOR)
    if (trigger) {
      trigger.focus()
      return
    }
  }
  // The table is not focusable by default: -1 keeps it out of the tab order
  if (!table.hasAttribute("tabindex")) table.tabIndex = -1
  table.focus()
}

const restoreFocus = ({ cell, row, table, rowIndex }: Origin) => {
  // The user moved the focus somewhere else while waiting: leave it there
  if (!focusIsLost() && !cell.contains(document.activeElement)) return

  if (document.contains(cell)) {
    // The row is still there with a control (the selector, or the "+" that
    // became the selector): the focus stays on the row
    const control = cell.querySelector<HTMLElement>(
      `${TRIGGER_SELECTOR}, button`
    )
    if (control) {
      if (document.activeElement !== control) control.focus()
      return
    }
  }
  if (!document.contains(table)) return

  if (document.contains(row)) {
    // The row stayed but has no control left (read-only now)
    focusNearestRow(table, row.sectionRowIndex + 1, row.sectionRowIndex - 1)
  } else {
    // The row left the table: the next one took its position
    focusNearestRow(table, rowIndex, rowIndex - 1)
  }
}

/**
 * Keeps the focus off `body` after a save from a table row: once the saved
 * value is on screen, if the row's control is gone (the row left the table's
 * filters, or the selector became read-only) the focus goes to the selector
 * of the next row, else of the previous one, else to the table.
 *
 * `remember()` before the call, `settle()` once the refresh is rendered,
 * `forget()` when something else takes the focus (a confirmation modal). If
 * the row unmounts while a save is remembered, the focus is settled then.
 */
export const useRowFocusAfterSave = (cellRef: React.RefObject<HTMLElement>) => {
  const origin = useRef<Origin | null>(null)

  const remember = useCallback(() => {
    const cell = cellRef.current
    const row = cell?.closest("tr")
    const table = row?.closest("table")
    origin.current =
      cell && row && table
        ? { cell, row, table, rowIndex: row.sectionRowIndex }
        : null
  }, [cellRef])

  const forget = useCallback(() => {
    origin.current = null
  }, [])

  const settle = useCallback(() => {
    const saved = origin.current
    origin.current = null
    if (saved) restoreFocus(saved)
  }, [])

  // The refresh removed the row: this runs after the new rows are in the DOM
  useEffect(() => settle, [settle])

  return { remember, forget, settle }
}
