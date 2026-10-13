import fs from "fs"
import path from "path"
import { queryReadOnly } from "@/test/db"

const PREVIEW_FILE = path.resolve(__dirname, "../contatti-cleanup-preview.sql")

/**
 * Runs contatti-cleanup-preview.sql on the test database in a read-only
 * transaction, so a write would fail it. Returns its three lists.
 */
export async function runCleanupPreview() {
  const [duplicates, alerts, realign] = await queryReadOnly(
    fs.readFileSync(PREVIEW_FILE, "utf8")
  )
  return { duplicates: duplicates!, alerts: alerts!, realign: realign! }
}
