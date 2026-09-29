-- What the PR2 migrations change, listed before they run (read only).
--
-- Three independent SELECTs, one per list. In the Supabase SQL editor run one
-- at a time (select it, then Run) and export the result: run right before the
-- migration, the exports are the cleanup's trace and the lists that undo it
-- (runbook G2, step 5). Nothing here writes.
--
-- The contact that stays active is the one the UI shows today: the most
-- recent by GREATEST(updated_at, created_at), then by the higher id. The
-- migrations use the same rule.

-- (a) Customers with more than one active contact: the one that stays active
-- and the ones the cleanup deactivates (contatti_cleanup, step 1). Contacts
-- without a customer are not touched.
WITH ranked AS (
  SELECT
    "id",
    "customer_id",
    row_number() OVER (
      PARTITION BY "customer_id"
      ORDER BY GREATEST("updated_at", "created_at") DESC, "id" DESC
    ) AS "rank",
    count(*) OVER (PARTITION BY "customer_id") AS "active"
  FROM "mito-deutsche_task"
  WHERE "is_active" AND "customer_id" IS NOT NULL
)
SELECT
  c."id" AS "cliente_id",
  COALESCE(c."fullname", NULLIF(concat_ws(' ', c."name", c."surname"), '')) AS "cliente",
  CASE WHEN r."rank" = 1 THEN 'resta attivo' ELSE 'disattivato' END AS "esito",
  t."id" AS "contatto_id",
  t."state" AS "stato",
  t."operator_id" AS "operatore_id",
  NULLIF(concat_ws(' ', o."name", o."surname"), '') AS "operatore",
  t."closed_at" AS "contattato_il",
  GREATEST(t."updated_at", t."created_at") AS "ultima_modifica"
FROM ranked r
JOIN "mito-deutsche_task" t ON t."id" = r."id"
JOIN "mito-deutsche_customers" c ON c."id" = r."customer_id"
LEFT JOIN "mito-deutsche_operator" o ON o."id" = t."operator_id"
WHERE r."active" > 1
ORDER BY c."id", r."rank";

-- (b) Every open alert the cleanup closes as resolved by the system operator
-- (contatti_cleanup, step 2): on the contacts step 1 deactivates, on contacts
-- already inactive, and on contacts without a customer, active ones too (the
-- alert cron fails on these at every run).
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "customer_id"
      ORDER BY GREATEST("updated_at", "created_at") DESC, "id" DESC
    ) AS "rank"
  FROM "mito-deutsche_task"
  WHERE "is_active" AND "customer_id" IS NOT NULL
)
SELECT
  a."id" AS "alert_id",
  CASE
    WHEN t."customer_id" IS NULL THEN 'contatto senza cliente'
    WHEN NOT t."is_active" THEN 'contatto non attivo'
    ELSE 'contatto disattivato dalla pulizia'
  END AS "motivo",
  c."id" AS "cliente_id",
  COALESCE(c."fullname", NULLIF(concat_ws(' ', c."name", c."surname"), '')) AS "cliente",
  t."id" AS "contatto_id",
  a."deadline" AS "scadenza",
  a."message" AS "messaggio",
  t."operator_id" AS "operatore_id",
  NULLIF(concat_ws(' ', o."name", o."surname"), '') AS "operatore"
FROM "mito-deutsche_alert" a
JOIN "mito-deutsche_task" t ON t."id" = a."task_id"
LEFT JOIN ranked r ON r."id" = t."id"
LEFT JOIN "mito-deutsche_customers" c ON c."id" = t."customer_id"
LEFT JOIN "mito-deutsche_operator" o ON o."id" = t."operator_id"
WHERE NOT a."is_resolved"
  AND (t."customer_id" IS NULL OR NOT t."is_active" OR r."rank" > 1)
ORDER BY a."deadline", a."id";

-- (c) Tasks the realignment moves to their customer's operator
-- (contatti_operator_realign), by current operator and customer's operator.
-- Active and inactive as after the cleanup: the duplicates it deactivates
-- count as inactive. Tasks without a customer, or whose customer has no
-- operator, keep theirs.
WITH ranked AS (
  SELECT
    "id",
    row_number() OVER (
      PARTITION BY "customer_id"
      ORDER BY GREATEST("updated_at", "created_at") DESC, "id" DESC
    ) AS "rank"
  FROM "mito-deutsche_task"
  WHERE "is_active" AND "customer_id" IS NOT NULL
)
SELECT
  t."operator_id" AS "operatore_attuale_id",
  NULLIF(concat_ws(' ', ot."name", ot."surname"), '') AS "operatore_attuale",
  c."operator_id" AS "operatore_cliente_id",
  NULLIF(concat_ws(' ', oc."name", oc."surname"), '') AS "operatore_cliente",
  (count(*) FILTER (WHERE r."rank" = 1))::int AS "attive",
  (count(*) FILTER (WHERE r."rank" IS DISTINCT FROM 1))::int AS "non_attive"
FROM "mito-deutsche_task" t
JOIN "mito-deutsche_customers" c ON c."id" = t."customer_id"
LEFT JOIN ranked r ON r."id" = t."id"
LEFT JOIN "mito-deutsche_operator" ot ON ot."id" = t."operator_id"
LEFT JOIN "mito-deutsche_operator" oc ON oc."id" = c."operator_id"
WHERE c."operator_id" IS NOT NULL
  AND t."operator_id" IS DISTINCT FROM c."operator_id"
GROUP BY t."operator_id", ot."name", ot."surname", c."operator_id", oc."name", oc."surname"
ORDER BY count(*) DESC, t."operator_id", c."operator_id";
