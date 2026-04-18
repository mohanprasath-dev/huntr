import HuntDashboard from "@/components/HuntDashboard";

interface HuntPageProps {
  params: Promise<{
    job_id: string;
  }>;
}

export default async function HuntPage({ params }: HuntPageProps) {
  const { job_id: jobId } = await params;

  return <HuntDashboard jobId={jobId} />;
}
