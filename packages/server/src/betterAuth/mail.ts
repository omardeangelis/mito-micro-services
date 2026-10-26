import { createTransport } from "nodemailer"

type MailEnv = Partial<
  Record<
    | "NODE_ENV"
    | "SENDGRID_USERNAME"
    | "SENDGRID_API_KEY"
    | "SENDGRID_SERVER"
    | "SENDGRID_PORT",
    string
  >
>

/**
 * Who sends the link of the email login (AC7): in `development` the server's
 * console, elsewhere SendGrid when its four vars are set, otherwise nobody.
 */
export function magicLinkSender(
  vars: MailEnv
): ((email: string, url: string) => Promise<void>) | undefined {
  if (vars.NODE_ENV === "development") {
    return async (email, url) => {
      console.log(`Sign-in link for ${email}: ${url}`)
    }
  }
  const {
    SENDGRID_USERNAME,
    SENDGRID_API_KEY,
    SENDGRID_SERVER,
    SENDGRID_PORT,
  } = vars
  if (
    !SENDGRID_USERNAME ||
    !SENDGRID_API_KEY ||
    !SENDGRID_SERVER ||
    !SENDGRID_PORT
  ) {
    return undefined
  }
  const transport = createTransport(
    `smtp://${SENDGRID_USERNAME}:${SENDGRID_API_KEY}@${SENDGRID_SERVER}:${SENDGRID_PORT}`
  )
  return async (email, url) => {
    const { host } = new URL(url)
    await transport.sendMail({
      to: email,
      from: "hpv4learning@gmail.com",
      subject: `Sign in to ${host}`,
      text: `Sign in to ${host}\n${url}\n\n`,
      html: `<p>Sign in to <strong>${host}</strong></p><p><a href="${url}">Sign in</a></p>`,
    })
  }
}
