import { render } from "@testing-library/react"
import { describe, expect, it } from "vitest"
import { BlackListBadge } from "../BlackListBadge"

// Il badge della blacklist del cliente col suo tono (AC16, appendice B della
// spec design-system-web): blacklisted red, review amber, whitelisted green
describe("BlackListBadge", () => {
  it.each([
    ["blacklisted", "red"],
    ["review", "amber"],
    ["whitelisted", "green"],
  ] as const)("%s ha il tono %s e la misura di AC16", (state, tone) => {
    const { container } = render(<BlackListBadge state={state} />)
    const badge = container.firstElementChild as HTMLElement
    expect(badge.className.split(" ")).toEqual(
      expect.arrayContaining([
        `bg-tag-${tone}-bg`,
        `border-tag-${tone}-border`,
        `text-tag-${tone}-text`,
        "rounded-full",
      ])
    )
    expect(badge.className).toMatch(/(^| )h-(5\.5|\[22px\])( |$)/)
  })
})
