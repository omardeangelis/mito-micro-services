// Creates the mito_app user of the staging Cloud SQL instance, with a random
// password that goes only to the secret STAGING_CLOUDSQL_MITO_APP_PASSWORD:
//   node apps/api/gcp/create-staging-db-user.mjs
//
// The password never reaches a command line (gcloud keeps them in its logs),
// the screen or a file: it goes to gcloud on stdin and to the Cloud SQL Admin
// API in the body of the request. It stops before creating anything if the
// secret already exists. mito_app owns the database (created after, through
// the Auth Proxy) as `postgres` owns the Supabase one.
import { spawnSync } from "node:child_process"
import { randomBytes } from "node:crypto"

const PROJECT = "mito-crm"
const REGION = "europe-west3"
const INSTANCE = "mito-crm-staging"
const SECRET = "STAGING_CLOUDSQL_MITO_APP_PASSWORD"
const USER = "mito_app"

const gcloud = (args, input) => {
  const result = spawnSync("gcloud", [...args, `--project=${PROJECT}`], {
    input,
    encoding: "utf8",
  })
  return {
    ok: result.status === 0,
    out: result.stdout.trim(),
    err: result.stderr,
  }
}

if (gcloud(["secrets", "describe", SECRET]).ok) {
  console.error(`Nothing created: ${SECRET} exists already`)
  process.exit(1)
}

const password = randomBytes(32).toString("base64url")
const created = gcloud(
  [
    "secrets",
    "create",
    SECRET,
    "--replication-policy=user-managed",
    `--locations=${REGION}`,
    "--labels=env=staging",
    "--data-file=-",
  ],
  password
)
if (!created.ok) {
  console.error(`Secret not created:\n${created.err}`)
  process.exit(1)
}

const token = gcloud(["auth", "print-access-token"]).out
const api = `https://sqladmin.googleapis.com/v1/projects/${PROJECT}`
const response = await fetch(`${api}/instances/${INSTANCE}/users`, {
  method: "POST",
  headers: {
    Authorization: `Bearer ${token}`,
    "Content-Type": "application/json",
  },
  body: JSON.stringify({ name: USER, password }),
})
let operation = await response.json()
if (!response.ok) {
  console.error(
    `User not created (${response.status}): ${JSON.stringify(operation.error)}`
  )
  console.error(
    `The secret ${SECRET} holds a password no user has: delete it before running again`
  )
  process.exit(1)
}
while (operation.status !== "DONE") {
  await new Promise((resolve) => setTimeout(resolve, 2000))
  operation = await (
    await fetch(`${api}/operations/${operation.name}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
  ).json()
}
if (operation.error) {
  console.error(`User not created: ${JSON.stringify(operation.error)}`)
  process.exit(1)
}
console.log(`${USER} created on ${INSTANCE}; its password is in ${SECRET}`)
