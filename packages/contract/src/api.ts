import { HttpApi } from "effect/http-api"
import { AnalyticsGroup } from "./analytics"
import { ChatGroup } from "./chat"
import { CustomerGroup } from "./customer"
import { ExportGroup } from "./export"
import { ImportGroup } from "./import"
import { MeGroup } from "./me"
import { OperatorGroup } from "./operator"
import { PraticheGroup } from "./pratiche"
import { TaskGroup } from "./task"

/** The API of MITO, under `/api/v1` (H7): one group per router of tRPC (H8). */
export class MitoApi extends HttpApi.make("mito")
  .add(MeGroup)
  .add(CustomerGroup)
  .add(OperatorGroup)
  .add(TaskGroup)
  .add(PraticheGroup)
  .add(ChatGroup)
  .add(AnalyticsGroup)
  .add(ExportGroup)
  .add(ImportGroup)
  .prefix("/api/v1") {}
