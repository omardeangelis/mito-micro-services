import { operators } from "@/server/db/schema/operators"

export const operatorSelectCompleteResponse = {
  id: operators.id,
  name: operators.name,
  surname: operators.surname,
  userId: operators.userId,
  createdAt: operators.createdAt,
  updatedAt: operators.updatedAt,
}
