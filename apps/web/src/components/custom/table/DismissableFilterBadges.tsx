import { Badge } from "@/components/ui/badge"
import { X } from "lucide-react"
import React from "react"

type Props = {
  arrayFilters: { key: string; value: string[] }[]
  removeFilterSingleFilter: (key: string, value: string) => void
}

export const DismissableFilterBadges = (props: Props) => {
  return (
    <>
      {props.arrayFilters.map((filter) =>
        filter.value.length > 0 ? (
          <Badge
            className="flex w-fit flex-wrap items-center"
            variant="secondary"
            key={filter.key}
          >
            <div className="flex flex-wrap gap-2">
              {filter.value.flat().map((filterValue) => {
                return (
                  <Badge
                    size="xs"
                    key={filterValue}
                    className="badge-with-close w-fit"
                    variant="outline"
                    onClick={() =>
                      props.removeFilterSingleFilter(filter.key, filterValue)
                    }
                  >
                    <div className="flex w-fit items-center">
                      {filterValue}
                      <span
                        data-close
                        className="badge-close-icon ml-2 flex items-center justify-center"
                      >
                        <X size={16} />
                      </span>
                    </div>
                  </Badge>
                )
              })}
            </div>
          </Badge>
        ) : null
      )}
    </>
  )
}
