import { Link } from "react-router"
import { defaultState } from "@mito/client/contact/searchParams"
import { useMyToCall } from "@/api/home"
import { listHref } from "@/routes/dashboard/contatti/_lib/listHref"
import { thousands } from "../_lib/format"
import { StatBox } from "./StatBox"

const TO_CALL_HREF = listHref({
  ...defaultState,
  onlyMe: true,
  states: ["chiamare", "non risponde"],
})

/** «Apri la lista»: the Contatti list on what «Da chiamare» counts */
export function ToCallLink() {
  return (
    <Link
      to={TO_CALL_HREF}
      className="text-link underline-offset-3 font-medium hover:underline"
    >
      Apri la lista
    </Link>
  )
}

/** «Da chiamare». The width holds «7.730 Apri la lista» (AC42) */
export function ToCallBox() {
  return (
    <StatBox
      label="Da chiamare"
      className="min-w-[11rem]"
      what="da chiamare"
      announced="Da chiamare caricato"
      query={useMyToCall()}
    >
      {({ total }) => (
        <>
          <span className="font-label tabular-nums">{thousands(total)}</span>{" "}
          {total > 0 ? <ToCallLink /> : null}
        </>
      )}
    </StatBox>
  )
}
