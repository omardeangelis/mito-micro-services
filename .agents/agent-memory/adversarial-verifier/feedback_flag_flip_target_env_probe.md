---
name: flag-flip-target-env-probe
description: When a gate's remedy turns on a routing flag (auth/REST rewrite to another service), check the target service's deployed env can serve it; probe NextAuth providers under the deploy script's env with tsx
metadata:
  type: feedback
---

A release gate that says "if flag X is missing, turn on X, Y, Z and redeploy" moves traffic to another service. Check the target service, not only the router config:

- Read the deploy script's env for that service. `gcloud run deploy --set-env-vars` and `--set-secrets` replace everything, so only the listed keys exist, and the gate's own "redeploy" wipes any hand-added variable.
- For an auth rewrite, list the login providers under that exact env: `env -i PATH=$PATH HOME=$HOME NODE_OPTIONS=--conditions=react-server <deploy env…> node_modules/.bin/tsx --tsconfig <repo>/tsconfig.json probe.mts`, where the probe does `await import("<repo>/packages/server/src/auth.ts")` and prints `authOptions.providers.map(p => p.id)`. Without `react-server`, `server-only` throws. A control with the provider env set dies with "X is not a function" (CJS interop under tsx): that still shows the branch was entered.
- Also check the target runbook's prerequisites (fresh DB copy, owners). A gate step that jumps to the runbook's last step skips them.

**Why:** chat-storage-effect PR B, v5 docs pass: GB2's remedy turned on BACKEND_AUTH, but the Cloud Run deploy script gives the backend no AZURE_AD_* or SENDGRID_*, so NextAuth there had `providers: []`. No new login on staging was possible.

**How to apply:** any gate or runbook that flips a rewrite/flag as a fix. Related: [[runtime-topology-claims]], [[release-runbook-as-procedure]].
