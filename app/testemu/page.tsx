"use client"

import { useRouter } from "next/navigation"
import { EmulatorScreen } from "@/components/emulator-screen"

export default function TestEmuPage() {
  const router = useRouter()
  return (
    <EmulatorScreen
      gameId="smb"
      onClose={() => {
        try {
          router.back()
        } catch {
          router.push("/")
        }
      }}
    />
  )
}
