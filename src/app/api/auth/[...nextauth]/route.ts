import NextAuth from "next-auth"
import { authOptions } from "@/server/auth"

// eslint-disable-next-line @typescript-eslint/no-unsafe-assignment
const handler = NextAuth({
  ...authOptions,
  callbacks: {
    ...authOptions.callbacks,
  },
})
export { handler as GET, handler as POST }
