export type HeadersErrorCodes = "headers" | "all"

interface HeadersImportError extends Error {
  code: HeadersErrorCodes
}

export class EmptyHeadersImportError
  extends Error
  implements HeadersImportError
{
  code: HeadersErrorCodes
  constructor(options: { message: string; code: HeadersErrorCodes }) {
    const { message, code } = options
    super(message)
    this.code = code
  }
}

export const isHeaderError = (error: unknown): error is HeadersImportError => {
  return (error as HeadersImportError).code === "headers" ||
    (error as HeadersImportError).code === "all"
    ? true
    : false
}
