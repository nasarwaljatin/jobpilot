"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { logout } from "@/app/actions";

const LINKS = [
  ["/dashboard", "Dashboard"],
  ["/jobs", "Jobs"],
  ["/applications", "Applications"],
  ["/companies", "Companies"],
  ["/profile", "Profile"],
  ["/settings", "Extension"],
] as const;

export function Nav({ email }: { email: string }) {
  const path = usePathname();
  return (
    <header className="sticky top-0 z-10 border-b border-border bg-surface/90 backdrop-blur">
      <div className="mx-auto flex max-w-6xl items-center gap-4 px-4 sm:px-6">
        <Link href="/dashboard" className="py-3 font-semibold tracking-tight">JobPilot</Link>
        <nav className="flex flex-1 gap-1 overflow-x-auto">
          {LINKS.map(([href, label]) => {
            const active = path === href || path.startsWith(`${href}/`);
            return (
              <Link
                key={href}
                href={href}
                className={`whitespace-nowrap rounded-md px-3 py-1.5 text-sm ${
                  active ? "bg-accent-soft font-medium text-accent" : "text-muted hover:text-foreground"
                }`}
              >
                {label}
              </Link>
            );
          })}
        </nav>
        <form action={logout} className="hidden items-center gap-3 sm:flex">
          <span className="max-w-48 truncate text-xs text-muted">{email}</span>
          <button className="btn btn-sm">Log out</button>
        </form>
      </div>
    </header>
  );
}
