import * as React from "react"
import { cn } from "@/lib/utils"
import { XIcon } from "lucide-react"
import { Dialog as DialogPrimitive } from "radix-ui"

import { Button } from "@/components/ui/button"

function Dialog({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Root>) {
  return <DialogPrimitive.Root data-slot="dialog" {...props} />
}

function DialogTrigger({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Trigger>) {
  return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />
}

function DialogPortal({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Portal>) {
  return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />
}

function DialogClose({
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Close>) {
  return <DialogPrimitive.Close data-slot="dialog-close" {...props} />
}

function DialogOverlay({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Overlay>) {
  return (
    <DialogPrimitive.Overlay
      data-slot="dialog-overlay"
      className={cn(
        "bg-overlay fixed inset-0 z-50 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        className
      )}
      {...props}
    />
  )
}

function DialogContent({
  className,
  children,
  showCloseButton = true,
  onOpenAutoFocus,
  onInteractOutside,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Content> & {
  showCloseButton?: boolean
}) {
  return (
    <DialogPortal data-slot="dialog-portal">
      <DialogOverlay />
      <DialogPrimitive.Content
        data-slot="dialog-content"
        className={cn(
          "rounded-sheet shadow-pop fixed left-[50%] top-[50%] z-50 grid w-full max-w-[calc(100%-2rem)] translate-x-[-50%] translate-y-[-50%] grid-cols-[minmax(0,1fr)] gap-4 border border-border bg-card p-6 text-foreground outline-none duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 sm:max-w-lg",
          className
        )}
        // MITO: the close button comes first in the DOM, so the focus starts
        // on the first control of the content instead
        onOpenAutoFocus={(event) => {
          onOpenAutoFocus?.(event)
          if (event.defaultPrevented) return
          // The close button comes first in the DOM: like Radix's focusFirst,
          // focus the first tabbable control (links skipped, as removeLinks
          // does) until focus moves, with the close button as the last resort
          // before the content itself. A control that hands focus on (the
          // active tab of a Tabs.List) counts as success
          event.preventDefault()
          const content = event.currentTarget as HTMLElement
          const candidates = Array.from(
            content.querySelectorAll<HTMLElement>("*")
          ).filter(
            (el) =>
              el.tabIndex >= 0 &&
              el.tagName !== "A" &&
              !el.hidden &&
              !(el as HTMLButtonElement).disabled &&
              !(el instanceof HTMLInputElement && el.type === "hidden")
          )
          const closeButton = content.querySelector<HTMLElement>(
            "[data-dialog-close]"
          )
          const ordered = [
            ...candidates.filter((el) => el !== closeButton),
            ...(closeButton ? [closeButton] : []),
          ]
          const previouslyFocused = document.activeElement
          for (const el of ordered) {
            const prev = document.activeElement
            el.focus({ preventScroll: true })
            if (
              el !== prev &&
              el instanceof HTMLInputElement &&
              document.activeElement === el
            )
              el.select()
            if (document.activeElement !== previouslyFocused) return
          }
          content.focus()
        }}
        // MITO: the toasts live outside the overlay; Radix would read a press
        // on them as outside and close it
        onInteractOutside={(event) => {
          const target = event.target
          if (
            target instanceof Element &&
            target.closest("[data-sonner-toaster]")
          )
            event.preventDefault()
          onInteractOutside?.(event)
        }}
        {...props}
      >
        {showCloseButton && (
          <DialogPrimitive.Close
            data-slot="dialog-close"
            data-dialog-close
            className="rounded-control absolute right-3 top-3 p-1 opacity-70 transition-opacity hover:opacity-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-ring disabled:pointer-events-none data-[state=open]:bg-accent data-[state=open]:text-muted-foreground [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0"
          >
            <XIcon />
            <span className="sr-only">Chiudi</span>
          </DialogPrimitive.Close>
        )}
        {children}
      </DialogPrimitive.Content>
    </DialogPortal>
  )
}

function DialogHeader({ className, ...props }: React.ComponentProps<"div">) {
  return (
    <div
      data-slot="dialog-header"
      className={cn(
        // MITO: room for the close button, which sits above the title
        "flex flex-col gap-2 px-5 text-center sm:pl-0 sm:pr-5 sm:text-left",
        className
      )}
      {...props}
    />
  )
}

function DialogFooter({
  className,
  showCloseButton = false,
  children,
  ...props
}: React.ComponentProps<"div"> & {
  showCloseButton?: boolean
}) {
  return (
    <div
      data-slot="dialog-footer"
      className={cn(
        "flex flex-col-reverse gap-2 sm:flex-row sm:justify-end",
        className
      )}
      {...props}
    >
      {children}
      {showCloseButton && (
        <DialogPrimitive.Close asChild>
          <Button variant="outline">Close</Button>
        </DialogPrimitive.Close>
      )}
    </div>
  )
}

function DialogTitle({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Title>) {
  return (
    <DialogPrimitive.Title
      data-slot="dialog-title"
      className={cn("font-heading break-words text-lg leading-none", className)}
      {...props}
    />
  )
}

function DialogDescription({
  className,
  ...props
}: React.ComponentProps<typeof DialogPrimitive.Description>) {
  return (
    <DialogPrimitive.Description
      data-slot="dialog-description"
      className={cn("text-sm text-muted-foreground", className)}
      {...props}
    />
  )
}

export {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogOverlay,
  DialogPortal,
  DialogTitle,
  DialogTrigger,
}
