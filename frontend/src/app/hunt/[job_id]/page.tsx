import { redirect } from "next/navigation";

interface LegacyHuntPageProps {
  params: Promise<{
    job_id: string;
  }>;
}

export default async function LegacyHuntPage({ params }: LegacyHuntPageProps) {
  const { job_id: jobId } = await params;
  redirect(`/app/hunt/${encodeURIComponent(jobId)}`);
}
