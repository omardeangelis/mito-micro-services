export const dynamic = "force-dynamic"

async function handler() {
  throw new Error("Error importing data")
}

export { handler as GET }
