export const DEFUALTTIMEFRAME = "30d"

export const TIMEFRAMEMAP = {
  "30d": {
    start: new Date(new Date().setDate(new Date().getDate() - 30)),
    end: new Date(),
  },
  "90d": {
    start: new Date(new Date().setDate(new Date().getDate() - 90)),
    end: new Date(),
  },
  "365d": {
    start: new Date(new Date().setDate(new Date().getDate() - 365)),
    end: new Date(),
  },
}

export const TIMEFRAMEOPTIONS = Object.keys(TIMEFRAMEMAP) as TimeFrame[]

export type TimeFrame = keyof typeof TIMEFRAMEMAP

export const TIMEFRAMEDELTA = {
  "30d": {
    start: new Date(new Date().setDate(new Date().getDate() - 30 * 2)),
    end: new Date(new Date().setDate(new Date().getDate() - 30)),
  },
  "90d": {
    start: new Date(new Date().setDate(new Date().getDate() - 90 * 2)),
    end: new Date(new Date().setDate(new Date().getDate() - 90)),
  },
  "365d": {
    start: new Date(new Date().setDate(new Date().getDate() - 365 * 2)),
    end: new Date(new Date().setDate(new Date().getDate() - 365)),
  },
}

export const financeCardFormattingSettings = {
  month: "2-digit",
  year: "numeric",
  day: "numeric",
} satisfies Intl.DateTimeFormatOptions
