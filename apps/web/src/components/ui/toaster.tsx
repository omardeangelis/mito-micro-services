import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from "@/components/ui/toast"
import { useToast } from "@/components/ui/use-toast"

export function Toaster() {
  const { toasts } = useToast()

  return (
    // Radix's labels are in English: the screen readers read them first
    <ToastProvider label="Notifica">
      {toasts.map(function ({
        id,
        title,
        description,
        action,
        closeManually,
        ...props
      }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {/* The announcement joins the texts: without it, the words stick */}
              {title && description && " "}
              {description && (
                <ToastDescription>{description}</ToastDescription>
              )}
            </div>
            {action}
            {closeManually ? null : <ToastClose />}
          </Toast>
        )
      })}
      <ToastViewport label="Notifiche ({hotkey})" />
    </ToastProvider>
  )
}
