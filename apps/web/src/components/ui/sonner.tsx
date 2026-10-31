import { Toaster as Sonner } from "sonner"

const hotkey = ["F8"]
const toastOptions = { closeButtonAriaLabel: "Chiudi notifica" }

// The toasts of the app, set once: their colours and font are in
// globals.css, the rest is Sonner's own
export function Toaster() {
  return (
    <Sonner
      position="bottom-right"
      duration={5000}
      hotkey={hotkey}
      theme="light"
      customAriaLabel="Notifiche (F8)"
      closeButton
      toastOptions={toastOptions}
      className="pointer-events-auto"
    />
  )
}
