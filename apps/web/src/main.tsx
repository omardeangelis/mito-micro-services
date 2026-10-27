import "@fontsource-variable/inter"
import "./styles/globals.css"
import "./env"

import { StrictMode } from "react"
import { createRoot } from "react-dom/client"
import { createBrowserRouter, RouterProvider } from "react-router"
import { Toaster } from "@/components/ui/toaster"
import { routes } from "./router"

const root = document.getElementById("root")
if (root === null) throw new Error("index.html has no #root")

createRoot(root).render(
  <StrictMode>
    <RouterProvider router={createBrowserRouter(routes)} />
    <Toaster />
  </StrictMode>
)
