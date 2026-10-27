import { type RouteObject } from "react-router"
import { Home } from "./routes/Home"
import { RouteError } from "./routes/RouteError"

// The pages for development only (the components of 1.b): out of the
// production bundle, since Vite drops the branch when DEV is false
const devRoutes: RouteObject[] = import.meta.env.DEV
  ? [
      {
        path: "/_dev/ui",
        lazy: async () => ({
          Component: (await import("./routes/dev/UiShowcase")).UiShowcase,
        }),
      },
    ]
  : []

export const routes: RouteObject[] = [
  {
    // A route that fails shows the error and reports it (RouteError)
    errorElement: <RouteError />,
    children: [{ path: "/", element: <Home /> }, ...devRoutes],
  },
]
