import SparkMD5 from "spark-md5"
import type { Customer } from "../schemas"

type HashForCustomer = Pick<Customer, "tempID" | "id">

/** The `uniqueHash` of a customer: MD5 of its customer code and its id. */
export function createHashForCustomer(customer: HashForCustomer) {
  return SparkMD5.hash(`${customer.tempID}-${customer.id}`)
}
