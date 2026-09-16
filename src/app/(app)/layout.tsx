import { redirect } from "next/navigation";
import { Nav } from "@/components/nav";
import { isAuthenticated } from "@/lib/session";
import { getLocale } from "@/lib/settings";
import { dict } from "@/i18n";

/** Dashboard shell: navigation + comfortable width. Reading surfaces live in (focus). */
export default async function AppLayout({ children }: { children: React.ReactNode }) {
  if (!(await isAuthenticated())) redirect("/login");
  const locale = await getLocale();
  const d = dict(locale);
  return (
    <>
      <Nav
        labels={{
          today: d["nav.today"],
          plan: d["nav.plan"],
          practice: d["nav.practice"],
          cards: d["nav.cards"],
          stats: d["nav.stats"],
          exam: d["nav.exam"],
          admin: d["nav.admin"],
        }}
      />
      <main className="mx-auto w-full max-w-4xl px-4 pb-28 pt-4 md:pb-10 md:pt-6">{children}</main>
    </>
  );
}
