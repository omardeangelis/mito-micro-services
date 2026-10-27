import { Navigate, type RouteObject } from "react-router"
import { AppLoading } from "./routes/AppLoading"
import { ContactsError } from "./routes/dashboard/contatti/ContactsError"
import { DashboardShell } from "./routes/dashboard/DashboardShell"
import { NotFound } from "./routes/NotFound"
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

// The routes of §5 of brain/chore/migrazione-frontend-react.md. Each page is
// a module of its own (`lazy`, which takes its `Component`), so the bundle
// of a page loads when the page opens
export const routes: RouteObject[] = [
  {
    // A route that fails shows the error and reports it (RouteError)
    errorElement: <RouteError />,
    hydrateFallbackElement: <AppLoading />,
    children: [
      { path: "/", element: <Navigate to="/dashboard" replace /> },
      {
        path: "/dashboard",
        element: <DashboardShell />,
        children: [
          {
            index: true,
            lazy: () => import("./routes/dashboard/DashboardHome"),
          },
          {
            path: "customers",
            children: [
              {
                index: true,
                lazy: () =>
                  import("./routes/dashboard/customers/CustomersPage"),
              },
              {
                path: "new",
                lazy: () =>
                  import("./routes/dashboard/customers/NewCustomerPage"),
              },
              {
                path: ":id",
                lazy: () => import("./routes/dashboard/customers/CustomerPage"),
              },
              {
                path: ":id/connect",
                lazy: () =>
                  import("./routes/dashboard/customers/ConnectCustomerPage"),
              },
            ],
          },
          {
            path: "contatti",
            // As contatti/error.tsx: a failure stays in the page
            errorElement: <ContactsError />,
            children: [
              {
                index: true,
                lazy: () => import("./routes/dashboard/contatti/ContactsPage"),
              },
              {
                path: ":id",
                lazy: () => import("./routes/dashboard/contatti/ContactPage"),
              },
            ],
          },
          {
            path: "pratiche",
            children: [
              {
                index: true,
                lazy: () => import("./routes/dashboard/pratiche/PracticesPage"),
              },
              {
                path: ":id",
                lazy: () => import("./routes/dashboard/pratiche/PracticePage"),
              },
            ],
          },
          {
            path: "import",
            lazy: () => import("./routes/dashboard/import/ImportPage"),
          },
          {
            path: "profile",
            lazy: () => import("./routes/dashboard/profile/ProfilePage"),
          },
        ],
      },
      ...devRoutes,
      { path: "*", element: <NotFound /> },
    ],
  },
]
