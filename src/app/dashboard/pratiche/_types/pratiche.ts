import { type stateEnum } from "@/server/db/schema/pratiche"

export type PraticaState = (typeof stateEnum)[number]

export const inputPraticaState = [
  "LIQUIDATA",
  "RIFIUTATA",
  "CHIUSA",
  "ESTINTA ANTICIP.",
  "Perfezionata",
  "05 Rinunciata",
  "30 Rinunciata",
  "40 Erogata",
  "45 Stornata/Revocata",
] as const

export type InputPraticaState = (typeof inputPraticaState)[number]
