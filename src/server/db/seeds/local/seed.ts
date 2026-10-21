// Seeds the local database: generates the dataset of `n` customers for the day
// `day`, builds its manifest and writes the dataset. No clock reading: the
// caller passes `day`.
// Type only: a value import would load `server-only` and the global `db`
import type { DbClient } from "@mito/server/effect/db"
import { generateDataset } from "./generate"
import { buildManifest } from "./manifest"
import type { Dataset, Day, Manifest } from "./types"
import { writeDataset } from "./write"

export async function seedDatabase(
  client: DbClient,
  { n, day }: { n: number; day: Day }
): Promise<{ dataset: Dataset; manifest: Manifest }> {
  const dataset = generateDataset({ n, day })
  // Before writing: a dataset the manifest rejects leaves the database as it is
  const manifest = buildManifest(dataset, day)
  await writeDataset(client, dataset)
  return { dataset, manifest }
}
