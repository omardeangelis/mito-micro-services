import { type BlackListStatus } from "@mito/contract/customer"
import { type ImportStatus as ImportStatusSchema } from "@mito/contract/import"
import { type ProductMapType } from "@mito/domain/constants/productMap"
import { type TaskStatus } from "@mito/domain/schemas"

// The tones of the color meanings (spec design-system-web, appendix B): each
// tone has the tokens `tag-<tone>-bg`, `-border`, `-text` and `-dot`

export type Tone =
  | "blue"
  | "indigo"
  | "magenta"
  | "orange"
  | "amber"
  | "teal"
  | "green"
  | "red"
  | "neutral"

// Whole class names, never composed: Tailwind finds them in the sources, and
// the color gate flags `bg-${…}`

/** The fill, border and text of a badge of the tone */
export const toneClasses: Record<Tone, string> = {
  blue: "bg-tag-blue-bg border-tag-blue-border text-tag-blue-text",
  indigo: "bg-tag-indigo-bg border-tag-indigo-border text-tag-indigo-text",
  magenta: "bg-tag-magenta-bg border-tag-magenta-border text-tag-magenta-text",
  orange: "bg-tag-orange-bg border-tag-orange-border text-tag-orange-text",
  amber: "bg-tag-amber-bg border-tag-amber-border text-tag-amber-text",
  teal: "bg-tag-teal-bg border-tag-teal-border text-tag-teal-text",
  green: "bg-tag-green-bg border-tag-green-border text-tag-green-text",
  red: "bg-tag-red-bg border-tag-red-border text-tag-red-text",
  neutral: "bg-tag-neutral-bg border-tag-neutral-border text-tag-neutral-text",
}

/** The dot of the tone: a legend, a chart slice or a bar */
export const toneDot: Record<Tone, string> = {
  blue: "bg-tag-blue-dot",
  indigo: "bg-tag-indigo-dot",
  magenta: "bg-tag-magenta-dot",
  orange: "bg-tag-orange-dot",
  amber: "bg-tag-amber-dot",
  teal: "bg-tag-teal-dot",
  green: "bg-tag-green-dot",
  red: "bg-tag-red-dot",
  neutral: "bg-tag-neutral-dot",
}

const stateTones: Record<TaskStatus, Tone> = {
  chiamare: "blue",
  followup: "magenta",
  "non risponde": "orange",
  richiamare: "amber",
  "app.to": "teal",
  caricato: "indigo",
  erogata: "green",
  "non interessato": "red",
  nessuno: "neutral",
}

/** The tone of a contact's state; a null state is `nessuno` */
export const stateTone = (state: TaskStatus | null): Tone =>
  state === null ? "neutral" : stateTones[state]

const productTones: Record<ProductMapType, Tone> = {
  Personale: "green",
  auto: "blue",
  Finalizzato: "amber",
}

/** The tone of a product type; a product without a type is neutral */
export const productTone = (type: ProductMapType | undefined): Tone =>
  type === undefined ? "neutral" : productTones[type]

const blacklistTones: Record<BlackListStatus, Tone> = {
  blacklisted: "red",
  review: "amber",
  whitelisted: "green",
}

/** The tone of a customer's blacklist status */
export const blacklistTone = (status: BlackListStatus): Tone =>
  blacklistTones[status]

type ImportStatus = typeof ImportStatusSchema.Type

const importTones: Record<ImportStatus, Tone> = {
  running: "neutral",
  completed: "green",
  failed: "red",
  interrupted: "amber",
}

/** The tone of an import's status */
export const importTone = (status: ImportStatus): Tone => importTones[status]
