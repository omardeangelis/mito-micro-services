import { Check } from "lucide-react"
import { useEffect, useRef } from "react"
import { type DoneContent } from "./_lib/mode"

/**
 * The screen at the end of a flow (AC17, AC27): centered, the check of 64 px
 * on a soft green, the big title, the text and the buttons centered under it.
 * The focus goes to the title when it opens (AC31). The texts and the buttons
 * are the flow's
 */
export function DoneScreen({ title, text, actions }: DoneContent) {
  const titleRef = useRef<HTMLHeadingElement>(null)
  useEffect(() => {
    titleRef.current?.focus({ preventScroll: true })
  }, [])
  return (
    <section
      aria-labelledby="wave-done-title"
      className="rounded-card border border-border bg-card shadow-card"
    >
      <div className="mx-auto flex max-w-xl flex-col items-center gap-3 px-6 py-16 text-center">
        <span className="bg-tag-green-bg text-tag-green-text mb-2 flex size-16 items-center justify-center rounded-full">
          <Check aria-hidden className="size-8" />
        </span>
        <h2
          id="wave-done-title"
          ref={titleRef}
          tabIndex={-1}
          data-screen-title
          className="font-heading text-2xl outline-none"
        >
          {title}
        </h2>
        <p className="text-base text-muted-foreground">{text}</p>
        <div className="mt-5 flex flex-wrap justify-center gap-3">
          {actions}
        </div>
      </div>
    </section>
  )
}
