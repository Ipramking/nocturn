export type Severity = "critical" | "high" | "medium" | "low" | "info";

export type CheckId =
  | "uptime"
  | "tls"
  | "headers"
  | "secrets"
  | "meta"
  | "links"
  | "lighthouse";

export type CheckStatus = "pass" | "warn" | "fail" | "error" | "skipped";

export interface Finding {
  id: string;
  check: CheckId;
  severity: Severity;
  title: string;
  detail: string;
  /** Masked or truncated evidence. Never a full secret. */
  evidence?: string;
  /** Plain-English fix, also the fallback for the AI fix prompt. */
  fix: string;
}

export interface CheckResult {
  check: CheckId;
  label: string;
  status: CheckStatus;
  score: number;
  summary: string;
  findings: Finding[];
  metrics?: Record<string, number | string>;
  ms: number;
}

export interface AiNotes {
  headline: string;
  summary: string;
  prompts: Record<string, string>;
  source: "gemini" | "fallback";
}

export interface ShiftReport {
  id: string;
  url: string;
  finalUrl: string;
  startedAt: string;
  finishedAt: string;
  score: number;
  grade: "A" | "B" | "C" | "D" | "F";
  checks: CheckResult[];
  ai?: AiNotes;
}

export type ShiftEvent =
  | { type: "start"; url: string; at: string }
  | { type: "log"; check?: CheckId; line: string; level: "info" | "warn" | "error" }
  | { type: "check"; result: CheckResult }
  | { type: "done"; report: ShiftReport }
  | { type: "error"; message: string };
