"use client"
import type { ContactRow } from "@mito/server/services/contact/getContacts"
import { type GetContactByIdResult } from "@mito/server/services/contact/getContactById"

export type Contact = ContactRow | GetContactByIdResult
