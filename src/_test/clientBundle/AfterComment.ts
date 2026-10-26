/* A comment before the directive, as in TableColumn.tsx */
"use client"
import { getContacts } from "@mito/server/services/contact/getContacts"

export const load = getContacts
