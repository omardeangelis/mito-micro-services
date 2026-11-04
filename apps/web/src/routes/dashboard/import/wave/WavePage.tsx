import { useEffect, useRef, useState, type RefObject } from "react"
import { useParams, useSearchParams } from "react-router"
import { useWave, type WaveView } from "@/api/import"
import { useCurrentUser } from "@/api/me"
import { Button } from "@/components/ui/button"
import { Skeleton } from "@/components/ui/skeleton"
import { NotFound } from "@/routes/NotFound"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { dayText } from "./_lib/text"
import {
  initialMode,
  screenKey,
  type DoneContent,
  type PageMode,
} from "./_lib/mode"
import { useArrivals } from "./Arrivals"
import { DoneScreen } from "./DoneScreen"
import { Flow } from "./Flow"
import { MoveFlow } from "./move/MoveFlow"
import { useSplit } from "./split/SplitStep"
import { useAssignConfirm } from "./AssignConfirm"
import { Extend } from "./Extend"
import { Overview } from "./Overview"
import { WaveHeader, WaveHeaderSkeleton } from "./WaveHeader"

/** The id of the path, when it can be an import's */
function waveId(id: string | undefined): number | null {
  if (id === undefined || !/^\d+$/.test(id)) return null
  const value = Number(id)
  return Number.isSafeInteger(value) && value > 0 ? value : null
}

/**
 * The page of a Wave (`/dashboard/import/:id`), admins only (AC1): an
 * operator gets the page that doesn't exist, with no call to the server, as
 * the history. It mounts again for each id (the key), as the toast at the end
 * of an import or the browser's back can change it: skeleton, mode and choices
 * start again
 */
export function Component() {
  const { id } = useParams()
  const role = useUserPreferenceContext((state) => state.role)
  if (role === undefined) return <UnknownRole />
  if (role !== "ADMIN") return <NotFound />
  const value = waveId(id)
  if (value === null) return <NotFound />
  return <WavePage key={value} id={value} />
}

/**
 * Nothing until the role is known. If the current user failed the page can't
 * know it's an admin's: the error of the route, as the history
 */
const UnknownRole = () => {
  const { error, data } = useCurrentUser()
  if (error && !data) throw error
  return null
}

function WavePage({ id }: { id: number }) {
  const wave = useWave(id)
  const scroller = useRef<HTMLElement>(null)
  if (wave.error?._tag === "WaveNotFound") return <NotFound />

  const content = () => {
    if (wave.data !== undefined) {
      return <WaveScreens id={id} wave={wave.data} scroller={scroller} />
    }
    if (wave.isError && !wave.isFetching) {
      return (
        <>
          <WaveHeaderSkeleton />
          <div
            role="alert"
            className="rounded-card flex flex-col items-start gap-3 border border-border bg-card p-6 shadow-card"
          >
            <p>Non è stato possibile caricare la Wave.</p>
            <Button
              type="button"
              variant="outline"
              onClick={() => void wave.refetch()}
            >
              Riprova
            </Button>
          </div>
        </>
      )
    }
    return (
      <div
        role="status"
        aria-label="Caricamento della Wave"
        className="flex flex-col gap-5"
      >
        <WaveHeaderSkeleton />
        <Skeleton className="rounded-card h-96 w-full" />
      </div>
    )
  }

  return (
    <section ref={scroller} className="dashabord-container">
      <div className="dashboard-content">
        <div className="mx-auto flex max-w-6xl flex-col gap-5">{content()}</div>
      </div>
    </section>
  )
}

/**
 * The Wave read: the header and, under it, the screen of the mode. At each
 * change of screen the focus goes to its title and the page back to the top;
 * when the page opens, to the title of the first step in a flow, otherwise to
 * the name of the Wave (AC31)
 */
function WaveScreens({
  id,
  wave,
  scroller,
}: {
  id: number
  wave: WaveView
  scroller: RefObject<HTMLElement | null>
}) {
  const [searchParams, setSearchParams] = useSearchParams()
  const fromImport = searchParams.get("da") === "import"
  const [mode, setMode] = useState<PageMode>(() =>
    initialMode(wave, searchParams.get("per"))
  )
  const nameRef = useRef<HTMLHeadingElement>(null)
  const key = screenKey(mode)

  useEffect(() => {
    const container = scroller.current
    const title =
      container?.querySelector<HTMLElement>("[data-screen-title]") ??
      nameRef.current
    title?.focus({ preventScroll: true })
    // The shell doesn't scroll the window: the page's container does
    if (container) container.scrollTop = 0
  }, [key, scroller])

  /**
   * `?per` goes from the address, replacing the entry of the history, at the
   * first confirmation that succeeds, «Annulla» or «Vai alla Wave» (D9)
   */
  const dropPer = () => {
    if (!searchParams.has("per")) return
    setSearchParams(
      (now) => {
        const next = new URLSearchParams(now)
        next.delete("per")
        return next
      },
      { replace: true }
    )
  }
  const toOverview = () => {
    dropPer()
    setMode({ kind: "overview" })
  }
  const toDone = (screen: DoneContent) => {
    dropPer()
    setMode({ kind: "done", screen })
  }

  return (
    <>
      <WaveHeader
        wave={wave}
        fromImport={fromImport}
        showDeadline={mode.kind !== "afterImport"}
        extend={<Extend id={id} wave={wave} />}
        nameRef={nameRef}
      />
      <Screen
        id={id}
        wave={wave}
        mode={mode}
        setMode={setMode}
        toOverview={toOverview}
        toDone={toDone}
      />
    </>
  )
}

