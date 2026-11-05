import { useRef, useState } from "react"
import { useMyCalls } from "@/api/home"
import { Button } from "@/components/ui/button"
import { thousands } from "../_lib/format"
import { DiaryTable } from "./DiaryTable"
import { Part } from "./PartError"
import { PartSkeleton } from "./PartSkeleton"

const FIRST = 8

/**
 * «Fatti oggi». With calls, the space under it is at least a screen, so
 * «Vedi le chiamate» always takes the title to the top (AC41), the card
 * keeping its size. A screen of the viewport: the scroller is never taller
 */
export function DiarySection() {
  const query = useMyCalls()
  const title = useRef<HTMLHeadingElement>(null)
  const [all, setAll] = useState(false)
  const calls = query.data
  return (
    <div className={calls && calls.length > 0 ? "min-h-dvh" : undefined}>
      <section
        aria-labelledby="fatti-title"
        className="rounded-card border border-border bg-card shadow-card"
      >
        <header className="flex items-baseline justify-between gap-4 border-b border-border px-5 py-3">
          <h2
            id="fatti-title"
            ref={title}
            tabIndex={-1}
            className="font-heading scroll-mt-4 text-lg outline-none"
          >
            Fatti oggi
          </h2>
          {calls && calls.length > 0 ? (
            <span className="text-sm text-muted-foreground">
              {thousands(calls.length)}{" "}
              {calls.length === 1 ? "chiamata" : "chiamate"}, dalla più recente
            </span>
          ) : null}
        </header>
        <Part
          query={query}
          what="le chiamate di oggi"
          announced="Chiamate di oggi caricate"
          focus={title}
          inset
          loading={
            <PartSkeleton rows={4} label="Caricamento delle chiamate di oggi" />
          }
        >
          {(rows) =>
            rows.length === 0 ? (
              <p className="px-5 py-4 text-sm text-muted-foreground">
                Nessuna chiamata registrata oggi. Le chiamate che registri
                compaiono qui, con l&apos;esito e l&apos;ora.
              </p>
            ) : (
              <>
                <DiaryTable calls={all ? rows : rows.slice(0, FIRST)} />
                {rows.length > FIRST ? (
                  <div className="border-t border-border px-5 py-2">
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setAll((value) => !value)}
                    >
                      {all
                        ? "Mostra solo le ultime"
                        : `Mostra tutte le ${thousands(rows.length)}`}
                    </Button>
                  </div>
                ) : null}
              </>
            )
          }
        </Part>
      </section>
    </div>
  )
}
