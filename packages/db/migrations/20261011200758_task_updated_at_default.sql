-- task.updated_at defaults to the time of the insert again. The databases in
-- use got the column from a `drizzle-kit push` of a schema that said
-- `.default(new Date())`: their default is the moment of that push, a constant
-- ('2024-11-16 18:35:42.926+01' on the development one). Every snapshot says
-- CURRENT_TIMESTAMP, so `db:generate` never emitted this; customers and
-- practices got theirs in 20260615235953.
--
-- Does nothing where the default is already right.
ALTER TABLE "mito-deutsche_task" ALTER COLUMN "updated_at" SET DEFAULT CURRENT_TIMESTAMP;--> statement-breakpoint
-- The tasks inserted with the constant and not updated since, which are the
-- contacts replaceActiveContact creates without `mostRecent`: they take the
-- time of their insert, what the default would have given them. A task
-- updated before it was created comes only from that default; the day leaves
-- out the ones whose updated_at, the app's clock, is a moment behind
-- created_at, the database's.
UPDATE "mito-deutsche_task"
SET "updated_at" = "created_at"
WHERE "updated_at" < "created_at" - interval '1 day';
