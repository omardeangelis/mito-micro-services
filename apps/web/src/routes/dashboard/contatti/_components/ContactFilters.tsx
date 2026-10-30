import { useId, useMemo } from "react"
import { X } from "lucide-react"

import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Switch } from "@/components/ui/switch"
import { MAX_OPERATOR_IDS } from "@mito/domain/contact/listInput"
import {
  operatorDisplayName,
  type OperatorRef,
} from "@mito/domain/contact/permissions"
import { priorityBands } from "@mito/domain/contact/priority"
import { allStates } from "@mito/domain/contact/status"
import { type CustomerFilter } from "@mito/contract/task"
import { cn } from "@/lib/utils"
import { priorityLabels } from "../_lib/priorityLabels"
import { useContactFilters } from "../_lib/useContactFilters"
import { type ContactsListState } from "@mito/client/contact/searchParams"
import { ContactColumnsMenu } from "./ContactColumnsMenu"
import { ContactDateFilter, dateProblemMessages } from "./ContactDateFilter"
import { useHiddenColumns } from "./hiddenColumns"
import { MultiSelectFilter } from "./MultiSelectFilter"

/** The operator id the server reads as "Non assegnato" */
const UNASSIGNED = 0

/** The longest search text the server takes: a longer one filters nothing */
const SEARCH_MAX_LENGTH = 100

const stateOptions = allStates.map((state) => ({ value: state, label: state }))

const priorityOptions = priorityBands.map((band) => ({
  value: band,
  label: priorityLabels[band],
}))

/** The chip of the customer filter: surname then name, blank parts skipped */
const customerChipText = (customer: CustomerFilter) => {
  if (!customer.found) return "Cliente: non trovato"

  const name = [customer.surname, customer.name]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ")

  return `Cliente: ${name === "" ? "Cliente senza nome" : name}`
}

type ToggleProps = {
  label: string
  checked: boolean
  onChange: (checked: boolean) => void
  /** Shown under the label, and the switch reads it too */
  description?: string
}

/** A switch named by its visible label, with an optional description */
function FilterToggle({ label, checked, onChange, description }: ToggleProps) {
  const id = useId()
  const descriptionId = `${id}-description`

  return (
    <div className="flex items-center gap-2">
      <Switch
        id={id}
        checked={checked}
        onCheckedChange={onChange}
        aria-describedby={description ? descriptionId : undefined}
      />
      <div className="flex flex-col gap-1">
        <Label htmlFor={id}>{label}</Label>
        {description && (
          <p id={descriptionId} className="text-xs text-muted-foreground">
            {description}
          </p>
        )}
      </div>
    </div>
  )
}

type Props = {
  state: ContactsListState
  operators: readonly OperatorRef[]
  /** The customer of the `customerId` filter, `null` without one */
  customerFilter?: CustomerFilter | null
}

/**
 * The filters of the list, all in the address and all combined in AND. The bar
 * is that of Clienti: the search, the operators, the states, the priority
 * bands and "Solo i miei" in view; the date range, "Con alert" and "Contatti
 * chiusi" in "Filtri Avanzati"; the columns menu at the end. The controls show
 * what the reader did at once and the address follows (`useContactFilters`).
 */
