"use client";

import { RequireSection } from "../../lib/RequireSection";

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return (
    <RequireSection roles={["TOP_ADMIN"]} loginPath="/admin/login" exempt={["/admin/login"]}>
      {children}
    </RequireSection>
  );
}