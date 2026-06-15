"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Self-service hotel registration is removed in the single-hotel deployment.
// This route now just bounces to the staff login.
export default function SignupPage() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/login");
  }, [router]);

  return (
    <div className="min-h-dvh flex items-center justify-center p-6">
      <p className="eyebrow">Redirecting to staff login…</p>
    </div>
  );
}
