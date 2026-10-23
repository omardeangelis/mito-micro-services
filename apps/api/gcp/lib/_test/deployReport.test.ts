import { describe, expect, it } from "vitest"
import { type DeployRun, deployReport } from "../deployReport"

const succeeded: DeployRun = {
  environment: "staging",
  ci: "success",
  api: "success",
  apiPhase: "/health",
  vercel: "success",
  commit: {
    sha: "fcfdcfe45c2921a5831e76d20dad7dbce74e340a",
    title: "fix(api): copy vendor/",
  },
  actor: "leonardodemarco00",
  revision: "mito-crm-staging-00011-cew",
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
        "• run: <https://github.com/omardeangelis/mito-micro-services/actions/runs/1|GitHub Actions>",
      ].join("\n"),
    })
  })

  it("names CI as the phase when the checks failed", () => {
    const report = deployReport({
      ...succeeded,
      ci: "failure",
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
})
