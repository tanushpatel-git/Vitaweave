"use client";

import { RequireSection } from "../../lib/RequireSection";

export default function HospitalLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSection
      roles={["HOSPITAL_ADMIN", "STAFF"]}
      loginPath="/hospital/login"
      exempt={["/hospital/login", "/hospital/register"]}
    >
      {children}
    </RequireSection>
  );
}