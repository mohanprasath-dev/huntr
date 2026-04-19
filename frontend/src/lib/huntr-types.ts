export type JobStatus = "started" | "running" | "completed" | "failed" | "unknown";

export type AgentId =
  | "manager"
  | "scout"
  | "researcher"
  | "scorer"
  | "outreach"
  | "followup"
  | "sender";

export interface HuntRequestPayload {
  niche: string;
  pain_keyword: string;
  sender_name: string;
  sender_company: string;
  sender_service: string;
}

export interface HuntStartResponse {
  job_id: string;
  status: string;
}

export interface DemoSelfCorrectRequestPayload {
  sender_name: string;
  sender_company: string;
  sender_service: string;
}

export interface DemoSelfCorrectResponse {
  job_id: string;
  status: string;
  demo_mode: boolean;
}

export interface JobStatusResponse {
  job_id: string;
  status: JobStatus | string;
  current_agent: AgentId | string;
  leads_found: number;
  leads_scored: number;
  steps_completed: number;
}

export interface FollowupItem {
  day: number;
  subject?: string;
  message: string;
  type?: string;
}

export interface Lead {
  company: string;
  score: number;
  decision_maker: string;
  company_size?: string;
  companySize?: string;
  size?: string;
  org_size?: string;
  company_profile?: {
    size?: string;
  };
  decision_maker_title?: string;
  decisionMakerTitle?: string;
  pain_point?: string;
  painPoint?: string;
  source?: string;
  email_draft: {
    subject: string;
    body: string;
  };
  linkedin_draft: string;
  followup_sequence: FollowupItem[];
}

export interface JobLeadsResponse {
  job_id: string;
  leads: Lead[];
}

export interface StreamEvent {
  agent: AgentId | string;
  action: string;
  result_summary: string;
  timestamp: string;
}

export interface SendLeadRequest {
  approved: boolean;
  to_email?: string;
  from_name?: string;
  from_email?: string;
}

export interface SendLeadResponse {
  job_id: string;
  lead_id: number;
  status: string;
  provider: string;
  recipient: string;
  delivery_status?: string | null;
  detail?: string | null;
}
