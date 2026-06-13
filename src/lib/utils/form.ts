export function convertNullToUndefined<T>(value: T | null): T | undefined {
  return value ?? undefined
}

type FormValues = Record<string, unknown>

type InitialValues = Record<string, unknown>

type FormChecker = {
  formValues: FormValues
  initialValues: InitialValues
}

export function checkIfSomeFormValuesHasChange({
  formValues,
  initialValues,
}: FormChecker) {
  return Object.keys(initialValues).some((key) => {
    return (
      converAllTypesToString(formValues[key]) !==
      converAllTypesToString(initialValues[key])
    )
  })
}

export function converAllTypesToString(item: unknown) {
  if (typeof item === "object") {
    return JSON.stringify(item)
  }
  return item
}
