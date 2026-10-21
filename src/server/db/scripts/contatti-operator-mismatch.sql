-- Active contacts whose operator differs from their customer's (PR6, T6.9),
-- listed before the realignment migration runs and again after it (read only).
--
-- Six independent SELECTs. In the Supabase SQL editor run one at a time
-- (select it, then Run) and export the result. Nothing here writes. Run it
-- before writing the migration (the counts of the first SELECT decide whether
-- the release can go on), right before the release session (the trace of what
-- the migration moves) and right after it (expected: a = 0 and b = 0, except
-- the cases the owner, Omar, accepted in writing; if not, a code path still
-- separates customer and contact: open a fix and realign, PLAN T6.9).
--
-- The invariant (D26): a customer and its active contact have the same
-- operator. The migration gives every active contact the operator of its
-- customer when the customer has one. Two cases it can't decide, and the
-- release stops on either one until the owner (Omar) has decided in writing.
-- Whoever runs the script sends the counts and the lists to him:
--   (b) the customer has no operator and the contact has one
--       (`b` > 0: send the list of SELECT 5);
--   (a2 exportable) the contact has no operator and the customer has one, with
--       calls the export would start to count (see "exportable" below)
--       (`a2_esportabili` > 0: send the list of SELECT 4). Two outcomes: accept
--       it (the migration goes on, the calls enter the export, the operators'
--       announcement says so) or don't release.
-- Not a stop: `a` and `a2` (the migration moves them) and `c` (for
-- information). Note that the count `a2` is every contact with no operator
-- whose customer has one; only `a2_esportabili` is the stop.
--
-- "Exportable" is what the calls export reads (`closedCalls`,
-- src/server/services/export/calls.ts): `closed_at` set and a state other than
-- `nessuno` (a missing state is not exportable either). It ignores the dates
-- of the export's interval, so "exportable" means closed in some interval. The
-- export inner-joins operators, so a contact with no operator is left out
-- today; once it has one, its calls come in.
--
-- Contacts without a customer, and inactive contacts, are never listed: the
-- migration doesn't touch them either.

-- 1. The counts. One row.
--   contatti_attivi  active contacts with a customer, for scale;
--   a                the customer has an operator and the contact has another
--                    one or none: the migration moves these;
--   a2               among (a), the contact has no operator;
--   a2_esportabili   among (a2), the ones with exportable calls: they enter
--                    the export once moved (A16). STOP if > 0;
--   b                the customer has no operator and the contact has one: the
--                    migration leaves these as they are, the owner decides.
--                    STOP if > 0;
--   c                the customer and the contact have no operator, and the
--                    contact has exportable calls: not touched by the
--                    migration, but "Assegna Clienti", "Assegna a te" and the
--                    handover would bring them into the export (A16). For
--                    information, never a stop.
WITH "contatti" AS (
  SELECT
    t."operator_id" AS "operatore_contatto",
    c."operator_id" AS "operatore_cliente",
    COALESCE(t."state" <> 'nessuno' AND t."closed_at" IS NOT NULL, false) AS "esportabile"
  FROM "mito-deutsche_task" t
  JOIN "mito-deutsche_customers" c ON c."id" = t."customer_id"
  WHERE t."is_active"
)
SELECT
  count(*)::int AS "contatti_attivi",
  (count(*) FILTER (
    WHERE "operatore_cliente" IS NOT NULL
      AND "operatore_contatto" IS DISTINCT FROM "operatore_cliente"
  ))::int AS "a",
  (count(*) FILTER (
    WHERE "operatore_cliente" IS NOT NULL AND "operatore_contatto" IS NULL
  ))::int AS "a2",
  (count(*) FILTER (
    WHERE "operatore_cliente" IS NOT NULL AND "operatore_contatto" IS NULL AND "esportabile"
  ))::int AS "a2_esportabili",
  (count(*) FILTER (
    WHERE "operatore_cliente" IS NULL AND "operatore_contatto" IS NOT NULL
  ))::int AS "b",
  (count(*) FILTER (
    WHERE "operatore_cliente" IS NULL AND "operatore_contatto" IS NULL AND "esportabile"
  ))::int AS "c"
FROM "contatti";

-- 2. (a) by pair of operators and by state: how many contacts the migration
-- moves from which operator to which. An empty "operatore_contatto_id" is a
-- contact with no operator.
SELECT
  t."operator_id" AS "operatore_contatto_id",
  NULLIF(concat_ws(' ', ot."name", ot."surname"), '') AS "operatore_contatto",
  c."operator_id" AS "operatore_cliente_id",
  NULLIF(concat_ws(' ', oc."name", oc."surname"), '') AS "operatore_cliente",
  t."state" AS "stato",
  count(*)::int AS "contatti",
  (count(*) FILTER (
    WHERE COALESCE(t."state" <> 'nessuno' AND t."closed_at" IS NOT NULL, false)
  ))::int AS "esportabili"
FROM "mito-deutsche_task" t
JOIN "mito-deutsche_customers" c ON c."id" = t."customer_id"
LEFT JOIN "mito-deutsche_operator" ot ON ot."id" = t."operator_id"
LEFT JOIN "mito-deutsche_operator" oc ON oc."id" = c."operator_id"
WHERE t."is_active"
  AND c."operator_id" IS NOT NULL
  AND t."operator_id" IS DISTINCT FROM c."operator_id"
