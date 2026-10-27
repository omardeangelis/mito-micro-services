import { HttpApi } from "effect/http-api"
import { MeGroup } from "./me"

/** The API of MITO, under `/api/v1` (H7): one group per router of tRPC (H8). */
export class MitoApi extends HttpApi.make("mito")
  .add(MeGroup)
  .prefix("/api/v1") {}
