"use client";

import { useEffect, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth } from "./auth";
import type { Role } from "./api";

function dashboardFor(role: Role): string {
  switch (role) {
    case "TOP_ADMIN":
      return "/admin/dashboard";
    case "HOSPITAL_ADMIN":
    case "STAFF":
      return "/hospital/dashboard";
    case "HOD":
    case "DOCTOR":
      return "/doctor/dashboard";
    default:
      return "/patient/dashboard";
  }
}

export function RequireSection({
  roles,
  loginPath,
  exempt,
  children,
}: {
  roles: Role[];
  loginPath: string;
  exempt: string[];
  children: ReactNode;
}) {
  const pathname = usePathname();
  const { user } = useAuth();
  const router = useRouter();

  const exemptPage = exempt.includes(pathname);
  const allowed = !!user && roles.includes(user.role);

  useEffect(() => {
    if (exemptPage) return;
    if (!user) {
      router.replace(loginPath);
    } else if (!allowed) {
      router.replace(dashboardFor(user.role));
    }
  }, [exemptPage, user, allowed, loginPath, router]);

  if (exemptPage || allowed) return <>{children}</>;
  return null;
}