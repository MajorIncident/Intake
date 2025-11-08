export type ActionStatus = 'Planned' | 'In-Progress' | 'Blocked' | 'Deferred' | 'Done' | 'Cancelled';
export type ActionPriority = 'P1' | 'P2' | 'P3';

export interface ActionVerification {
  required: boolean;
  method?: string;       // 'Metric/Alarm/User test'
  evidence?: string;     // url or free text
  result?: 'Pass' | 'Fail';
  checkedBy?: string;    // userId
  checkedAt?: string;    // ISO8601
}

export interface ActionChangeControl {
  required: boolean;
  id?: string;           // change id from your change system
  rollbackPlan?: string; // terse steps
}

export interface ActionLinks {
  hypothesisId?: string; // cause id (e.g., ⭐ likely cause)
  runbook?: string;
  ticket?: string;
  notes?: string;        // doc id or url
}

export interface ActionItem {
  id: string;
  analysisId: string;
  createdAt: string;
  createdBy: string;

  summary: string;   // one-line verb: "Restart API gateway in zone A"
  detail?: string;   // short why/what/how

  owner?: string;    // userId
  role?: string;     // "IC | Comms | Network | SRE | Vendor"

  status: ActionStatus;
  priority: ActionPriority;

  dueAt?: string;
  startedAt?: string;
  completedAt?: string;

  dependencies?: string[]; // action ids or change ids
  risk?: 'None' | 'Low' | 'Medium' | 'High';

  changeControl: ActionChangeControl;
  verification: ActionVerification;

  links?: ActionLinks;

  notes?: string; // work notes
}
