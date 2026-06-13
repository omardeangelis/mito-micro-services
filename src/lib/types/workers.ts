export type WorkerGenericState = "loading" | "success" | "error" | "idle"

export type WorkerGenericResponse<T> = [WorkerGenericState, T]
