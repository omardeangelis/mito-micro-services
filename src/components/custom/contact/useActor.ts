"use client"

import { type Actor } from "@mito/domain/contact/permissions"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"

/** The signed-in user as the permission rules see them, or null until known. */
export const useActor = (): Actor | null => {
  const { role, operatorId } = useUserPreferenceContext((state) => state)
  return role !== undefined && operatorId !== undefined
    ? { role, operatorId }
    : null
}
