import { Badge } from "@/components/ui/badge"
import { blacklistTone } from "@/lib/tones"
import { type BlackListStatus } from "@mito/contract/customer"
import { CircleAlertIcon, ThumbsUpIcon } from "lucide-react"

type BadgeProps = React.ComponentProps<typeof Badge>
type Props = { state: BlackListStatus } & BadgeProps

// The glyph is filled with the tone's text and cut out with its fill, whole
// class names per state (never composed)
const iconClasses: Record<BlackListStatus, string> = {
  blacklisted: "fill-tag-red-text text-tag-red-bg",
  review: "fill-tag-amber-text text-tag-amber-bg",
  whitelisted: "fill-tag-green-text text-tag-green-bg",
}

export const BlackListBadge = ({ state, ...rest }: Props) => {
  const Icon = state === "whitelisted" ? ThumbsUpIcon : CircleAlertIcon
  return (
    <Badge {...rest} tone={blacklistTone(state)}>
      <Icon size={16} className={iconClasses[state]} />
    </Badge>
  )
}
