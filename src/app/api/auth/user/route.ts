import { getServerAuthSession } from "@/server/auth"
import { db } from "@/server/db"
import { operators } from "@/server/db/schema/operators"
import { users } from "@/server/db/schema/users"
import { eq } from "drizzle-orm"
import { NextResponse } from "next/server"

async function handler() {
  try {
    const session = await getServerAuthSession()
    if (!session || !session.user) {
      return
    }
    const result = await db
      .select()
      .from(users)
      .leftJoin(operators, eq(users.id, operators.userId))
      .where(eq(users.id, session.user.id))

    const user = result[0]?.user
    const operator = result[0]?.operator
    const isAdmin = user?.role === "ADMIN"

    return NextResponse.json({ operator, isAdmin })
  } catch (error) {
    console.error("Error getting user: ", error)
    return NextResponse.json({ error: "Internal Server Error" })
  }
}

export { handler as GET, handler as POST }
