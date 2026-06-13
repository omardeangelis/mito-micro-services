"use client"

export default function GlobalError({
  reset,
}: {
  error: Error & { digest?: string }
  reset: () => void
}) {
  return (
    <html lang="it">
      <body>
        <h2>C&apos;è stato un errore Temporaneo</h2>
        <button onClick={() => reset()}>Riprova</button>
      </body>
    </html>
  )
}
