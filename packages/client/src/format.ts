export const formatBigNumber = (value: number | string) => {
  const item = Number(value)
  const formatter = new Intl.NumberFormat("it-IT", {
    style: "decimal",
    notation: "compact",
    compactDisplay: "short",
  })

  return formatter.format(item)
}

export const formatBigNumberWithCurrency = (value: number | string) => {
  const item = Number(value)
  const formatter = new Intl.NumberFormat("it-IT", {
    style: "currency",
    notation: "compact",
    compactDisplay: "short",
    currency: "EUR",
  })

  return formatter.format(item)
}

export const formatDeadline = (
  date: Date | undefined | string,
  options?: {
    precision?: "day" | "hour"
  }
) => {
  if (!date) return undefined
  let dateObj = date
  if (typeof date === `string`) {
    dateObj = new Date(date)
  }
  if (dateObj instanceof Date) {
    // const dateWithoutTime = dateWithoutTimeZone(dateObj)
    return Intl.DateTimeFormat(`it-IT`, {
      year: `numeric`,
      month: `2-digit`,
      day: `2-digit`,
      hour: options?.precision === "hour" ? `numeric` : undefined,
      minute: options?.precision === "hour" ? `numeric` : undefined,
      hour12: true,
    }).format(dateObj)
  }
  return undefined
}

// Numeric input parsing utilities
export const CURRENCY_SYMBOLS = [
  "€",
  "$",
  "£",
  "¥",
  "₹",
  "₽",
  "₩",
  "₪",
  "₦",
  "₨",
  "₫",
  "₭",
  "₮",
  "₯",
  "₰",
  "₱",
  "₲",
  "₳",
  "₴",
  "₵",
  "₶",
  "₷",
  "₸",
  "₹",
  "₺",
  "₻",
  "₼",
  "₽",
  "₾",
  "₿",
]
export const INVALID_NUMERIC_INPUTS = [
  "",
  ".",
  ",",
  "-",
  "+",
  "e",
  "E",
] as const

const alphabethPattern = /[a-zA-Z]/g

const cleanInput = (value?: string | number) => {
  if (!value) {
    return ``
  }
  const valueAsString = typeof value === "number" ? value.toString() : value
  const currencySymbolsPattern = new RegExp(
    `[${CURRENCY_SYMBOLS.join(``)}]`,
    `g`
  )
  const parsed = valueAsString
    .replace(currencySymbolsPattern, ``)
    .replace(alphabethPattern, ``)
    .replace(/[%]/, ``)
    .replace(/[" "]/g, ``)
    .trim()

  return parsed
}

export const handleMixedSeparators = (value: string) => {
  const parts = value.split(/[,.]/)

  // If we have exactly 3 parts, assume the last one is decimal
  if (parts.length === 3) {
    // Join all parts except last, then add decimal point and last part
    return `${parts.slice(0, -1).join(``)}.${parts[parts.length - 1]}`
  }

  // If we have more than 3 parts, handle as a special case
  if (parts.length > 3) {
    // Get the last part as decimal and join the rest
    const decimalPart = parts.pop()

    return `${parts.join(``)}.${decimalPart}`
  }

  if (parts.length === 2) {
    return `${parts[0]}.${parts[1]}`
  }

  return parts.join(``)
}

const processDecimalPart = (value: string) => {
  // Handle regular thousand separators vs decimal separators
  let processedValue = value

  if (value.includes(`,`)) {
    const parts = value.split(`,`)

    // If the part after comma has exactly 2 digits, treat comma as decimal separator
    if (parts[1] && parts[1].length <= 2) {
      processedValue = value.replace(`,`, `.`)
    } else {
      // Otherwise, remove the comma (thousand separator)
      processedValue = value.replace(/,/g, ``)
    }
  }

  // Handle multiple decimal points
  const split = processedValue.split(`.`)
  const parsedHas2Commas = split.length > 1

  if (parsedHas2Commas) {
    const decimalPart = split.pop()

    return `${split.join(``)}.${decimalPart}`
  }

  if (split.length === 2) {
    if (split[1] && split[1].length <= 3) {
      return `${split[0]}.${split[1]}`
    }
  }

  return processedValue
}

export const parseInputValue = (value?: string) => {
  if (!value) {
    return ``
  }
  const parsed = cleanInput(value)

  // Early return for invalid inputs
  if (
    INVALID_NUMERIC_INPUTS.includes(
      parsed as (typeof INVALID_NUMERIC_INPUTS)[number]
    )
  ) {
    return ``
  }

  // First, handle the case where we have mixed separators
  if (parsed.includes(`,`) && parsed.includes(`.`)) {
    return handleMixedSeparators(parsed)
  }

  // Handle regular thousand separators vs decimal separators
  const processedValue = processDecimalPart(parsed)

  return processedValue
}

export const parseStringToNumber = (value: string): number => {
  const parsed = parseInputValue(value)
  if (!parsed) {
    return NaN
  }
  return Number(parsed)
}

/**
 * Converte un valore di reddito in una stringa numerica valida o undefined.
 * Usato per assicurarsi che non venga mai passato NaN o stringhe vuote al database.
 * @param value - Il valore da convertire (stringa, numero, null, undefined, o vuoto)
 * @returns Una stringa numerica valida o undefined se il valore non è valido
 */
export const sanitizeRedditoValue = (
  value: string | number | null | undefined
): string | undefined => {
  // Se è null o undefined, ritorna undefined
  if (value === null || value === undefined) {
    return undefined
  }

  // Se è un numero, convertilo in stringa e verifica che sia valido
  if (typeof value === "number") {
    if (isNaN(value) || !isFinite(value)) {
      return undefined
    }
    return value.toString()
  }

  // Se è una stringa vuota o solo spazi, ritorna undefined
  if (value === "" || value.trim() === "") {
    return undefined
  }

  // Pulisci e valida la stringa
  const parsed = parseInputValue(value)
  if (!parsed || parsed === "") {
    return undefined
  }

  const num = parseStringToNumber(parsed)
  if (isNaN(num) || !isFinite(num)) {
    return undefined
  }

  return parsed
}
