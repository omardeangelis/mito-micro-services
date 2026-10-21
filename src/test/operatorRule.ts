import { getTableName } from "drizzle-orm"
import { customers } from "@mito/db/schema/customers"
import { task } from "@mito/db/schema/task"
import { FAILPOINT_SCHEMA, testClient } from "./db"

const name = `${FAILPOINT_SCHEMA}.operator_rule`

/**
 * The "same operator" rule (D26, D27): today a customer and its active contact
 * belong to the same operator. Nothing in the database enforces it, in
 * production there is no trigger and no constraint for it: the guarantee is the
 * code of the writers and the test that runs each of them with this check on,
 * `src/server/services/contact/_test/operatorRule.db.test.ts`. A new writer of
 * operators (of a customer or of a contact) is covered only if it adds its call
 * there. The day a customer has a manager (an admin) other than whoever
 * contacts them (the operators), this is the one rule to change.
 *
 * From now on, every transaction that inserts or updates a row of `task` or
 * `customers` fails at COMMIT with "operator rule: …", naming the customer and
 * both operators, when a customer it touched has an active contact
 * (`task.is_active`) whose `operator_id` differs from the customer's. The
 * customers touched are `customer_id` of the task rows (none when NULL) and
 * `id` of the customer rows; deleted rows are not checked. Two NULL operators
 * are the same operator; an inactive contact, or a customer without an active
 * contact, never fails. `resetDb` removes the check.
 *
 * The trigger is deferred to the COMMIT, so it reads the state the transaction
 * leaves: two writes that move the contact and then the customer pass, and a
 * write outside a transaction is checked at the end of its statement. It is
 * off unless a test calls this, because many tests seed customers and contacts
 * on different operators on purpose; seed the rows before calling it.
 */
export async function assertContactOperatorMatchesCustomer() {
  const customersTable = `"public"."${getTableName(customers)}"`
  const taskTable = `"public"."${getTableName(task)}"`
  await testClient.exec(`
    CREATE SCHEMA IF NOT EXISTS ${FAILPOINT_SCHEMA};
    CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      touched varchar;
      customer_operator integer;
      contact_id integer;
      contact_operator integer;
    BEGIN
      IF TG_TABLE_NAME = '${getTableName(task)}' THEN
        touched := NEW.customer_id;
      ELSE
        touched := NEW.id;
      END IF;
      IF touched IS NULL THEN
        RETURN NULL;
      END IF;

      -- The rows as the transaction leaves them, not the ones of the event
      SELECT c.operator_id, t.id, t.operator_id
        INTO customer_operator, contact_id, contact_operator
        FROM ${customersTable} c
        JOIN ${taskTable} t ON t.customer_id = c.id AND t.is_active
        WHERE c.id = touched
          AND t.operator_id IS DISTINCT FROM c.operator_id
        LIMIT 1;
      IF FOUND THEN
        RAISE EXCEPTION 'operator rule: customer % is on operator %, its active contact (task %) on operator % (% on %)',
          touched, customer_operator, contact_id, contact_operator, TG_OP, TG_TABLE_NAME;
      END IF;
      RETURN NULL;
    END $$;
  `)
  for (const table of [task, customers]) {
    const tableName = getTableName(table)
    await testClient.exec(`
      CREATE CONSTRAINT TRIGGER "operator_rule_${tableName}"
        AFTER INSERT OR UPDATE ON "public"."${tableName}"
        DEFERRABLE INITIALLY DEFERRED
        FOR EACH ROW EXECUTE FUNCTION ${name}();
    `)
  }
}
