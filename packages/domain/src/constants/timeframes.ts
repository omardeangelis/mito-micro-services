export const TIMEFRAMEOPTIONS = ["30d", "90d", "365d"] as const

export type TimeFrame = (typeof TIMEFRAMEOPTIONS)[number]

export const DEFAULTTIMEFRAME = "30d" satisfies TimeFrame

/**
 * Reads a period from an untrusted value, such as the `tf` query param.
 * Returns it when it is one of the options, `DEFAULTTIMEFRAME` otherwise
 * (absent, null, unknown, or a list from a repeated param).
 */
export const parseTimeFrame = (
  value: string | string[] | null | undefined
): TimeFrame =>
  TIMEFRAMEOPTIONS.find((option) => option === value) ?? DEFAULTTIMEFRAME

export const financeCardFormattingSettings = {
  month: "2-digit",
  year: "numeric",
  day: "numeric",
  timeZone: "Europe/Rome",
} satisfies Intl.DateTimeFormatOptions