GROUP BY t."operator_id", ot."name", ot."surname", c."operator_id", oc."name", oc."surname", t."state"
ORDER BY count(*) DESC, t."operator_id", c."operator_id", t."state";

-- 3. (a) the list: every contact the migration moves, with the log row it
-- will get (from "operatore_contatto_id" to "operatore_cliente_id").
SELECT
  c."id" AS "cliente_id",
  COALESCE(c."fullname", NULLIF(concat_ws(' ', c."name", c."surname"), '')) AS "cliente",
  t."id" AS "contatto_id",
  t."state" AS "stato",
  t."operator_id" AS "operatore_contatto_id",
  NULLIF(concat_ws(' ', ot."name", ot."surname"), '') AS "operatore_contatto",
  c."operator_id" AS "operatore_cliente_id",
  NULLIF(concat_ws(' ', oc."name", oc."surname"), '') AS "operatore_cliente",
  t."closed_at" AS "contattato_il",
  COALESCE(t."state" <> 'nessuno' AND t."closed_at" IS NOT NULL, false) AS "esportabile",
  (t."operator_id" IS NULL) AS "senza_operatore",
  GREATEST(t."updated_at", t."created_at") AS "ultima_modifica"
FROM "mito-deutsche_task" t
JOIN "mito-deutsche_customers" c ON c."id" = t."customer_id"
LEFT JOIN "mito-deutsche_operator" ot ON ot."id" = t."operator_id"
LEFT JOIN "mito-deutsche_operator" oc ON oc."id" = c."operator_id"
WHERE t."is_active"
  AND c."operator_id" IS NOT NULL
  AND t."operator_id" IS DISTINCT FROM c."operator_id"
ORDER BY c."id", t."id";

-- 4. (a2) with exportable calls: the contacts that have no operator today,
-- whose closed calls the export doesn't count, and that the migration gives
-- one. The release stops here if this list isn't empty, until the owner has
-- decided in writing.
SELECT
  c."id" AS "cliente_id",
  COALESCE(c."fullname", NULLIF(concat_ws(' ', c."name", c."surname"), '')) AS "cliente",
  t."id" AS "contatto_id",
  t."state" AS "stato",
  t."closed_at" AS "contattato_il",
  c."operator_id" AS "operatore_cliente_id",
  NULLIF(concat_ws(' ', oc."name", oc."surname"), '') AS "operatore_cliente"
FROM "mito-deutsche_task" t
JOIN "mito-deutsche_customers" c ON c."id" = t."customer_id"
LEFT JOIN "mito-deutsche_operator" oc ON oc."id" = c."operator_id"
WHERE t."is_active"
  AND c."operator_id" IS NOT NULL
  AND t."operator_id" IS NULL
  AND t."state" <> 'nessuno'
  AND t."closed_at" IS NOT NULL
ORDER BY t."closed_at", t."id";

-- 5. (b) the customer has no operator and the active contact has one: the
-- migration leaves them as they are. The release stops here if this list isn't
-- empty, until the owner has decided in writing: either hand the customer over
-- to the contact's operator first, or accept the case as a known exception.
SELECT
  c."id" AS "cliente_id",
  COALESCE(c."fullname", NULLIF(concat_ws(' ', c."name", c."surname"), '')) AS "cliente",
  t."id" AS "contatto_id",
  t."state" AS "stato",
  t."operator_id" AS "operatore_contatto_id",
  NULLIF(concat_ws(' ', ot."name", ot."surname"), '') AS "operatore_contatto",
  t."closed_at" AS "contattato_il",
  COALESCE(t."state" <> 'nessuno' AND t."closed_at" IS NOT NULL, false) AS "esportabile"
FROM "mito-deutsche_task" t
JOIN "mito-deutsche_customers" c ON c."id" = t."customer_id"
LEFT JOIN "mito-deutsche_operator" ot ON ot."id" = t."operator_id"
WHERE t."is_active"
  AND c."operator_id" IS NULL
  AND t."operator_id" IS NOT NULL
ORDER BY c."id", t."id";

-- 6. (c) for information: the customer and the active contact have no
-- operator, and the contact has exportable calls. The migration doesn't touch
-- them, but giving the customer an operator ("Assegna Clienti", "Assegna a te",
-- the handover) gives the contact one, and its calls enter the export (A16).
SELECT
  c."id" AS "cliente_id",
  COALESCE(c."fullname", NULLIF(concat_ws(' ', c."name", c."surname"), '')) AS "cliente",
  t."id" AS "contatto_id",
  t."state" AS "stato",
  t."closed_at" AS "contattato_il"
FROM "mito-deutsche_task" t
JOIN "mito-deutsche_customers" c ON c."id" = t."customer_id"
WHERE t."is_active"
  AND c."operator_id" IS NULL
  AND t."operator_id" IS NULL
  AND t."state" <> 'nessuno'
  AND t."closed_at" IS NOT NULL
ORDER BY t."closed_at", t."id";
