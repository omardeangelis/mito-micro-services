// Child process of the time zone test of generateDataset: it runs with the TZ
// the test sets, and prints a sha256 of the whole dataset for each day given as
// argument (Dates serialize as ISO, so any shift would change the hash).
import { createHash } from "node:crypto"
import { generateDataset } from "../generate"

const hashes: Record<string, string> = {}
for (const day of process.argv.slice(2)) {
  hashes[day] = createHash("sha256")
    .update(JSON.stringify(generateDataset({ n: 300, day })))
    .digest("hex")
}
console.log(
  "HASHES:" +
    JSON.stringify({
      offset: new Date("2026-01-15T12:00:00Z").getTimezoneOffset(),
      hashes,
    })
)
