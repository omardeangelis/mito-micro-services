import { type NavigateFunction } from "react-router"
import { toast } from "sonner"
import { customerNameOf } from "@/components/custom/contact/call/customerName"
import { navigateOnPlainClick } from "@/components/custom/contact/navigateOnPlainClick"
import { type QueueRow } from "./queue"
import { type CallRejection, type RejectionLink, workedText } from "./rejection"

/**
 * What a notice can do: leave for an address, or open a contact over the home,
 * which says `false` when the home is gone. The notice outlives the home, so
 * that is asked at the click (AC52, AC53)
 */
export type NoticeLinks = {
  navigate: NavigateFunction
  openHere: (taskId: number) => boolean
}

/**
 * The link of a notice to a contact, as a link so a Ctrl-click keeps working.
 * On a plain click it closes the notice, so it takes the id of the call that
 * shows it. This is the one place that builds it
 */
const contactLink = (
  { label, taskId }: RejectionLink,
  rowTaskId: number,
  { navigate, openHere }: NoticeLinks,
  dismiss: () => void
) => {
  const contactId = taskId ?? rowTaskId
  const href = `/dashboard/contatti/${contactId}`
  return (
    <a
      href={href}
      data-button=""
      onClick={navigateOnPlainClick((to) => {
        dismiss()
        if (!openHere(contactId))
          void navigate(to, { preventScrollReset: true })
      }, href)}
    >
      {label}
    </a>
  )
}

/** A notice of error, with its link to a contact if it has one */
const showError = (
  title: string,
  description: string | undefined,
  link: RejectionLink | null,
  taskId: number,
  links: NoticeLinks
) => {
  const id = toast.error(title, {
    description,
    duration: 8000,
    ...(link === null
      ? {}
      : {
          action: contactLink(link, taskId, links, () => toast.dismiss(id)),
        }),
  })
}

/**
 * The one notice of a refused call. A day already gone is said in the panel,
 * and only with the home gone it needs a notice (AC27, AC52)
 */
export const showRejection = (
  rejection: CallRejection,
  row: QueueRow,
  links: NoticeLinks,
  { here }: { here: boolean }
) => {
  switch (rejection.kind) {
    case "toast": {
      const { title, description, link } = rejection
      showError(title, description, link, row.taskId, links)
      return
    }
    case "session":
      toast.error("Sessione scaduta: accedi di nuovo", {
        action: {
          label: "Accedi",
          onClick: () => void links.navigate("/login"),
        },
      })
      return
    case "worked":
      toast(workedText(rejection))
      return
    case "deadlinePast":
      if (here) return
      showError(
        `Richiamo per ${customerNameOf(row)} non salvato: il giorno è già passato`,
        undefined,
        { label: "Apri il contatto" },
        row.taskId,
        links
      )
      return
  }
}

/** The notice of an outcome nobody can tell: not an error (AC48) */
export const showUncertain = () =>
  toast("Non sappiamo se la chiamata è stata registrata", {
    description: "Controlla in Fatti oggi: se non c'è, registrala di nuovo.",
    duration: 8000,
  })
