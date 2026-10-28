import type { OperatorRef } from "@mito/domain/contact/permissions"
import type { ContactDetail } from "@mito/contract/task"
import { ContactAlertSection } from "./ContactAlertSection"
import { ContactCallbackForm } from "./ContactCallbackForm"
import { ContactDetailHeader } from "./ContactDetailHeader"
import { ContactHistorySection } from "./ContactHistorySection"
import { ContactSupersededBanner } from "./ContactSupersededBanner"

type Props = {
  data: ContactDetail
  /** The `da` parameter of the address: the list state to go back to */
  da: string | undefined
  /** Who the contact can be given to: sent only when the user may reassign */
  operators?: readonly OperatorRef[]
}

/**
 * The detail of a contact: a superseded contact says so and points to the
 * active one (AC27), then the customer and the contact's data (AC24), the open
 * alert and the Storico (AC28). An editable contact has the controls that
 * change it: the state, the priority, "Imposta richiamo", the "X" of the open
 * alert (AC29, AC30, AC42, AC44); the operator is one for the admin only (AC47).
 * Last, the other contacts of the customer, always (AC80).
 */
export function ContactDetailContent({ data, da, operators }: Props) {
  return (
    <div className="flex flex-col gap-4">
      {data.editability.kind === "superseded" ? (
        <ContactSupersededBanner activeTaskId={data.activeTaskId} da={da} />
      ) : null}
      <ContactDetailHeader data={data} da={da} operators={operators} />
      <ContactAlertSection
        data={data}
        da={da}
        canEdit={data.editability.kind === "editable"}
        action={
          data.editability.kind === "editable" ? (
            <ContactCallbackForm
              taskId={data.contact.id}
              state={data.contact.state}
              alert={data.alert}
              da={da}
            />
          ) : null
        }
      />
      <ContactHistorySection contacts={data.customerContacts} da={da} />
    </div>
  )
}
