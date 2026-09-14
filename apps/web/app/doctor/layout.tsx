"use client";

import { RequireSection } from "../../lib/RequireSection";

export default function DoctorLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSection
      roles={["HOD", "DOCTOR"]}
      loginPath="/doctor/login"
      exempt={["/doctor/login", "/doctor/register"]}
    >
      {children}
    </RequireSection>
  );
}