"use client"

import React, { useState } from "react"
import { checkIfSomeFormValuesHasChange } from "../utils/form"

type FormValues = Record<string, unknown>

type InitialValues = Record<string, unknown>

type FormChecker = {
  formValues: FormValues
  initialValues: InitialValues
}

export const useCheckFormHasChanged = ({
  initialValues,
  formValues,
}: FormChecker) => {
  const [hasChanged, setHasChanged] = useState(false)

  React.useEffect(() => {
    const t = checkIfSomeFormValuesHasChange({
      initialValues,
      formValues,
    })
    setHasChanged(t)
  }, [initialValues, formValues])
  return hasChanged
}
