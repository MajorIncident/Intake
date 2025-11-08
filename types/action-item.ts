export type ActionStatus = 'planned' | 'in_progress' | 'done' | 'blocked';
export type ActionPriority = 'p0' | 'p1' | 'p2' | 'p3';

export interface ActionItem {
  id: string;
  analysisId: string;
  summary: string;
  detail?: string | null;
  status: ActionStatus;
  priority: ActionPriority;
  owner?: string | null;
  dueAt?: string | null;
  createdAt?: string;
  updatedAt?: string;
}
