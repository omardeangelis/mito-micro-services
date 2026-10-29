import { Navigate, type RouteObject } from "react-router"
import { AppLoading } from "./routes/AppLoading"
import { ContactsError } from "./routes/dashboard/contatti/ContactsError"
import { DashboardShell } from "./routes/dashboard/DashboardShell"
import { RequireSession } from "./routes/dashboard/RequireSession"
import { NotFound } from "./routes/NotFound"
import { RouteError } from "./routes/RouteError"
import { StartPage } from "./routes/StartPage"

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
      {
        path: "/",
        element: (
          <RequireSession>
            <StartPage />
          </RequireSession>
        ),
      },
      { path: "/login", lazy: () => import("./routes/login/LoginPage") },
      {
        path: "/dashboard",
        element: <DashboardShell />,
        children: [
          {
            index: true,
            lazy: () => import("./routes/dashboard/home/HomePage"),
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
            // Where the server sends a new user, and the old tabs
            path: "profile",
            lazy: () =>
              import("./routes/dashboard/settings/LegacyProfileRedirect"),
          },
          {
            path: "settings",
            children: [
              {
                index: true,
                element: <Navigate to="profile" replace />,
              },
              {
                path: "profile",
                lazy: () => import("./routes/dashboard/settings/ProfilePage"),
              },
              {
                path: "team",
                lazy: () => import("./routes/dashboard/settings/TeamPage"),
              },
              {
                path: "team/:id",
                lazy: () => import("./routes/dashboard/settings/MemberPage"),
              },
              {
                path: "blacklist",
                lazy: () => import("./routes/dashboard/settings/BlacklistPage"),
              },
            ],
          },
        ],
      },
      ...devRoutes,
      { path: "*", element: <NotFound /> },
    ],
  },
]
