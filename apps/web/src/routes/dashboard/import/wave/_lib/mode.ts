import { type ReactNode } from "react"
import { type WaveView } from "@/api/import"

/** What the screen at the end of a flow says (AC17, AC27): `DoneScreen` draws it */
export type DoneContent = {
  readonly title: string
  readonly text: ReactNode
  /** The buttons, centered under the text */
  readonly actions: ReactNode
}

/**
 * What the page of a Wave shows under the header (AC3, AC9, AC10, AC22):
 * - `afterImport`: the flow «Dopo l'import», at step `at`;
 * - `overview`: the overview of the Wave;
 * - `assignRest`: the step «Assegna» alone, «Assegna i restanti»;
 * - `reassign`: the flow «Riassegna», at step `at`, with the givers chosen
 *   when it opened;
 * - `done`: the screen at the end of a flow, in its place (AC17).
 *
 * `per` is the person of a row of the team (`?per=<operatorId>`, D9), the only
 * one chosen in «Assegna»
 */
export type PageMode =
  | { readonly kind: "afterImport"; readonly at: number; readonly per?: number }
  | { readonly kind: "overview" }
  | { readonly kind: "assignRest"; readonly per?: number }
  | {
      readonly kind: "reassign"
      readonly at: number
      readonly from: readonly number[]
    }
  | { readonly kind: "done"; readonly screen: DoneContent }

/** The operator of `?per`, when it is a number of someone in the team (D9) */
export function perOperator(
  wave: Pick<WaveView, "team">,
  per: string | null
): number | undefined {
  if (per === null || !/^\d+$/.test(per)) return undefined
  const id = Number(per)
  return wave.team.some((member) => member.operatorId === id) ? id : undefined
}

/**
 * The mode the page opens in (AC2, AC3, D9). A Wave without a deadline opens
 * the flow at the first step, also with `?per`; one with the deadline the
 * overview, or «Assegna i restanti» alone for the person of `?per`. «Annulla»
 * leaves the page on the overview only while it stays open: a reload starts
 * here again
 */
export function initialMode(
  wave: Pick<WaveView, "deadline" | "team">,
  per: string | null
): PageMode {
  const operator = perOperator(wave, per)
  const withPer = operator === undefined ? {} : { per: operator }
  if (wave.deadline === null) return { kind: "afterImport", at: 0, ...withPer }
  if (operator !== undefined) return { kind: "assignRest", per: operator }
  return { kind: "overview" }
}

/** A key that changes with each screen: the focus goes to its title (AC31) */
export function screenKey(mode: PageMode): string {
  switch (mode.kind) {
    case "afterImport":
    case "reassign":
      return `${mode.kind}:${mode.at}`
    default:
      return mode.kind
  }
}
