import { Nav } from "@/components/Nav";
import { requireUser } from "@/lib/auth";

// "Refresh jobs" and "Add company" run inside these pages' server actions.
export const maxDuration = 300;

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireUser();
  return (
    <>
      <Nav email={user.email} />
      <main className="mx-auto w-full max-w-6xl flex-1 px-4 py-8 sm:px-6">{children}</main>
    </>
  );
}
