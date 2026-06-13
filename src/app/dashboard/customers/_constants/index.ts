import { customers } from "@/server/db/schema/customers"
import { practices } from "@/server/db/schema/pratiche"
import { task } from "@/server/db/schema/task"
import { getTableColumns } from "drizzle-orm"
import { type PgColumn } from "drizzle-orm/pg-core"

const {
  birthdayDate,
  age,
  source,
  comune,
  sede,
  phoneNumber,
  ambitoLavorativo,
  occupazione,
} = getTableColumns(customers)
const { state, closedAt } = getTableColumns(task)

export const CUSTOMER_FILTER_MAP = new Map<string, PgColumn>([
  ["Compleanno", birthdayDate],
  ["Età", age],
  ["Fonte", source],
  ["Comune", comune],
  ["Sede", sede],
  ["Telefono", phoneNumber],
  ["Stato", state],
  ["Contattato il", closedAt],
  ["Ambito", ambitoLavorativo],
  ["Occupazione", occupazione],
])

export const CUSTOMER_FILTER_QUERY_MAP = new Map<PgColumn["name"], PgColumn>(
  Array.from(CUSTOMER_FILTER_MAP).map(([_key, value]) => [value.name, value])
)

const {
  dataLiquidazione,
  debitoResiduo,
  importoFinanziato,
  ratePagate,
  state: praticaState,
  importoErogato,
  importoRichiesto,
  rateTotali,
  region,
  importoRata,
} = getTableColumns(practices)

export const PRATICA_FILTER_MAP = new Map<string, PgColumn>([
  ["Liquidato il", dataLiquidazione],
  ["Debito", debitoResiduo],
  ["Finanzato", importoFinanziato],
  ["Rate pagate", ratePagate],
  ["Stato", praticaState],
  ["Erogato", importoErogato],
  ["Richiesto", importoRichiesto],
  ["Rate totali", rateTotali],
  ["Regione", region],
  ["Rata", importoRata],
])

export const PRATICA_FILTER_QUERY_MAP = new Map<PgColumn["name"], PgColumn>(
  Array.from(PRATICA_FILTER_MAP).map(([_key, value]) => [value.name, value])
)
