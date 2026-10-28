import { standardSchemaResolver } from "@hookform/resolvers/standard-schema"
import { Schema, SchemaIssue } from "effect"
import { type FieldValues } from "react-hook-form"

/**
 * The text of a field the user left empty, as zod writes it: the forms of the
 * Next.js app show it
 */
export const REQUIRED = "Required"

/**
 * A field that must be filled: an empty one reads `REQUIRED`. The checks go
 * after it (`Required(Schema.String).check(…)`), or their message wins
 */
export const Required = <S extends Schema.Top>(schema: S) =>
  schema.annotate({ message: REQUIRED })

/**
 * The resolver of react-hook-form for a `Schema`, through Standard Schema
 * (rule 3 of brain/chore/roadmap-nuovo-stack.md): every issue of every field,
 * a missing field as `REQUIRED`. The form receives the decoded values
 */
export const schemaResolver = <A, I extends FieldValues>(
  schema: Schema.Codec<A, I>
) =>
  standardSchemaResolver(
    Schema.toStandardSchemaV1(schema, {
      leafHook: (issue) =>
        issue._tag === "MissingKey"
          ? REQUIRED
          : SchemaIssue.defaultLeafHook(issue),
      parseOptions: { errors: "all" },
    })
  )
