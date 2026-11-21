import { Suspense } from "react";
import { SignupForm } from "@/components/auth/SignupForm";

export const metadata = { title: "Create account" };

export default function SignupPage() {
  return (
    <Suspense>
      <SignupForm />
    </Suspense>
  );
}
