import { gzipSync } from "node:zlib"
import { beforeAll, describe, expect, it, vi } from "vitest"
import { stateEnum } from "@mito/db/schema/pratiche"
import { type Cells } from "@mito/domain/import/classify"
import { waveColumns } from "@mito/domain/import/formats"
import { UPLOAD_PART_BYTES, toFileBody } from "@mito/domain/import/payload"
import { waveCells } from "@mito/domain/import/_test/cells"
import { createTestCaller } from "@/test/caller"
import { createUser } from "@/test/factories"
import { hasTestDatabase, migrateUpTo, pgClient } from "@/test/pg"

// AC25 of the import: a Wave file of 20,000 rows, half of customers and
// practices that exist and half new, from the first part to the outcome
// through `import.upload`, `import.start` and the queue in this process,
// in under 30 s (median of 3 runs after a warm-up). It also measures the peak
// memory of the process and the compressed body, which decide T12b. It
// depends on the machine, so it runs only on request: PERF=1 pnpm test:pg

const ROWS = 20_000
const EXISTING = ROWS / 2
/** Customers and practices of the CRM the file doesn't name. */
const OTHERS = 40_000

const letters = "ABCDEFGHIJKLMNOPQRSTUVWXYZ"
const months = "ABCDEHLMPRST"
/** A fiscal code of the right form, one per `n`. */
const fiscalCode = (n: number) => {
  const letter = (k: number) => letters[k % 26]
  const head = [0, 1, 2, 3, 4, 5]
    .map((i) => letter(Math.floor(n / 26 ** i)))
    .join("")
  const day = String((n % 28) + 1).padStart(2, "0")
  return `${head}80${months[n % 12]}${day}H${String(n % 1000).padStart(3, "0")}Z`
}

/** The row of customer `n`, with its practice. */
const row = (n: number): Cells =>
  waveCells({
    "Codice Fiscale": fiscalCode(n),
    "Codice NDG": `NDG${n}`,
    "n° Pratica": `PR${n}`,
  })

describe.skipIf(!hasTestDatabase || !process.env.PERF)(
  "import di 20.000 righe (AC25)",
  () => {
    let admin: Awaited<ReturnType<typeof createUser>>

    beforeAll(async () => {
      await migrateUpTo()
      admin = await createUser({ role: "ADMIN" })
      // The existing half of the file, and the rest of the CRM
      const total = EXISTING + OTHERS
      await pgClient`
        INSERT INTO "mito-deutsche_customers"
          (id, temp_id, unique_hash, source, fiscal_code, fullname, name, surname)
        SELECT 'c' || g, 'NDG' || g, 'hash' || g, 'inbound', NULL,
               'ROSSI MARIO', 'MARIO', 'ROSSI'
        FROM generate_series(0, ${total - 1}) AS g`
      // Their fiscal codes, as the file has them
      const codes = Array.from({ length: total }, (_, n) => fiscalCode(n))
      await pgClient`
        UPDATE "mito-deutsche_customers" AS c SET fiscal_code = v.code
        FROM unnest(${codes}::text[]) WITH ORDINALITY AS v(code, n)
        WHERE c.id = 'c' || (v.n - 1)`
      await pgClient`
        INSERT INTO "mito-deutsche_practices"
          (pratica_id, importo_finanziato, importo_erogato, rate_totali,
           importo_rata, rate_pagate, data_liquidazione, state)
        SELECT 'PR' || g, 2200, 2000, 24, 100, 0, now(), ${stateEnum[0]}::"State"
        FROM generate_series(0, ${total - 1}) AS g`
      await pgClient`
        INSERT INTO "customers_to_pratiche" (customer_id, pratica_id)
        SELECT 'c' || g, 'PR' || g FROM generate_series(0, ${total - 1}) AS g`
      await pgClient`ANALYZE`
    }, 300_000)

    /** One import: the existing half, and a new half of its own. */
    const importOnce = async (run: number) => {
      const fresh = 1_000_000 * (run + 1)
      const cells = [
        ...Array.from({ length: EXISTING }, (_, n) => row(n)),
        ...Array.from({ length: ROWS - EXISTING }, (_, n) => row(fresh + n)),
      ]
      const body = gzipSync(
        JSON.stringify(
          toFileBody(
            waveColumns,
            cells.map((c, index) => ({ row: index + 2, cells: c }))
          )
        )
      )
      const parts = Math.ceil(body.length / UPLOAD_PART_BYTES)
      const caller = createTestCaller(admin)

      const started = performance.now()
      let uploadId = ""
      for (let part = 0; part < parts; part++) {
        const data = body
          .subarray(part * UPLOAD_PART_BYTES, (part + 1) * UPLOAD_PART_BYTES)
          .toString("base64")
        uploadId = (
          part === 0
            ? await caller.import.upload({
                fileName: `perf-${run}.xlsx`,
                format: "wave",
                parts,
                data,
              })
            : await caller.import.upload({ uploadId, part, data })
        ).uploadId
      }
      const { runId } = await caller.import.start({
        uploadId,
        rows: cells.map((_, index) => index + 2),
      })
      const outcome = await vi.waitFor(
        async () => {
          const active = await caller.import.active()
          if (active?.id !== runId || active.status === "running") {
            throw new Error("still running")
          }
          return active
        },
        { timeout: 120_000, interval: 100 }
      )
      return { ms: performance.now() - started, outcome, bytes: body.length }
    }

    it("la mediana di 3 import da 20.000 righe è sotto 30 secondi", async () => {
      let peakRss = 0
      const sampler = setInterval(() => {
        peakRss = Math.max(peakRss, process.memoryUsage().rss)
      }, 50)
      try {
        const warmUp = await importOnce(0)
        // The warm-up proves the import wrote what the file says
        expect(warmUp.outcome).toMatchObject({
          status: "completed",
          rowsTotal: ROWS,
          customersCreated: ROWS - EXISTING,
          customersUpdated: EXISTING,
          practicesCreated: ROWS - EXISTING,
          practicesUpdated: EXISTING,
          linksCreated: ROWS - EXISTING,
        })
        const times: number[] = []
        for (let run = 1; run <= 3; run++) {
          const { ms, outcome } = await importOnce(run)
          expect(outcome.status).toBe("completed")
          times.push(ms)
        }
        times.sort((a, b) => a - b)
        const median = times[1]!
        console.info(
          `import of ${ROWS} rows: median ${(median / 1000).toFixed(1)} s`,
          times.map((ms) => Math.round(ms)),
          `peak RSS ${Math.round(peakRss / 2 ** 20)} MiB,`,
          `body ${(warmUp.bytes / 2 ** 20).toFixed(2)} MiB gzip`
        )

        expect(median).toBeLessThan(30_000)
      } finally {
        clearInterval(sampler)
      }
    }, 600_000)
  }
)
