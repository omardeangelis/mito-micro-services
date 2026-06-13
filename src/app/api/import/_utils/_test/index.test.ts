import { expect, describe, test } from "vitest"
import { isWaveRow } from ".."
import { type WaveFile } from "../../_types"

const nullWaveCondition = {
  a: null,
  b: null,
  expected: false,
}

const acceptedCondition = {
  a: "si",
  b: "no",
  expected: true,
}

const oneNullCondition = {
  a: "si",
  b: null,
  expected: true,
}

const cases = [nullWaveCondition, acceptedCondition, oneNullCondition]

describe("isWaveRow checks", () => {
  test.each(cases)("with $a and $b should be $expected", (row) => {
    const { expected, ...rest } = row
    const obj = {
      Garante: rest.a,
      "Cliente Coobbligato": rest.b,
    } as WaveFile
    expect(isWaveRow(obj)).toBe(expected)
  })
})
