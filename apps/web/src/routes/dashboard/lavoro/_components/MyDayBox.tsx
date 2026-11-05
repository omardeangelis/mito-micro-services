import { useMyDay } from "@/api/home"
import { StatBox } from "./StatBox"

const count = (value: number, one: string, many: string) =>
  `${value} ${value === 1 ? one : many}`

/** Takes «Fatti oggi» to the top and the focus to its title */
const showDiary = (event: React.MouseEvent) => {
  event.preventDefault()
  const title = document.getElementById("fatti-title")
  title?.scrollIntoView({ block: "start" })
  title?.focus({ preventScroll: true })
}

/**
 * «Il mio oggi». The width holds the longest realistic value (90 calls, all
 * answered, with «Vedi le chiamate»), so the left edge never moves (AC42)
 */
export function MyDayBox() {
  return (
    <StatBox
      label="Il mio oggi"
      className="min-w-[28rem]"
      what="il mio oggi"
      announced="Il mio oggi caricato"
      query={useMyDay()}
    >
      {({ calls, answered, appointments }) =>
        calls === 0 ? (
          <span className="text-muted-foreground">Nessuna chiamata ancora</span>
        ) : (
          <>
            <span className="font-label tabular-nums">
              {count(calls, "chiamata", "chiamate")}
            </span>
            <span className="text-muted-foreground">
              {" · "}
              {count(answered, "risposta", "risposte")}
              {" · "}
              {count(appointments, "appuntamento", "appuntamenti")}
            </span>{" "}
            <a
              href="#fatti-title"
              className="text-link underline-offset-3 font-medium hover:underline"
              onClick={showDiary}
            >
              Vedi le chiamate
            </a>
          </>
        )
      }
    </StatBox>
  )
}
