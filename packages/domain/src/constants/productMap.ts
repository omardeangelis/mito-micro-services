export type ProductMapKey =
  | "01"
  | "02"
  | "03"
  | "04"
  | "05"
  | "06"
  | "07"
  | "11"
  | "13"
  | "14"
  | "15"
  | "16"
  | "17"
  | "18"
  | "20"
  | "21"
  | "22"
  | "23"
  | "24"
  | "25"
  | "26"
  | "27"
  | "28"
  | "29"
  | "30"
  | "31"
  | "32"
  | "34"
  | "36"
  | "37"

export type ProductMapType = "Personale" | "auto" | "Finalizzato"

export type ProductMap = Map<ProductMapKey, [string, ProductMapType]>

export const productMap = new Map([
  ["01", ["PRESTITO PERSONALE", "Personale"]],
  ["02", ["REPEAT BUSINESS", "Personale"]],
  ["03", ["DISINTERMEDIATO AUTOMOTIVE", "Personale"]],
  ["04", ["DISINTERMEDIATO ALTRI BENI", "Personale"]],
  ["05", ["CONSOLIDAMENTO", "Personale"]],
  ["06", ["PRESTITI CON TRATTENUTA", "Personale"]],
  ["07", ["DIPENDENTI AZIENDE DOC B2E", "Personale"]],
  ["11", ["REWRITE", "Personale"]],
  ["13", ["CQS PRIVATI", "Personale"]],
  ["14", ["CQS PUBBLICI/STATALI CREDITONET", "Personale"]],
  ["15", ["CQS PUBBLICO/MINISTERIALE NO CREDITONET", "Personale"]],
  ["16", ["CQS MINISTERIALI CREDITONET", "Personale"]],
  ["17", ["DELEGAZIONE DI PAGAMENTO", "Personale"]],
  ["18", ["CQP INPS", "Personale"]],
  ["20", ["AUTOMOTIVE NUOVO", "auto"]],
  ["21", ["AUTOMOTIVE USATO", "auto"]],
  ["22", ["AUTOMOTIVE AZIENDE NUOVO", "auto"]],
  ["23", ["MOTO E MOTOCICLI NUOVO", "auto"]],
  ["24", ["ARREDAMENTO", "Finalizzato"]],
  ["25", ["CASA PICCOLI INTERVENTI", "Finalizzato"]],
  ["26", ["ELETTRONICA & ELETTRODOMESTICI", "Finalizzato"]],
  ["27", ["ALTRI BENI E SERVIZI", "Finalizzato"]],
  ["28", ["NAUTICA E VEICOLI NON TARGATI", "Finalizzato"]],
  ["29", ["SPESE MEDICHE", "Finalizzato"]],
  ["30", ["TEMPO LIBERO", "Finalizzato"]],
  ["31", ["CASA GRANDI INTERVENTI", "Finalizzato"]],
  ["32", ["ALTRO FINALIZZATO PER AZIENDE", "Finalizzato"]],
  ["34", ["CQP INPDAP", "Personale"]],
  ["36", ["MOTO E MOTOCICLI USATO", "auto"]],
  ["37", ["CQS PARAPUBBLICO", "Personale"]],
]) satisfies ProductMap

export const createCompatibleProductKey = (key: ProductMapKey) => {
  if (key.length === 1) {
    return `0${key}` as ProductMapKey
  }
  return key
}

export const getProductLabel = (key: ProductMapKey) =>
  productMap.get(createCompatibleProductKey(key))?.[0]
export const getProductType = (
  key: ProductMapKey
): ProductMapType | undefined =>
  productMap.get(createCompatibleProductKey(key))?.[1]
export const getProductKey = (label: string) => {
  for (const [key, value] of productMap.entries()) {
    if (value[0] === label) {
      return key
    }
  }
}

export const getLabelColorByProductType = (type: ProductMapType) => {
  switch (type) {
    case "Personale":
      return "bg-green-100 text-green-800"
    case "auto":
      return "bg-blue-100 text-blue-800"
    case "Finalizzato":
      return "bg-yellow-100 text-yellow-800"
    default:
      return "bg-secondary"
  }
}

export const getAllProductMapKeys = () => {
  return Array.from(productMap.keys())
}

export const getAllProductLabels = () => {
  return Array.from(productMap.values()).map((value) => value[0])
}

export const generateRandomProductKey = () => {
  const allProductKeys = getAllProductMapKeys()
  const randomIndex = Math.floor(Math.random() * allProductKeys.length)
  const randomNumber = allProductKeys[randomIndex]
  return randomNumber
}
