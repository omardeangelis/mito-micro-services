import { Effect, Layer } from "effect"
import { HttpApiBuilder } from "effect/http-api"
import { MitoApi } from "@mito/contract/api"
import { type CustomerUnderReview } from "@mito/contract/customer"
import {
  type CannotDeactivateSelf,
  type HandoverSameOperator,
  type LastAdmin,
  type OperatorIsAdmin,
  type OperatorNotFound,
} from "@mito/contract/errors"
import { type Operator, type Role } from "@mito/contract/schemas"
import { ada, type FakeHandlers, type GroupService } from "./api"

/** A call the test didn't expect: it dies, a 500 */
const unserved = () => Effect.die("not served by this test")

type OperatorWithRole = Operator & { role: Role }

/** An operator of the table, with a surname "Test" as the Next.js tests */
export const operatorRow = (
  id: number,
  name: string,
  role: Role
): OperatorWithRole => ({
  id,
  name,
  surname: "Test",
  role,
  userId: `user-${id}`,
  createdAt: new Date("2026-10-01T08:00:00.000Z"),
  updatedAt: null,
})

type UnderReview = typeof CustomerUnderReview.Type

/** A customer in review, of the operator Mario Rossi */
export const underReview = (
  overrides: Partial<UnderReview> = {}
): UnderReview => ({
  id: "c-1",
  name: "Giulia",
  surname: "Verdi",
  fiscalCode: "VRDGLI80A01H501U",
  vatCode: null,
  birthdayDate: null,
  blackListStatus: "review",
  operatore: { id: 7, name: "Mario", surname: "Rossi" },
  signedPractices: 0,
  ...overrides,
})

/**
 * A backend in memory for the settings: the current user (`me`), the
 * members of the team with their roles and deactivations, and the
 * customers of the blacklist. Each write is kept, in order, and changes what
 * the next read answers, as the backend does
 */
