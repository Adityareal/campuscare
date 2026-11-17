import type { AlertStatus, CaseSource, CaseStatus, Role } from "@prisma/client";

export const ALERT_STATUS_LABEL: Record<AlertStatus, string> = {
  NEW: "New",
  ACKNOWLEDGED: "Acknowledged",
  REVIEWED: "Reviewed",
  CLOSED: "Closed",
};

export const CASE_STATUS_LABEL: Record<CaseStatus, string> = {
  OPEN: "Open",
  ACTIVE: "Active",
  MONITORING: "Monitoring",
  CLOSED: "Closed",
};

export const CASE_SOURCE_LABEL: Record<CaseSource, string> = {
  ALERT: "Early-warning alert",
  HELP_REQUEST: "Student request",
  COUNSELLOR: "Opened by staff",
};

export const ROLE_LABEL: Record<Role, string> = {
  STUDENT: "Student",
  COUNSELLOR: "Counsellor",
  CLINICIAN: "Clinician",
  INSTITUTION_ADMIN: "Institution administrator",
  SUPPORT_STAFF: "Support staff",
  PLATFORM_ADMIN: "Platform administrator",
};

export const DEPARTMENT_NONE = "Department not recorded";
