import { useKnownCurrentUser } from "@/api/me"
import { greeting, longDay } from "../_lib/format"
import { MyDayBox } from "./MyDayBox"
import { ToCallBox } from "./ToCallBox"

/** The greeting and the day of Rome, with the two boxes of the numbers */
export function Header() {
  const { data } = useKnownCurrentUser()
  return (
    <div className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <h1 className="font-heading text-title">
          {greeting(data?.operator.name)}
        </h1>
        <p className="mt-0.5 text-sm text-muted-foreground">
          {longDay(new Date())}
        </p>
      </div>
      <dl className="rounded-card ml-auto flex items-stretch divide-x divide-border border border-border bg-card text-sm shadow-card">
        <MyDayBox />
        <ToCallBox />
      </dl>
    </div>
  )
}