export function ContactFilters({
  state,
  operators,
  customerFilter = null,
}: Props) {
  const { filters, apply, search, dateProblem } = useContactFilters(state)
  const [hiddenColumns, setHiddenColumns] = useHiddenColumns()
  const dateProblemId = `${useId()}-date-problem`
  // The date field alone filters nothing: a day, from or to, is one filter
  const advancedCount = [
    filters.from !== undefined || filters.to !== undefined,
    filters.hasAlert,
    filters.includeInactive,
  ].filter(Boolean).length

  const operatorOptions = useMemo(
    () => [
      { value: UNASSIGNED, label: "Non assegnato" },
      ...operators
        .map((operator) => ({
          value: operator.id,
          label: operatorDisplayName(operator),
        }))
        .sort((a, b) => a.label.localeCompare(b.label, "it")),
    ],
    [operators]
  )

  return (
    <div
      role="search"
      aria-label="Filtri dei contatti"
      className="flex flex-wrap items-center gap-2 border-b border-border bg-card p-4"
    >
      <Input
        type="search"
        aria-label="Cerca cliente"
        placeholder="Cerca per cognome, nome, CF, P.IVA o telefono"
        autoComplete="off"
        maxLength={SEARCH_MAX_LENGTH}
        className="w-auto min-w-[min(18rem,100%)] max-w-md flex-1"
        value={filters.q ?? ""}
        onChange={(event) => search(event.target.value)}
      />
      <MultiSelectFilter
        label="Operatore"
        options={operatorOptions}
        value={filters.operatorIds}
        onChange={(operatorIds) => {
          // The server takes at most MAX_OPERATOR_IDS: a choice over it is not made
          if (operatorIds.length > MAX_OPERATOR_IDS) return
          apply({ operatorIds: [...operatorIds].sort((a, b) => a - b) })
        }}
      />
      <MultiSelectFilter
        label="Stato"
        options={stateOptions}
        value={filters.states}
        onChange={(states) => apply({ states })}
      />
      <MultiSelectFilter
        label="Priorità"
        options={priorityOptions}
        value={filters.priorities}
        onChange={(priorities) => apply({ priorities })}
      />
      <FilterToggle
        label="Solo i miei"
        checked={filters.onlyMe}
        onChange={(onlyMe) => apply({ onlyMe })}
      />
      <Popover>
        <PopoverTrigger asChild>
          <Button
            type="button"
            variant="secondary"
            aria-label={
              advancedCount === 0
                ? "Filtri Avanzati"
                : `Filtri Avanzati, ${advancedCount} ${advancedCount === 1 ? "attivo" : "attivi"}`
            }
            className={cn(
              "relative",
              dateProblem !== null && "ring-2 ring-destructive"
            )}
          >
            Filtri Avanzati
            {advancedCount > 0 ? (
              <span
                aria-hidden
                className="absolute right-0 top-0 flex h-4 w-4 items-center justify-center rounded-full bg-primary text-xs text-primary-foreground"
              >
                {advancedCount}
              </span>
            ) : null}
          </Button>
        </PopoverTrigger>
        <PopoverContent
          align="start"
          collisionPadding={16}
          className="flex w-auto max-w-[calc(100vw-2rem)] flex-col gap-4 p-4"
        >
          <ContactDateFilter
            field={filters.dateField}
            from={filters.from}
            to={filters.to}
            problem={dateProblem}
            errorId={dateProblemId}
            onChange={apply}
          />
          <FilterToggle
            label="Con alert"
            checked={filters.hasAlert}
            onChange={(hasAlert) => apply({ hasAlert })}
          />
          <FilterToggle
            label="Contatti chiusi"
            description="sostituiti da una riapertura, un followup o un'assegnazione massiva"
            checked={filters.includeInactive}
            onChange={(includeInactive) => apply({ includeInactive })}
          />
        </PopoverContent>
      </Popover>
      {customerFilter !== null && filters.customerId !== undefined && (
        <div className="inline-flex items-center gap-1 rounded-md border border-input pl-3 text-sm">
          <span>{customerChipText(customerFilter)}</span>
          <Button
            variant="ghost"
            size="icon"
            aria-label="Rimuovi il filtro cliente"
            onClick={() => apply({ customerId: undefined })}
          >
            <X aria-hidden="true" className="h-4 w-4" />
          </Button>
        </div>
      )}
      <div className="ml-auto">
        <ContactColumnsMenu
          hidden={hiddenColumns}
          onChange={setHiddenColumns}
        />
      </div>
      {/* Always mounted: a region that arrives with its text is not
          announced reliably. Empty, it takes no room */}
      <div
        id={dateProblemId}
        role="alert"
        className={
          dateProblem !== null
            ? "text-destructive-text basis-full text-sm"
            : "sr-only"
        }
      >
        {dateProblem !== null ? dateProblemMessages[dateProblem] : null}
      </div>
    </div>
  )
}
