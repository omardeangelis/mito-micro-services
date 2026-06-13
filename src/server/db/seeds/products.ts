/* eslint-disable @typescript-eslint/no-unsafe-member-access */
import type * as schema from "../schema/index"
import { products } from "../schema/index"
import type { PostgresJsDatabase } from "drizzle-orm/postgres-js"
import { productMap } from "../../../lib/constants/productMap"
import { loadEnv } from "@/lib/global/env"

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
