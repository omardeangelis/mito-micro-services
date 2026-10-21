/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type * as schema from "@mito/db/schema/index"
import { products } from "@mito/db/schema/index"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { productMap } from "@mito/domain/constants/productMap"
import { loadEnv } from "@/lib/global/loadDbEnv"

loadEnv()
type Product = {
  productCode: string
  productLabel: string
  productType: string
}

export const createProducts = async function seed(
  db: PostgresJsDatabase<typeof schema>
): Promise<void> {
  const productsArray = new Array<Product>()
  productMap.forEach((value, key) => {
    const newProduct = {
      productCode: key,
      productLabel: value[0],
      productType: value[1],
    }
    productsArray.push(newProduct)
  })

  for (const newProduct of productsArray) {
    await db.insert(products).values(newProduct)
  }
}
