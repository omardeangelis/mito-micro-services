import { AlarmClock, User } from "lucide-react"
import { formatDeadline } from "@/lib/utils/format"
import { type RouterOutputs } from "@/trpc/shared"

type ResolvedAlert = RouterOutputs["task"]["getCustomerAlerts"][number]

type Props = {
  alerts: ResolvedAlert[]
}

export const CustomerAlertHistory = (props: Props) => {
  if (props.alerts.length === 0) {
    return (
      <p className="text-sm italic text-gray-500">
        Nessun alert risolto in passato.
      </p>
    )
  }

  return (
    <ul className="flex max-h-64 flex-col gap-2 overflow-y-auto pr-1">
      {props.alerts.map((pastAlert) => (
        <li
          key={pastAlert.id}
          className="flex items-start gap-3 rounded-md border border-gray-200 bg-gray-50 p-3"
        >
          <AlarmClock className="mt-0.5 h-4 w-4 shrink-0 text-gray-500" />
          <div className="flex flex-1 flex-col gap-1 text-sm">
            <span className="font-medium text-gray-700">
              Scadenza: {formatDeadline(pastAlert.deadline)}
            </span>
            {pastAlert.message ? (
              <span className="text-gray-600">{pastAlert.message}</span>
            ) : null}
            <span className="flex items-center gap-1 text-xs text-gray-500">
              {pastAlert.resolvedByName ? (
                <>
                  <User className="h-3 w-3" />
                  Risolto da{" "}
                  <span className="font-medium">
                    {`${pastAlert.resolvedByName} ${pastAlert.resolvedBySurname ?? ""}`.trim()}
                  </span>{" "}
                  il
                </>
              ) : (
                "Risolto il"
              )}{" "}
              {formatDeadline(pastAlert.updatedAt, { precision: "hour" })}
            </span>
          </div>
        </li>
      ))}
    </ul>
  )
}
