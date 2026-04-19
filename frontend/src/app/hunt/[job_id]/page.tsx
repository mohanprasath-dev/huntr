import HuntDashboard from "@/components/HuntDashboard";
import {
  getCampaignByJobId,
  getJobLeads,
  getJobStatus,
  isApiRequestError,
} from "@/lib/huntr-api";
import type { CampaignDetail, JobImpact, JobStatusResponse, Lead } from "@/lib/huntr-types";

interface HuntPageProps {
  params: Promise<{
    job_id: string;
  }>;
}

interface InitialDashboardData {
  initialLeads: Lead[];
  initialImpact: JobImpact | null;
  initialStatus: JobStatusResponse | null;
  disablePolling: boolean;
}

function isTerminalStatus(status: string): boolean {
  const normalized = status.toLowerCase();
  return normalized === "completed" || normalized === "failed";
}

function buildStatusFromCampaign(jobId: string, campaign: CampaignDetail): JobStatusResponse {
  const leads = Array.isArray(campaign.leads) ? campaign.leads : [];
  const leadsQualified = Number(campaign.impact?.leads_qualified ?? campaign.leads_count ?? leads.length);
  const leadsFound = Number(campaign.impact?.leads_found ?? campaign.leads_count ?? leadsQualified);
  const stepCount = Array.isArray(campaign.trace?.events) ? campaign.trace.events.length : 0;

  return {
    job_id: jobId,
    status: String(campaign.status || "completed"),
    current_agent: "manager",
    leads_found: Number.isFinite(leadsFound) ? leadsFound : leads.length,
    leads_scored: Number.isFinite(leadsQualified) ? leadsQualified : leads.length,
    steps_completed: stepCount,
  };
}

async function getInitialDashboardData(jobId: string): Promise<InitialDashboardData> {
  try {
    const campaign = await getCampaignByJobId(jobId);
    const status = buildStatusFromCampaign(jobId, campaign);
    return {
      initialLeads: Array.isArray(campaign.leads) ? campaign.leads : [],
      initialImpact: campaign.impact ?? null,
      initialStatus: status,
      disablePolling: isTerminalStatus(String(status.status)),
    };
  } catch (error) {
    if (isApiRequestError(error) && error.status !== 404) {
      // Continue with in-memory fallback when Firestore lookup fails.
    }
  }

  let initialLeads: Lead[] = [];
  let initialImpact: JobImpact | null = null;
  let initialStatus: JobStatusResponse | null = null;

  try {
    const leadsResponse = await getJobLeads(jobId);
    initialLeads = Array.isArray(leadsResponse.leads) ? leadsResponse.leads : [];
    initialImpact = leadsResponse.impact ?? null;
  } catch {
    // Handled below by client-side polling.
  }

  try {
    initialStatus = await getJobStatus(jobId);
  } catch {
    // Allow dashboard polling to resolve when status endpoint is eventually available.
  }

  if (!initialStatus && (initialLeads.length > 0 || initialImpact)) {
    initialStatus = {
      job_id: jobId,
      status: "running",
      current_agent: "manager",
      leads_found: Number(initialImpact?.leads_found ?? initialLeads.length),
      leads_scored: Number(initialImpact?.leads_qualified ?? initialLeads.length),
      steps_completed: 0,
    };
  }

  return {
    initialLeads,
    initialImpact,
    initialStatus,
    disablePolling: false,
  };
}

export default async function HuntPage({ params }: HuntPageProps) {
  const { job_id: jobId } = await params;
  const initialData = await getInitialDashboardData(jobId);

  return (
    <HuntDashboard
      jobId={jobId}
      initialLeads={initialData.initialLeads}
      initialImpact={initialData.initialImpact}
      initialStatus={initialData.initialStatus}
      disablePolling={initialData.disablePolling}
    />
  );
}
