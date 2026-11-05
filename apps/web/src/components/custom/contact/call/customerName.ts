/** "Nome Cognome", the parts that exist: the name the outcomes speak of */
export const customerNameOf = (customer: {
  name?: string | null | undefined
  surname?: string | null | undefined
}) =>
  [customer.name, customer.surname]
    .map((part) => part?.trim() ?? "")
    .filter((part) => part !== "")
    .join(" ") || "Cliente senza nome"
