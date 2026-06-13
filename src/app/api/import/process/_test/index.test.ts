import { describe, expect, test } from "vitest"
import fs from "fs"
import path from "path"
import { getHeaders } from "./utils"
import { isWave } from "../../_utils"
import { parseFileName } from "../_services/parsePratica"

const fileStandard = fs.readFileSync(
  path.resolve(__dirname, "./assets/standard.xlsx")
)

const fileWaveBase = fs.readFileSync(
  path.resolve(__dirname, "./assets/wave-base.xlsx")
)

describe("isWave checks", async () => {
  describe("Light wave is a wave", async () => {
    const fileLights = fs.readFileSync(
      path.resolve(__dirname, "./assets/light.xlsx")
    )

    test("should be true", async () => {
      expect(fileLights).toBeDefined()
    })

    const lightsHeaders = await getHeaders(fileLights)

    test("should be an array", async () => {
      expect(lightsHeaders).toBeInstanceOf(Array)
    })

    test("should have the correct headers", async () => {
      const isWaveFile = isWave(lightsHeaders)
      expect(isWaveFile).toBe(true)
    })
  })

  describe("Standard file is not a wave", async () => {
    test("should be true", async () => {
      expect(fileStandard).toBeDefined()
    })

    const standardHeaders = await getHeaders(fileStandard)

    test("should be an array", async () => {
      expect(standardHeaders).toBeInstanceOf(Array)
    })

    test("should not have the correct headers", async () => {
      const isWaveFile = isWave(standardHeaders)
      expect(isWaveFile).toBe(false)
    })
  })

  describe("Wave base file is a wave", async () => {
    test("should be true", async () => {
      expect(fileWaveBase).toBeDefined()
    })

    const waveBaseHeaders = await getHeaders(fileWaveBase)

    test("should be an array", async () => {
      expect(waveBaseHeaders).toBeInstanceOf(Array)
    })

    test("should have the correct headers", async () => {
      const isWaveFile = isWave(waveBaseHeaders)
      expect(isWaveFile).toBe(true)
    })
  })
})

describe("File Name", async () => {
  test("Replace '-' with '_' in file name", async () => {
    const fileName = "0924_test-file-name"
    const newFileName = parseFileName(fileName)
    expect(newFileName).toBe(`0924_test_file_name`)
  })

  test("Add MMYY to file name if it doesn't have a number", async () => {
    const fileName = "test-file-name"
    const newFileName = parseFileName(fileName)
    const date = new Date()
    const romeDate = new Date(
      date.toLocaleString("en-US", { timeZone: "Europe/Rome" })
    )
    const mm = String(romeDate.getMonth() + 1).padStart(2, "0")
    const yy = romeDate.getFullYear().toString().slice(-2)
    expect(newFileName).toBe(`${mm}${yy}_test_file_name`)
  })
})
