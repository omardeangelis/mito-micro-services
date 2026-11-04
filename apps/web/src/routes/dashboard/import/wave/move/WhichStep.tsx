import { useEffect, useId, useRef, useState, type ReactNode } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group"
import { Skeleton } from "@/components/ui/skeleton"
import { cn } from "@/lib/utils"
import { formatNumber } from "../_lib/text"
import { countError } from "../split/_lib/preview"
import {
  whichOrder,
  type HowMany,
  type Selection,
  type Which,
} from "./_lib/selection"

const whichOptions: Record<Which, { label: string; note: string }> = {
  both: {
    label: "Da chiamare e Non risponde",
    note: "Tutti i contatti che l'operatore deve ancora lavorare",
  },
  toCall: {
    label: "Solo Da chiamare",
    note: "Contatti in Da chiamare, che aspettano una chiamata",
  },
  noAnswer: {
    label: "Solo Non risponde",
    note: "Clienti già chiamati che non hanno risposto. I tentativi fatti restano registrati",
  },
}

/** The options of «Quanti contatti» (AC24), singular with one person */
function howManyOptions(
  available: number,
  many: boolean
): Record<HowMany, { label: string; note: string; field?: string }> {
  return {
    all: {
      label: `Tutti · ${formatNumber(available)}`,
      note: many
        ? "Sposti tutti i contatti scelti degli operatori selezionati"
        : "Sposti tutti i contatti scelti dell'operatore selezionato",
    },
    total: many
      ? {
          label: "Un numero totale",
          note: "Scrivi quanti contatti spostare in tutto. Si prendono da ogni operatore in proporzione a quanti ne ha",
          field: "Contatti da spostare in tutto",
        }
      : {
          label: "Solo una parte",
          note: "Scrivi quanti contatti spostare",
          field: "Contatti da spostare in tutto",
        },
    each: {
      label: "Lo stesso numero per operatore",
      note: "Scrivi quanti contatti prendere da ciascuno. A chi ne ha di meno si prendono tutti",
      field: "Contatti da prendere a ogni operatore",
    },
  }
}

/** The candidates of the step (D7): arriving, failed or read */
export type CandidatesStatus = "loading" | "failed" | "ready"

/**
 * «Quali e quanti contatti» (AC24, D7): the text, then two cards one under
 * the other, «Quali contatti» and «Quanti contatti», and the table «Operatore
 * · Contatti · Da spostare». Every number comes from the candidates: while
 * they arrive the cards show the skeleton, and if they failed «Non è stato
 * possibile rileggere i numeri.» with «Riprova» takes their place
 */
export function WhichStep({
  status,
  onRetry,
  counts,
  which,
  onWhich,
  howMany,
  onHowMany,
  givers,
  selection,
  onWrite,
}: {
  status: CandidatesStatus
  onRetry: () => void
  /** The number of each option of «Quali contatti» */
  counts: Record<Which, number>
  which: Which
  onWhich: (which: Which) => void
  howMany: HowMany
  onHowMany: (howMany: HowMany) => void
  /** How many people give: «Lo stesso numero per operatore» only with more than one */
  givers: number
  selection: Selection
  onWrite: (text: string) => void
}) {
  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">
        Scegli quali contatti spostare e quanti. I contatti spostati mantengono
        stato, alert e chat. Non si spostano i clienti in Richiamo, con un
        Appuntamento, con una Pratica caricata o Non interessati: restano
        all&apos;operatore di adesso.
      </p>
      {status === "failed" ? (
        <div
          role="alert"
          className="rounded-control flex flex-col items-start gap-3 border border-border p-4"
        >
          <p className="text-sm">Non è stato possibile rileggere i numeri.</p>
          <Button type="button" variant="outline" size="sm" onClick={onRetry}>
            Riprova
          </Button>
        </div>
      ) : (
        <>
          <Card
            title="Quali contatti"
            description="Fra quelli che gli operatori scelti devono ancora lavorare in questa Wave."
            loading={status === "loading"}
          >
            <WhichField counts={counts} value={which} onChange={onWhich} />
          </Card>
          <Card
            title="Quanti contatti"
            description="Se non li sposti tutti, si spostano prima i contatti creati per primi."
            loading={status === "loading"}
          >
            <HowManyField
              value={howMany}
              onChange={onHowMany}
              many={givers > 1}
              selection={selection}
              onWrite={onWrite}
            />
            <SelectionTable selection={selection} />
          </Card>
        </>
      )}
    </div>
  )
}

