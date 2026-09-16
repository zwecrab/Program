import { redirect } from "next/navigation";
import { isAuthenticated } from "@/lib/session";

/** Single-focus reading surface: one question, no chrome, no competing navigation. */
export default async function FocusLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");
  return <main className="mx-auto w-full max-w-3xl px-4 pb-16 pt-3 md:pt-6">{children}</main>;
}
