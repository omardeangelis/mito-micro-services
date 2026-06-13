import { useToast } from "@/components/ui/use-toast"
import { useUserPreferenceContext } from "@/store/context/useUserPreferenceContext"
import { useCallback } from "react"

type SuccessValidation<T> = [true, null, T]

type ErrorValidation = [false, () => void, null]

type Validation<T> = SuccessValidation<T> | ErrorValidation

export const useOperatorPermission = (operatorID: string | number) => {
  const { role, operatorId } = useUserPreferenceContext((state) => state)
  const { toast } = useToast()

  const createErrorToast = useCallback(() => {
    toast({
      title: "Operazione non consentita",
      description:
        "Puoi modificare solo i customers o pratice che ti sono assegnati.",
      variant: "destructive",
      duration: 3000,
    })
  }, [toast])
  const permissionChecker = useCallback(
    <T>(cb: T): Validation<T> => {
      if (role === "ADMIN" || Number(operatorId) === Number(operatorID)) {
        return [true, null, cb]
      }

      return [false, createErrorToast, null]
    },
    [role, operatorId, operatorID, createErrorToast]
  )

  return permissionChecker
}