/** A card of the step, with the skeleton of the app in place of its content */
function Card({
  title,
  description,
  loading,
  children,
}: {
  title: string
  description: string
  loading: boolean
  children: ReactNode
}) {
  const id = useId()
  return (
    <section
      aria-labelledby={`${id}-title`}
      aria-describedby={`${id}-description`}
      aria-busy={loading || undefined}
      className="rounded-control flex flex-col gap-3 border border-border p-4"
    >
      <div className="flex flex-col gap-0.5">
        <h4 id={`${id}-title`} className="font-label text-sm">
          {title}
        </h4>
        <p id={`${id}-description`} className="text-xs text-muted-foreground">
          {description}
        </p>
      </div>
      {loading ? (
        <div className="flex flex-col gap-2">
          <Skeleton className="h-7 w-2/3" />
          <Skeleton className="h-7 w-1/2" />
          <Skeleton className="h-7 w-3/5" />
        </div>
      ) : (
        children
      )}
    </section>
  )
}

/**
 * One option of a card (AC24, AC33): the radio, the title (its name) with the
 * field when there is one, and the note (its description), always visible.
 * An option off looks off too: the label follows the radio (`peer`)
 */
function Option({
  value,
  label,
  note,
  disabled = false,
  field,
  error,
  onPick,
}: {
  value: string
  label: string
  note: string
  disabled?: boolean
  field?: ReactNode
  error?: ReactNode
  /** A click or Space on the option: the field takes the focus */
  onPick?: (via: "pointer" | "space") => void
}) {
  const id = useId()
  return (
    <div className="flex min-h-7 items-start gap-2">
      <RadioGroupItem
        id={id}
        value={value}
        disabled={disabled}
        aria-labelledby={`${id}-name`}
        aria-describedby={`${id}-note`}
        className="peer relative mt-1.5 after:absolute after:-inset-1"
        onPointerDown={() => onPick?.("pointer")}
        onKeyDown={(event) => {
          if (event.key === " ") onPick?.("space")
        }}
      />
      <div className="flex min-w-0 flex-col peer-disabled:opacity-50">
        <div className="flex min-h-7 flex-wrap items-center gap-2">
          <label
            htmlFor={id}
            onPointerDown={() => {
              if (!disabled) onPick?.("pointer")
            }}
            className={cn(
              "flex min-h-7 items-center text-sm",
              disabled ? "cursor-not-allowed" : "cursor-pointer"
            )}
          >
            <span id={`${id}-name`}>{label}</span>
          </label>
          {field}
        </div>
        {error}
        <label
          id={`${id}-note`}
          htmlFor={id}
          onPointerDown={() => {
            if (!disabled) onPick?.("pointer")
          }}
          className={cn(
            "pb-1 text-xs text-muted-foreground",
            disabled ? "cursor-not-allowed" : "cursor-pointer"
          )}
        >
          {note}
        </label>
      </div>
    </div>
  )
}

/** «Quali contatti»: the three options with their number; those at 0 are off */
function WhichField({
  counts,
  value,
  onChange,
}: {
  counts: Record<Which, number>
  value: Which
  onChange: (which: Which) => void
}) {
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as Which)}
      aria-label="Quali contatti"
      className="gap-1"
    >
      {whichOrder.map((which) => (
        <Option
          key={which}
          value={which}
          label={`${whichOptions[which].label} · ${formatNumber(counts[which])}`}
          note={whichOptions[which].note}
          disabled={counts[which] === 0}
        />
      ))}
    </RadioGroup>
  )
}

/**
 * «Quanti contatti»: «Tutti», «Un numero totale» («Solo una parte» with one
 * person) and, with more than one, «Lo stesso numero per operatore». The
 * field sits beside the option chosen, in the row of its title, so its coming
 * moves nothing below. The focus goes into it only after a click or Space on
 * the option, not with the arrows of the group
 */
