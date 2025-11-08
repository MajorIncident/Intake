export type ActionStatus =
  | 'Planned'
  | 'In-Progress'
  | 'Blocked'
  | 'Deferred'
  | 'Done'
  | 'Cancelled';

export type ActionPriority = 'P1' | 'P2' | 'P3';

export interface ActionVerification {
  required: boolean;
  method?: string;
  evidence?: string;
  result?: 'Pass' | 'Fail';
  checkedBy?: string;
  checkedAt?: string;
}

export interface ActionChangeControl {
  required: boolean;
  id?: string;
  rollbackPlan?: string;
}

export interface ActionLinks {
  hypothesisId?: string;
  runbook?: string;
  ticket?: string;
  notes?: string;
}

export interface ActionItem {
  id: string;
  analysisId: string;
  createdAt?: string;
  createdBy?: string;
  summary: string;
  detail?: string | null;
  owner?: string | null;
  role?: string | null;
  status: ActionStatus;
  priority: ActionPriority;
  dueAt?: string | null;
  startedAt?: string | null;
  completedAt?: string | null;
  dependencies?: string[];
  risk?: 'None' | 'Low' | 'Medium' | 'High';
  changeControl: ActionChangeControl;
  verification: ActionVerification;
  links?: ActionLinks;
  notes?: string | null;
}
