// eslint-disable-next-line @typescript-eslint/no-explicit-any
export async function parseReadableStream<T>(stream: any) {
  const chunks = []
  for await (const chunk of stream) {
    chunks.push(chunk)
  }
  const stringBuffer = Buffer.concat(chunks).toString("utf8")
  return {
    stringResult: stringBuffer,
    request: JSON.parse(stringBuffer) as T,
  }
}