function HowManyField({
  value,
  onChange,
  many,
  selection,
  onWrite,
}: {
  value: HowMany
  onChange: (howMany: HowMany) => void
  many: boolean
  selection: Selection
  onWrite: (text: string) => void
}) {
  const id = useId()
  const options = howManyOptions(selection.available, many)
  const kinds: readonly HowMany[] = many
    ? ["all", "total", "each"]
    : ["all", "total"]
  const input = useRef<HTMLInputElement>(null)
  // The option a pointer or Space is acting on, until its click
  const picking = useRef<{ kind: HowMany; via: "pointer" | "space" } | null>(
    null
  )
  const [focusAsked, setFocusAsked] = useState(0)
  useEffect(() => {
    if (focusAsked > 0) input.current?.focus()
  }, [focusAsked])

  const showError = !selection.valid && selection.max > 0
  return (
    <RadioGroup
      value={value}
      onValueChange={(next) => onChange(next as HowMany)}
      aria-label="Quanti contatti"
      className="gap-1"
      onKeyDown={(event) => {
        // Only Space acts on the option: any other key drops a pick left over
        if (event.key !== " ") picking.current = null
      }}
      onClick={(event) => {
        // Only the click of a radio: a label passes its click on to it
        if (!(event.target instanceof Element)) return
        if (event.target.getAttribute("role") !== "radio") return
        // The arrows click the option too, with nothing picking it
        const picked = picking.current
        picking.current = null
        if (picked !== null && picked.kind !== "all")
          setFocusAsked((n) => n + 1)
      }}
    >
      {kinds.map((kind) => {
        const option = options[kind]
        const chosen = value === kind && option.field !== undefined
        return (
          <Option
            key={kind}
            value={kind}
            label={option.label}
            note={option.note}
            onPick={(via) => {
              picking.current = { kind, via }
            }}
            field={
              chosen ? (
                <Input
                  ref={input}
                  aria-label={option.field}
                  inputMode="numeric"
                  autoComplete="off"
                  className="h-7 w-28 tabular-nums"
                  value={selection.text}
                  onChange={(event) => onWrite(event.target.value)}
                  // The keys of the field are its own, not the group's
                  onKeyDown={(event) => event.stopPropagation()}
                  aria-invalid={showError || undefined}
                  aria-describedby={showError ? `${id}-error` : undefined}
                />
              ) : null
            }
            error={
              chosen && showError ? (
                <p id={`${id}-error`} className="text-destructive-text text-sm">
                  {countError(selection.max)}
                </p>
              ) : null
            }
          />
        )
      })}
    </RadioGroup>
  )
}

/** A value with its column for who reads the screen (AC32) */
const Cell = ({
  column,
  className,
  children,
}: {
  column: string
  className?: string
  children: ReactNode
}) => (
  <td className={cn("px-2 py-1.5 text-right tabular-nums", className)}>
    <span className="sr-only">{column} </span>
    {children}
  </td>
)

/** «Operatore · Contatti · Da spostare», with the «Totale» at the bottom (AC24, AC32) */
function SelectionTable({ selection }: { selection: Selection }) {
  const take = (value: number | null) =>
    value === null || value === 0 ? "—" : formatNumber(value)
  return (
    <table
      aria-label="Da spostare"
      className="w-full border-separate border-spacing-0 text-sm"
    >
      <thead className="text-xs text-muted-foreground">
        <tr className="h-8">
          <th
            scope="col"
            className="border-b border-border px-2 text-left font-normal"
          >
            Operatore
          </th>
          <th
            scope="col"
            className="w-28 border-b border-border px-2 text-right font-normal"
          >
            Contatti
          </th>
          <th
            scope="col"
            className="w-28 border-b border-border px-2 text-right font-normal"
          >
            Da spostare
          </th>
        </tr>
      </thead>
      <tbody>
        {selection.rows.map((row) => (
          <tr key={row.operatorId}>
            <td className="truncate border-b border-border px-2 py-1.5">
              {row.name}
              <span className="sr-only">{", "}</span>
            </td>
            <Cell
              column="Contatti"
              className="border-b border-border text-muted-foreground"
            >
              {formatNumber(row.contacts)}
              <span className="sr-only">{", "}</span>
            </Cell>
            <Cell
              column="Da spostare"
              className="font-label border-b border-border"
            >
              {take(row.take)}
            </Cell>
          </tr>
        ))}
        <tr>
          <td className="font-label px-2 py-1.5">
            Totale<span className="sr-only">{", "}</span>
          </td>
          <td />
          <Cell column="Da spostare" className="font-label">
            {selection.valid ? formatNumber(selection.total) : "—"}
          </Cell>
        </tr>
      </tbody>
    </table>
  )
}
