"use client"

import { Accordion, AccordionItem } from "@/components/ui/accordion"
import React, { Fragment, type PropsWithChildren } from "react"

type AccordionProps = React.ComponentProps<typeof Accordion>
type InitialAccordionStateProps = Pick<AccordionProps, "defaultValue">
type Props = PropsWithChildren<
  React.HTMLAttributes<HTMLDivElement> & InitialAccordionStateProps
>

export const CollassableSection = ({
  defaultValue,
  children,
  ...rest
}: Props) => {
  const clonedChildren = React.useMemo(
    () =>
      React.Children.map(children, (child, index) => {
        if (React.isValidElement(child)) {
          return React.cloneElement(
            child as React.ReactElement<{ id: string }>,
            {
              key: index,
            }
          )
        }
        return child
      }),
    [children]
  )
  return (
    <section {...rest}>
      <Accordion
        type="multiple"
        defaultValue={Array.isArray(defaultValue) ? defaultValue : []}
      >
        {clonedChildren?.map((child, index, array) => {
          return (
            <Fragment key={index}>
              <AccordionItem value={`item-${index + 1}`} className="border-0">
                {child}
              </AccordionItem>
              {index !== array.length - 1 ? (
                <hr className="my-4 border border-neutral-100" />
              ) : null}
            </Fragment>
          )
        })}
      </Accordion>
    </section>
  )
}
