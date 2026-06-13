import { api } from "@/trpc/server"
import React from "react"
import { ProfileForm } from "./ProfileForm"
import { LogoutFloatingButton } from "./LogoutFloatingButton"

export const ProfilePage = async () => {
  const operator = await api.operator.getUserPublicOperator.query()

  return (
    <div className="dashboard-layout">
      <div className="dashboard-content">
        <div>
          <h1 className="text-lg font-medium">Aggiorna le tue informazioni</h1>
          <ProfileForm operator={operator!} />
        </div>
      </div>
      <LogoutFloatingButton />
    </div>
  )
}
