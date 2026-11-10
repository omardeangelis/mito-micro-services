import { cn } from "@/lib/utils"
import { type LatestWave } from "@mito/contract/home"
import { inactiveText } from "../../import/wave/split/_lib/preview"
import {
  barPercent,
  DETAIL_ROW_REM,
  DETAIL_TITLE_REM,
  detailInactiveText,
  detailPeopleText,
  detailTitleText,
  neverCalledText,
  NO_PEOPLE_TEXT,
  sortPeople,
  toCallText,
} from "../_lib/waves"
import { toneClass } from "../_lib/tone"

/**
 * Who has the contacts of an import (AC12): drawn from the people already in
 * the data of the section, with no loading of its own. The rows are one column
 * under 60rem of the container (AC38), two above it
 */
export function WaveDetail({ wave }: { wave: LatestWave }) {
  const people = sortPeople(wave.people)
  const highest = people.reduce(
    (max, person) => Math.max(max, person.toCall),
    0
  )
  const inactive = detailInactiveText(people)
  return (
    <div>
      <div
        style={{ minHeight: `${DETAIL_TITLE_REM}rem` }}
        className="flex flex-wrap items-center gap-x-2 px-5 text-sm"
      >
        <h3 className="font-label">{detailTitleText(wave.name)}</h3>
        {people.length > 0 ? (
          <span className="text-muted-foreground">
            {detailPeopleText(people.length)}
            {inactive ? (
              <span className={toneClass.warning}> {inactive}</span>
            ) : null}
          </span>
        ) : null}
      </div>
      {people.length === 0 ? (
        <p className="px-5 pb-3 text-sm text-muted-foreground">
          {NO_PEOPLE_TEXT}
        </p>
      ) : (
        <ul className="@[60rem]:grid-cols-2 grid grid-cols-1 gap-x-8 px-5 pb-2">
          {people.map((person) => {
            const away = person.inactiveDays !== null
            return (
              <li
                key={person.operatorId}
                style={{ minHeight: `${DETAIL_ROW_REM}rem` }}
                className="grid grid-cols-[minmax(10rem,1fr)_minmax(2rem,8rem)_6.5rem_7.5rem] items-center gap-x-3 text-sm"
              >
                <div className="min-w-0">
                  {/* The whole name stays in the DOM: truncated only to the eye */}
                  <div className="truncate font-medium" title={person.name}>
                    {person.name}
                  </div>
                  {person.inactiveDays !== null ? (
                    <div className={cn("truncate text-xs", toneClass.warning)}>
                      {inactiveText(person.inactiveDays)}
                    </div>
                  ) : null}
                </div>
                <div
                  aria-hidden
                  className="h-2 overflow-hidden rounded-full bg-muted"
                >
                  <div
                    data-slot="wave-detail-bar"
                    className="h-full rounded-full bg-primary"
                    style={{ width: `${barPercent(person.toCall, highest)}%` }}
                  />
                </div>
                <span className="text-right">{toCallText(person.toCall)}</span>
                <span
                  className={cn(
                    "text-right",
                    toneClass[
                      away && person.neverCalled > 0 ? "warning" : "muted"
                    ]
                  )}
                >
                  {neverCalledText(person.neverCalled)}
                </span>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
