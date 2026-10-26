"use server"
import { getContacts } from "@mito/server/services/contact/getContacts"

export const loadContacts = async () => getContacts
