import { eq } from "drizzle-orm";
import { ProfileForm } from "@/components/ProfileForm";
import { PageHeader } from "@/components/ui";
import { requireUser } from "@/lib/auth";
import { getDb, schema } from "@/lib/db";

export default async function ProfilePage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const user = await requireUser();
  const welcome = (await searchParams).welcome === "1";
  const db = await getDb();
  const [profile] = await db.select().from(schema.profiles).where(eq(schema.profiles.userId, user.id));

  return (
    <>
      <PageHeader
        title={welcome ? "Welcome! Set up your profile" : "Profile"}
        subtitle="Used to score jobs, tailor applications and autofill forms. The more complete it is, the better your matches."
      />
      <ProfileForm
        profile={{
          fullName: profile?.fullName ?? user.name,
          phone: profile?.phone ?? "",
          location: profile?.location ?? "",
          linkedinUrl: profile?.linkedinUrl ?? "",
          githubUrl: profile?.githubUrl ?? "",
          portfolioUrl: profile?.portfolioUrl ?? "",
          university: profile?.university ?? "",
          degree: profile?.degree ?? "",
          graduationYear: profile?.graduationYear ?? null,
          headline: profile?.headline ?? "",
          resumeText: profile?.resumeText ?? "",
          resumeFilename: profile?.resumeFilename ?? null,
          skills: profile?.skills ?? [],
          targetRoles: profile?.targetRoles ?? [],
          preferredLocations: profile?.preferredLocations ?? [],
          remoteOk: profile?.remoteOk ?? true,
          includeSenior: profile?.includeSenior ?? false,
          answers: profile?.answers ?? {},
        }}
      />
    </>
  );
}
