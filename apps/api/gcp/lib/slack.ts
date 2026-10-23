/**
 * Posts `text` to a Slack Incoming Webhook. It never throws: a deploy must
 * not fail because Slack didn't answer, so it prints a GitHub ::warning::
 * instead, without the webhook, which is a secret.
 */
export async function postToSlack(
  webhookUrl: string | undefined,
  text: string
) {
  const url = webhookUrl?.trim()
  if (!url) {
    console.log(
      "::warning::SLACK_DEPLOY_WEBHOOK_URL is not set: no message sent"
    )
    return
  }
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text }),
      signal: AbortSignal.timeout(10_000),
    })
    if (!response.ok)
      console.log(
        `::warning::Slack answered ${response.status}: no message sent`
      )
  } catch (error) {
    console.log(
      `::warning::Slack didn't answer (${error instanceof Error ? error.name : "error"}): no message sent`
    )
  }
}
