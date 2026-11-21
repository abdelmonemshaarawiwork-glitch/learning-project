import { Suspense } from "react";
import { ResetForm } from "@/components/auth/ResetForm";

export const metadata = { title: "Reset password" };

export default function ResetPage() {
  return (
    <Suspense>
      <ResetForm />
    </Suspense>
  );
}
