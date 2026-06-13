"use client"
import { useCallback, useEffect } from "react"
import { useToast } from "@/components/ui/use-toast"

type IssueManagerWithMessageAndError = {
  message: string
  error?: string
  issues?: string[]
}

export function useFormIssueManager(
  formState: IssueManagerWithMessageAndError
) {
  const { toast } = useToast()

  useEffect(() => {
    if (formState.message) {
      toast({
        title: formState.message,
        variant: "success",
        duration: 1000,
      })
      formState.message = ""
    }
    if (formState.error) {
      toast({
        title: formState.error,
        variant: "destructive",
        duration: 1000,
      })
      formState.error = ""
    }
  }, [formState, toast])

  return { issues: formState.issues }
}

export const useManualFormIssueManager = (
  formState: IssueManagerWithMessageAndError
) => {
  const { toast } = useToast()

  const manageIssues = useCallback(() => {
    if (formState.message) {
      toast({
        title: formState.message,
        variant: "success",
        duration: 1000,
      })
      formState.message = ""
    }
    if (formState.error) {
      toast({
        title: formState.error,
        variant: "destructive",
        duration: 1000,
      })
      formState.error = ""
    }

    return { issues: formState.issues }
  }, [formState, toast])

  return { manageIssues }
}
