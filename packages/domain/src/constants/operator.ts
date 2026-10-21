// Operatore sintetico usato per le azioni automatiche (cron, job di sistema).
// Non ha una riga in `users`: non può autenticarsi e resta invisibile nelle
// dropdown di assegnazione operatore (che joinano sempre `operators` con `users`).
export const SYSTEM_OPERATOR_USER_ID = "system"
