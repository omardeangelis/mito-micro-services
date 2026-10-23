import { describe, expect, it } from "vitest"
import { type DeployRun, deployReport, waitingReport } from "../deployReport"

const succeeded: DeployRun = {
  environment: "staging",
  ci: "success",
  plan: "success",
  pending: 0,
  approve: "skipped",
  api: "success",
  apiPhase: "/health",
  vercel: "success",
  commit: {
    sha: "fcfdcfe45c2921a5831e76d20dad7dbce74e340a",
    title: "fix(api): copy vendor/",
  },
  actor: "leonardodemarco00",
  revision: "mito-crm-staging-00011-cew",
  backup: "",
  runUrl: "https://github.com/omardeangelis/mito-micro-services/actions/runs/1",
}

describe("deployReport", () => {
  it("reports a deploy that succeeded, with the revision serving the traffic", () => {
    expect(deployReport(succeeded)).toStrictEqual({
      outcome: "succeeded",
      phase: undefined,
      text: [
        ":white_check_mark: *staging · deploy riuscito*",
        "• commit: `fcfdcfe` fix(api): copy vendor/",
        "• avviato da: leonardodemarco00",
        "• revisione: mito-crm-staging-00011-cew",
        "• migrazioni nuove: 0",
        "• run: <https://github.com/omardeangelis/mito-micro-services/actions/runs/1|GitHub Actions>",
      ].join("\n"),
    })
  })

  it("names CI as the phase when the checks failed", () => {
    const report = deployReport({
      ...succeeded,
      ci: "failure",
      plan: "skipped",
      api: "skipped",
      apiPhase: "",
      vercel: "skipped",
      revision: "",
    })

    expect(report.outcome).toBe("failed")
    expect(report.phase).toBe("CI")
    expect(report.text.split("\n")[0]).toBe(
      ":rotating_light: *staging · deploy fallito* nella fase *CI*"
    )
  })

  it.each([
    "immagine",
    "backup",
    "migrazioni",
    "revisione Cloud Run",
    "/health",
  ] as const)("names the backend step that failed: %s", (apiPhase) => {
    const report = deployReport({
      ...succeeded,
      api: "failure",
      apiPhase,
      vercel: "skipped",
    })

    expect(report).toMatchObject({ outcome: "failed", phase: apiPhase })
    expect(report.text).not.toContain("revisione: ")
  })

  it("names the image when the backend job failed before writing a phase", () => {
    const report = deployReport({ ...succeeded, api: "failure", apiPhase: "" })

    expect(report.phase).toBe("immagine")
  })

  it("names Vercel when only the frontend failed", () => {
    const report = deployReport({ ...succeeded, vercel: "failure" })

    expect(report).toMatchObject({ outcome: "failed", phase: "Vercel" })
  })

  it("reports a cancelled run with the phase it reached", () => {
    const report = deployReport({
      ...succeeded,
      api: "cancelled",
      apiPhase: "migrazioni",
      vercel: "skipped",
    })

    expect(report).toMatchObject({ outcome: "cancelled", phase: "migrazioni" })
    expect(report.text.split("\n")[0]).toBe(
      ":white_circle: *staging · deploy annullato* nella fase *migrazioni*"
    )
  })

  it("names who started a run by hand", () => {
    const report = deployReport({ ...succeeded, actor: "omardeangelis" })

    expect(report.text).toContain("• avviato da: omardeangelis")
  })

  it("reports the new migrations and the backup taken before them", () => {
    const report = deployReport({
      ...succeeded,
      pending: 2,
      approve: "success",
      backup: "1729700000000",
    })

    expect(report.text).toContain("• migrazioni nuove: 2")
    expect(report.text).toContain("• backup: 1729700000000")
  })

  it("names the approval when the migrations were rejected", () => {
    const report = deployReport({
      ...succeeded,
      pending: 1,
      approve: "failure",
      api: "skipped",
      apiPhase: "",
      vercel: "skipped",
      revision: "",
    })

    expect(report).toMatchObject({ outcome: "failed", phase: "approvazione" })
  })

  it("names the approval when the run was cancelled while waiting", () => {
    const report = deployReport({
      ...succeeded,
      pending: 1,
      approve: "cancelled",
      api: "skipped",
      vercel: "skipped",
    })

    expect(report).toMatchObject({
      outcome: "cancelled",
      phase: "approvazione",
    })
  })

  it("names the migrations when they couldn't be listed", () => {
    const report = deployReport({
      ...succeeded,
      plan: "failure",
      api: "skipped",
      vercel: "skipped",
    })

    expect(report).toMatchObject({ outcome: "failed", phase: "migrazioni" })
  })

  it("keeps the backup in the message of a deploy that failed after it", () => {
    const report = deployReport({
      ...succeeded,
      pending: 1,
      approve: "success",
      api: "failure",
      apiPhase: "migrazioni",
      vercel: "skipped",
      backup: "1729700000000",
    })

    expect(report.text).toContain("• backup: 1729700000000")
    expect(report.text).not.toContain("migrazioni nuove")
  })
})

describe("waitingReport", () => {
  it("says how many migrations wait and where to approve them", () => {
    expect(
      waitingReport({
        environment: "staging",
        pending: 2,
        commit: succeeded.commit,
        actor: "omardeangelis",
        runUrl: succeeded.runUrl,
      }).split("\n")
    ).toStrictEqual([
      ":hourglass_flowing_sand: *staging · deploy in attesa di approvazione*: 2 migrazioni da applicare",
      "• commit: `fcfdcfe` fix(api): copy vendor/",
      "• avviato da: omardeangelis",
      "• SQL e approvazione: <https://github.com/omardeangelis/mito-micro-services/actions/runs/1|GitHub Actions>",
    ])
  })
})
