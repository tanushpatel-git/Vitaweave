"use client";

import { RequireSection } from "../../lib/RequireSection";

export default function PatientLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSection
      roles={["PATIENT"]}
      loginPath="/patient/login"
      exempt={["/patient/login", "/patient/register", "/patient"]}
    >
      {children}
    </RequireSection>
  );
}