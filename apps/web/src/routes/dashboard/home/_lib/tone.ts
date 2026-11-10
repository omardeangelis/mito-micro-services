/** The tone of a text of the admin's home: only the two cases of trouble have a color */
export type Tone = "muted" | "warning" | "danger"

export const toneClass: Record<Tone, string> = {
  muted: "text-muted-foreground",
  warning: "text-warning-soft-foreground",
  danger: "text-destructive-text",
}
