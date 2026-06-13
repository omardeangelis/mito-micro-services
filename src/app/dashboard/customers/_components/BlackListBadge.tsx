import { Badge } from "@/components/ui/badge"
import { type Customer } from "@/lib/types/schemas"
import { CircleAlertIcon, ThumbsUpIcon } from "lucide-react"

type BadgeProps = React.ComponentProps<typeof Badge>
type Props = { state: Customer["blackListStatus"] } & BadgeProps

export const BlackListBadge = ({ state, ...rest }: Props) => {
  switch (state) {
    case "blacklisted":
      return (
        <Badge {...rest} variant="destructive" className="bg-red-100">
          <CircleAlertIcon size={16} className="fill-red-600" />
        </Badge>
      )
    case "whitelisted":
      return (
        <Badge {...rest} variant="success">
          <ThumbsUpIcon size={16} className="fill-emerald-800" />
        </Badge>
      )
    case "review":
      return (
        <Badge {...rest} variant="warning">
          <CircleAlertIcon size={16} className="fill-yellow-600" />
        </Badge>
      )
  }
}