export function fakeProfile(
  initial: {
    me?: Operator
    role?: Role
    operators?: OperatorWithRole[]
    underReview?: UnderReview[]
  } = {}
) {
  const state = {
    me: initial.me ?? ada,
    role: initial.role ?? "ADMIN",
    operators: initial.operators ?? [],
    impact: { customers: 3, contacts: 2, practices: 1 },
    // The destinations: the operators but the one leaving, unless set
    targets: undefined as
      | Array<{ id: number; name: string | null; surname: string | null }>
      | undefined,
    moved: { customersMoved: 3, contactsMoved: 2, practicesMoved: 1 },
    underReview: initial.underReview ?? [],
    // What each write was asked
    profileUpdates: [] as Array<{
      name?: string | null | undefined
      surname?: string | null | undefined
    }>,
    roleUpdates: [] as Array<ReadonlyArray<{ id: number; role: Role }>>,
    deactivations: [] as Array<{ operatorId: number; toOperatorId: number }>,
    blacklistChanges: [] as Array<{ id: string; blackListStatus: string }>,
    // How many times the impact was read
    impactReads: 0,
    // While set, a blacklist change waits for it before it is saved
    blacklistHeld: undefined as Promise<void> | undefined,
    // Refusals of the server
    roleRejected: undefined as LastAdmin | OperatorNotFound | undefined,
    deactivateRejected: undefined as
      | OperatorNotFound
      | CannotDeactivateSelf
      | OperatorIsAdmin
      | HandoverSameOperator
      | undefined,
    // These don't answer: a 500
    failingProfile: false,
    failingOperators: false,
    failingRoles: false,
    failingImpact: false,
    failingDeactivate: false,
    failingUnderReview: false,
    failingBlacklist: false,
  }

  const down = <A>(failing: boolean, read: () => A) =>
    Effect.suspend(() =>
      failing ? Effect.die("backend down") : Effect.succeed(read())
    )

  const handlers: FakeHandlers<
    GroupService<"me"> | GroupService<"operator"> | GroupService<"customer">
  > = Layer.mergeAll(
    HttpApiBuilder.group(MitoApi, "me", (handlers) =>
      handlers
        .handle("getCurrentUser", () =>
          Effect.sync(() => ({
            role: state.role,
            operatorId: state.me.id,
            operator: state.me,
            preferences: {},
          }))
        )
        .handle("updateOperatorInfo", ({ payload }) =>
          down(state.failingProfile, () => {
            state.profileUpdates.push(payload)
            state.me = { ...state.me, ...payload }
            return { ...state.me, role: state.role }
          })
        )
    ),
    HttpApiBuilder.group(MitoApi, "operator", (handlers) =>
      handlers
        .handle("getAllUniqueOperators", () =>
          down(state.failingOperators, () => state.operators)
        )
        .handle("getTeam", () =>
          down(state.failingOperators, () =>
            state.operators.map(({ id, name, surname, role, userId }) => ({
              id,
              name,
              surname,
              role,
              email: `${userId}@mito.test`,
            }))
          )
        )
        .handle("getOperatorById", unserved)
        .handle("updateOperatorsRole", ({ payload }) =>
          Effect.suspend(() => {
            if (state.failingRoles) return Effect.die("backend down")
            if (state.roleRejected) return Effect.fail(state.roleRejected)
            state.roleUpdates.push(payload)
            state.operators = state.operators.map((operator) => ({
              ...operator,
              role:
                payload.find((change) => change.id === operator.id)?.role ??
                operator.role,
            }))
            return Effect.succeed(payload)
          })
        )
        .handle("getDeactivationImpact", () =>
          down(state.failingImpact, () => {
            state.impactReads++
            return state.impact
          })
        )
        .handle("getOperatorsForDeactivation", ({ params }) =>
          Effect.sync(
            () =>
              state.targets ??
              state.operators
                .filter((operator) => operator.id !== params.operatorId)
                .map(({ id, name, surname }) => ({ id, name, surname }))
          )
        )
        .handle("deactivate", ({ params, payload }) =>
          Effect.suspend(() => {
            if (state.failingDeactivate) return Effect.die("backend down")
            if (state.deactivateRejected)
              return Effect.fail(state.deactivateRejected)
            state.deactivations.push({
              operatorId: params.operatorId,
              toOperatorId: payload.toOperatorId,
            })
            state.operators = state.operators.filter(
              (operator) => operator.id !== params.operatorId
            )
            return Effect.succeed(state.moved)
          })
        )
    ),
    HttpApiBuilder.group(MitoApi, "customer", (handlers) =>
      handlers
        .handle("getAllCustomers", unserved)
        .handle("getCustomersByFiscalCodeOrVatCode", unserved)
        .handle("getAllCustomerForPratica", unserved)
        .handle("getCustomerUnderReview", ({ query }) =>
          down(state.failingUnderReview, () => {
            const start = (query.page - 1) * query.perPage
            return {
              customers: state.underReview.slice(start, start + query.perPage),
              total: state.underReview.length,
              blacklisted: state.underReview.filter(
                (customer) => customer.blackListStatus === "blacklisted"
              ).length,
            }
          })
        )
        .handle("getAllAvailableComune", unserved)
        .handle("getAllAvaliableSede", unserved)
        .handle("getAllAvailableAmbito", unserved)
        .handle("getAllAvailableJobs", unserved)
        .handle("getAllFileName", unserved)
        .handle("getCustomerById", unserved)
        .handle("getAllPraticaByCustomer", unserved)
        .handle("insertCustomer", unserved)
        .handle("updateCustomerFromDashboard", unserved)
        .handle("handleCustomerBlackList", ({ params, payload }) =>
          Effect.promise(() => state.blacklistHeld ?? Promise.resolve()).pipe(
            Effect.andThen(
              down(state.failingBlacklist, () => {
                state.blacklistChanges.push({
                  id: params.id,
                  blackListStatus: payload.blackListStatus,
                })
                // A whitelisted customer is no longer under review
                state.underReview = state.underReview.flatMap((customer) =>
                  customer.id !== params.id
                    ? [customer]
                    : payload.blackListStatus === "whitelisted"
                      ? []
                      : [
                          {
                            ...customer,
                            blackListStatus: payload.blackListStatus,
                          },
                        ]
                )
              })
            )
          )
        )
        .handle("handover", unserved)
        .handle("assignToYourself", unserved)
        .handle("updateLastEdit", unserved)
        .handle("bulkUpdateCustomers", unserved)
    )
  )

  return { state, handlers }
}