/** The screen of the mode */
function Screen({
  id,
  wave,
  mode,
  setMode,
  toOverview,
  toDone,
}: {
  id: number
  wave: WaveView
  mode: PageMode
  setMode: (mode: PageMode) => void
  toOverview: () => void
  toDone: (screen: DoneContent) => void
}) {
  switch (mode.kind) {
    case "afterImport":
      return (
        <AfterImport
          id={id}
          wave={wave}
          mode={mode}
          setMode={setMode}
          toOverview={toOverview}
          toDone={toDone}
        />
      )
    case "assignRest":
      return (
        <AssignRest
          // Again from the screen at the end: a new split on the Wave read again
          key={mode.per ?? "all"}
          id={id}
          wave={wave}
          per={mode.per}
          setMode={setMode}
          toOverview={toOverview}
          toDone={toDone}
        />
      )
    case "reassign":
      return (
        <MoveFlow
          id={id}
          wave={wave}
          from={mode.from}
          at={mode.at}
          onGo={(at) => setMode({ ...mode, at })}
          onCancel={toOverview}
          onDone={toDone}
        />
      )
    case "done":
      return <DoneScreen {...mode.screen} />
    case "overview":
      return <Overview id={id} wave={wave} setMode={setMode} />
  }
}

/**
 * «Dopo l'import» (AC4): «Ingressi e scadenza», then «Assegna» when there is
 * someone to assign (AC8). The split and the deadline live here, so going
 * back to the first step keeps its choices. «Avanti» saves the deadline and
 * opens «Assegna»; with 0 to assign the save ends in the screen of the end
 */
function AfterImport({
  id,
  wave,
  mode,
  setMode,
  toOverview,
  toDone,
}: {
  id: number
  wave: WaveView
  mode: Extract<PageMode, { kind: "afterImport" }>
  setMode: (mode: PageMode) => void
  toOverview: () => void
  toDone: (screen: DoneContent) => void
}) {
  const split = useAssignSplit(wave, mode.per)
  const confirm = useAssignConfirm({
    id,
    wave,
    split,
    onDone: toDone,
    onRest: () => setMode({ kind: "assignRest" }),
    onOverview: toOverview,
  })
  const go = (at: number) => setMode({ ...mode, at })
  const arrivals = useArrivals({
    id,
    wave,
    onSaved: (deadline) => {
      if (wave.toAssign > 0) return go(1)
      setMode({
        kind: "done",
        screen: {
          title: `Scadenza della ${wave.name}: ${dayText(deadline)}`,
          text: "Nessun cliente da assegnare.",
          actions: (
            <Button type="button" onClick={toOverview}>
              Vai alla Wave
            </Button>
          ),
        },
      })
    },
  })
  return (
    <Flow
      title="Dopo l'import"
      steps={
        // Once on «Assegna» it stays, also when a re-read finds 0 to assign (AC16)
        wave.toAssign > 0 || mode.at > 0
          ? [arrivals.step, confirm.step]
          : [arrivals.step]
      }
      at={mode.at}
      onGo={go}
      onCancel={toOverview}
      locked={arrivals.saving || confirm.pending}
    />
  )
}

/**
 * «Assegna i restanti» (AC10): the step «Assegna» alone, with «Annulla» to
 * the overview
 */
function AssignRest({
  id,
  wave,
  per,
  setMode,
  toOverview,
  toDone,
}: {
  id: number
  wave: WaveView
  per: number | undefined
  setMode: (mode: PageMode) => void
  toOverview: () => void
  toDone: (screen: DoneContent) => void
}) {
  const split = useAssignSplit(wave, per)
  const confirm = useAssignConfirm({
    id,
    wave,
    split,
    onDone: toDone,
    onRest: () => setMode({ kind: "assignRest" }),
    onOverview: toOverview,
  })
  return (
    <Flow
      title="Assegna i restanti"
      steps={[confirm.step]}
      at={0}
      onGo={() => undefined}
      onCancel={toOverview}
      locked={confirm.pending}
    />
  )
}

/** The split of «Assegna»: the customers to assign among the team (AC10–AC14) */
const useAssignSplit = (wave: WaveView, per: number | undefined) =>
  useSplit({
    team: wave.team,
    max: wave.toAssign,
    workdays: wave.workdaysLeft,
    per,
  })
