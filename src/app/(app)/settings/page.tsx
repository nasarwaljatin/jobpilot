import { headers } from "next/headers";
import { eq } from "drizzle-orm";
import { regenerateApiToken } from "@/app/actions";
import { ActionButton } from "@/components/forms";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export default async function SettingsPage() {
  const user = await requireUser();
  const db = await getDb();
  const [row] = await db.select({ apiToken: schema.users.apiToken }).from(schema.users).where(eq(schema.users.id, user.id));
  const h = await headers();
  const origin = `${h.get("x-forwarded-proto") ?? "http"}://${h.get("host")}`;

  return (
    <>
      <PageHeader title="Chrome extension" subtitle="Autofill application forms with your profile and resume. You always review and submit yourself." />

      <section className="card space-y-4 p-5">
        <h2 className="font-semibold">1. Install</h2>
        <ol className="list-decimal space-y-1 pl-5 text-sm">
          <li>Download or clone this project and find the <code className="font-mono">extension/</code> folder.</li>
          <li>Open <code className="font-mono">chrome://extensions</code> and turn on <b>Developer mode</b>.</li>
          <li>Click <b>Load unpacked</b> and select the <code className="font-mono">extension/</code> folder.</li>
        </ol>

        <h2 className="pt-2 font-semibold">2. Connect</h2>
        <p className="text-sm">Open the extension popup and paste these two values:</p>
        <div className="grid gap-3 sm:grid-cols-2">
          <div>
            <p className="label">Server URL</p>
            <code className="block truncate rounded-lg bg-background p-2.5 font-mono text-sm">{origin}</code>
          </div>
          <div>
            <p className="label">API token</p>
            <code className="block truncate rounded-lg bg-background p-2.5 font-mono text-sm">
              {row?.apiToken ?? "Generate a token below"}
            </code>
          </div>
        </div>
        <ActionButton action={regenerateApiToken}>{row?.apiToken ? "Regenerate token" : "Generate token"}</ActionButton>
        <p className="hint">Regenerating disconnects any browser that uses the old token. Keep the token private: it can read your profile.</p>

        <h2 className="pt-2 font-semibold">3. Use</h2>
        <p className="text-sm">
          Open any application form on Greenhouse, Lever, Ashby, Workday or a company site, then click the extension and press
          <b> Autofill</b>. Filled fields are highlighted. Check them, answer anything left blank, then submit. Press <b>Mark applied</b> to
          add the job to your tracker.
        </p>
      </section>
    </>
  );
}
