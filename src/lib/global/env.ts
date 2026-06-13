import { config } from "dotenv"

export function loadEnv(): void {
  config({
    path: `.env.${process.env.NODE_ENV}.local`,
  })
}

export const env = {
  isProd: process.env.NODE_ENV === "production",
  isDev: process.env.NODE_ENV === "development",
  isTest: process.env.NODE_ENV === "test",
}
