import { pgTableCreator, text, timestamp } from "drizzle-orm/pg-core"

const createTable = pgTableCreator((name) => `mito-deutsche_${name}`)

// Istanti in cui una regola dell'app è entrata in uso, scritti dalle
// migrazioni: `calls_registry` separa le chiamate lette dal vecchio log dei
// cambi di stato da quelle del registro (action = 'call')
export const appMilestone = createTable("app_milestone", {
  name: text("name").primaryKey(),
  at: timestamp("at", { withTimezone: true }).notNull(),
})
