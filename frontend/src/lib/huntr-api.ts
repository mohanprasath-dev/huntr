import type {
  HuntRequestPayload,
  HuntStartResponse,
  JobLeadsResponse,
  JobStatusResponse,
  SendLeadRequest,
  SendLeadResponse,
} from "@/lib/huntr-types";

const DEFAULT_API_BASE_URL = "http://localhost:8000";

export const HUNTR_API_BASE_URL =
  process.env.NEXT_PUBLIC_HUNTR_API_BASE_URL?.replace(/\/$/, "") ?? DEFAULT_API_BASE_URL;

function buildUrl(path: string): string {
  const safePath = path.startsWith("/") ? path : `/${path}`;
  return `${HUNTR_API_BASE_URL}${safePath}`;
}

async function parseError(response: Response): Promise<string> {
  try {
    const payload = (await response.json()) as { detail?: unknown; message?: unknown };
    if (typeof payload.detail === "string" && payload.detail.trim()) {
      return payload.detail;
    }
    if (typeof payload.message === "string" && payload.message.trim()) {
      return payload.message;
    }
  } catch {
    // Ignore non-JSON error payloads.
  }

  return `${response.status} ${response.statusText}`.trim();
}

async function requestJson<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(buildUrl(path), {
    ...init,
    cache: "no-store",
    headers: {
      ...(init?.body ? { "Content-Type": "application/json" } : {}),
      ...(init?.headers ?? {}),
    },
  });

  if (!response.ok) {
    const detail = await parseError(response);
    throw new Error(`API request failed: ${detail}`);
  }

  return (await response.json()) as T;
}

export function getStreamUrl(jobId: string): string {
  return buildUrl(`/stream/${jobId}`);
}

export async function startHunt(payload: HuntRequestPayload): Promise<HuntStartResponse> {
  return requestJson<HuntStartResponse>("/hunt", {
    method: "POST",
    body: JSON.stringify(payload),
  });
}

export async function getJobStatus(jobId: string): Promise<JobStatusResponse> {
  return requestJson<JobStatusResponse>(`/status/${jobId}`);
}

export async function getJobLeads(jobId: string): Promise<JobLeadsResponse> {
  return requestJson<JobLeadsResponse>(`/leads/${jobId}`);
}

export async function sendLead(
  jobId: string,
  leadId: number,
  payload: SendLeadRequest,
): Promise<SendLeadResponse> {
  return requestJson<SendLeadResponse>(`/send/${jobId}/${leadId}`, {
    method: "POST",
    body: JSON.stringify(payload),
  });
}
