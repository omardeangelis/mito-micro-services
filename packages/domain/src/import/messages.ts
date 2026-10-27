// The reasons a row of an import file is discarded, in Italian (AC40). The
// reason of a value names the columns of the file it comes from (AC11).

/** What a reason talks about: columns of the file, or the file's name. */
export type Subject = { text: string; many: boolean }

const list = (columns: readonly string[]) => {
  const names = columns.map((column) => `"${column}"`)
  if (names.length < 2) return names.join("")
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`
}

export const columnsSubject = (...columns: string[]): Subject =>
  columns.length > 1
    ? { text: `${list(columns)} insieme`, many: true }
    : { text: list(columns), many: false }

export const fileNameSubject: Subject = {
  text: "Il nome del file",
  many: false,
}

const say = ({ text, many }: Subject, one: string, more: string) =>
  `${text} ${many ? more : one}`

export const reasons = {
  missing: (column: string) => `Manca il dato "${column}"`,
  missingFiscalData: "Manca il codice fiscale o la partita IVA del cliente",
  duplicateCustomerCode: "Codice cliente già usato da un altro cliente",
  unreadableRow: "La riga ha un valore che l'import non sa leggere",
  tooLong: (subject: Subject, max: number) =>
    say(
      subject,
      `è troppo lungo (al massimo ${max} caratteri)`,
      `sono troppo lunghi (al massimo ${max} caratteri)`
    ),
  notANumber: (subject: Subject) =>
    say(subject, "non è un numero", "non sono numeri"),
  notAnInteger: (subject: Subject) =>
    say(subject, "non è un numero intero", "non sono numeri interi"),
  outOfRange: (subject: Subject) =>
    say(
      subject,
      "è fuori dall'intervallo consentito",
      "sono fuori dall'intervallo consentito"
    ),
  notADate: (subject: Subject) =>
    say(subject, "non è una data leggibile", "non sono date leggibili"),
  notText: (subject: Subject) =>
    say(subject, "non è un testo", "non sono testi"),
  invalid: (subject: Subject) =>
    say(subject, "non ha un valore valido", "non hanno un valore valido"),
  cannotCompute: (what: string, columns: readonly string[]) =>
    `Non si può calcolare ${what} da ${list(columns)}`,
}
