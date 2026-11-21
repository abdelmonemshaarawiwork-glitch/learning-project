import type { ReactNode } from "react";
import { RequireAuth } from "@/components/layout/RequireAuth";

export default function FocusLayout({ children }: { children: ReactNode }) {
  return <RequireAuth>{children}</RequireAuth>;
}
