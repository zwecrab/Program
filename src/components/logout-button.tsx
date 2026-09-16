"use client";

import { useRouter } from "next/navigation";
import { Button } from "@/components/ui";

export function LogoutButton() {
  const router = useRouter();
  return (
    <Button
      variant="secondary"
      onClick={async () => {
        await fetch("/api/auth/login", { method: "DELETE" });
        router.replace("/login");
        router.refresh();
      }}
    >
      Sign out
    </Button>
  );
}
