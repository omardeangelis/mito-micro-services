import { getTableName } from "drizzle-orm"
import { messages } from "@mito/db/schema/chat"
import { customers } from "@mito/db/schema/customers"
import { chatToOperator } from "@mito/db/schema/relations/chatToOperator"
import { alert, task } from "@mito/db/schema/task"
import { taskEventLog } from "@mito/db/schema/taskEventLog"
import { FAILPOINT_SCHEMA, testClient } from "./db"

const name = `${FAILPOINT_SCHEMA}.lock_rule`

/**
 * From now on, every write (insert, update, delete) of a row of `task`,
 * `alert` or `task_event_log` fails with "lock rule: …" unless the current
 * transaction has locked the row's customer, as `lockCustomer` does
 * (`packages/server/src/effect/db.ts`). `resetDb` removes the check.
 *
 * The customer is `customer_id` for `task` and `task_event_log`, the customer
 * of the task in `task_id` for `alert`: the new row for an insert, the old one
 * for a delete, both for an update. A row without a customer (a task with
 * `customer_id` NULL, or an alert on one) has nothing to lock and passes.
 *
 * The customer row counts as locked when its `xmax` is the current transaction
 * id: a `FOR UPDATE` lock this transaction holds, which an update of the row
 * after it keeps on the new version. An update alone doesn't count (its new
 * version has the transaction in `xmin`, not in `xmax`): handover and "Assegna
 * a te" update the customer before writing the log, and a check that accepted
 * it would miss their `lockCustomer` going away, with the read of the customer
 * no longer locked. A write outside a transaction fails too: its statement
 * runs in a transaction of its own, which locked nothing. It needs a single
 * connection with no savepoints, as PGlite and `transaction` run: a lock taken
 * in a subtransaction, or shared with another transaction (a multixact), has
 * another id in `xmax`. Seed the rows before calling it: the factories write
 * without locks.
 */
export async function assertCustomerLockedOnWrite() {
  const customersTable = `"public"."${getTableName(customers)}"`
  const taskTable = `"public"."${getTableName(task)}"`
  await testClient.exec(`
    CREATE SCHEMA IF NOT EXISTS ${FAILPOINT_SCHEMA};
    CREATE FUNCTION ${name}() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      rows_customers varchar[] := ARRAY[]::varchar[];
      locked_id varchar;
      locked boolean;
    BEGIN
      IF TG_TABLE_NAME = '${getTableName(alert)}' THEN
        IF TG_OP <> 'DELETE' THEN
          rows_customers := rows_customers ||
            (SELECT t.customer_id FROM ${taskTable} t WHERE t.id = NEW.task_id);
        END IF;
        IF TG_OP <> 'INSERT' THEN
          rows_customers := rows_customers ||
            (SELECT t.customer_id FROM ${taskTable} t WHERE t.id = OLD.task_id);
        END IF;
      ELSE
        IF TG_OP <> 'DELETE' THEN
          rows_customers := rows_customers || NEW.customer_id;
        END IF;
        IF TG_OP <> 'INSERT' THEN
          rows_customers := rows_customers || OLD.customer_id;
        END IF;
      END IF;

      FOREACH locked_id IN ARRAY rows_customers LOOP
        CONTINUE WHEN locked_id IS NULL;
        SELECT c.xmax = pg_current_xact_id()::xid
          INTO locked
          FROM ${customersTable} c WHERE c.id = locked_id;
        -- A missing customer has no row to lock: its foreign key rejects the write
        IF locked IS FALSE THEN
          RAISE EXCEPTION 'lock rule: customer % not locked by this transaction (% on %)',
            locked_id, TG_OP, TG_TABLE_NAME;
        END IF;
      END LOOP;

      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END $$;
  `)
  for (const table of [task, alert, taskEventLog]) {
    const tableName = getTableName(table)
    await testClient.exec(`
      CREATE TRIGGER "lock_rule_${tableName}"
        BEFORE INSERT OR UPDATE OR DELETE ON "public"."${tableName}"
        FOR EACH ROW EXECUTE FUNCTION ${name}();
    `)
  }
}

const chatName = `${FAILPOINT_SCHEMA}.chat_lock_rule`

/**
 * As `assertCustomerLockedOnWrite`, for a customer's chat: from now on, adding
 * or removing an operator of a chat (`chat_to_operator`) and sending or
 * deleting a note (`messages`) fail with "lock rule: …" unless the current
 * transaction has locked the customer whose `chat_id` is that chat. A chat no
 * customer points to has nothing to lock and passes. Same conditions as
 * `assertCustomerLockedOnWrite`; seed first.
 */
export async function assertCustomerLockedOnChatWrite() {
  const customersTable = `"public"."${getTableName(customers)}"`
  await testClient.exec(`
    CREATE SCHEMA IF NOT EXISTS ${FAILPOINT_SCHEMA};
    CREATE FUNCTION ${chatName}() RETURNS trigger LANGUAGE plpgsql AS $$
    DECLARE
      row_chat integer;
      locked boolean;
    BEGIN
      IF TG_OP = 'DELETE' THEN
        row_chat := OLD.chat_id;
      ELSE
        row_chat := NEW.chat_id;
      END IF;
      SELECT c.xmax = pg_current_xact_id()::xid
        INTO locked
        FROM ${customersTable} c WHERE c.chat_id = row_chat;
      IF locked IS FALSE THEN
        RAISE EXCEPTION 'lock rule: customer of chat % not locked by this transaction (% on %)',
          row_chat, TG_OP, TG_TABLE_NAME;
      END IF;
      IF TG_OP = 'DELETE' THEN
        RETURN OLD;
      END IF;
      RETURN NEW;
    END $$;
    CREATE TRIGGER "chat_lock_rule_chat_to_operator"
      BEFORE INSERT OR UPDATE OR DELETE ON "public"."${getTableName(chatToOperator)}"
      FOR EACH ROW EXECUTE FUNCTION ${chatName}();
    CREATE TRIGGER "chat_lock_rule_messages"
      BEFORE INSERT OR DELETE ON "public"."${getTableName(messages)}"
      FOR EACH ROW EXECUTE FUNCTION ${chatName}();
  `)
}
