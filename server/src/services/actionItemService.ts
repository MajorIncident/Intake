import { z } from 'zod';
import { randomUUID } from 'crypto';
import { ActionItemRepository } from '../repositories/actionItemRepository';
import type { ActionItem, ActionChangeControl, ActionVerification, ActionLinks } from '../types/action-item';
import { HttpError } from '../utils/errors';

const statusEnum = z.enum(['Planned', 'In-Progress', 'Blocked', 'Deferred', 'Done', 'Cancelled']);
const priorityEnum = z.enum(['P1', 'P2', 'P3']);
const riskEnum = z.enum(['None', 'Low', 'Medium', 'High']);

const changeControlSchema = z.object({
  required: z.boolean(),
  id: z.string().min(1).optional(),
  rollbackPlan: z.string().min(1).optional()
});

const verificationSchema = z.object({
  required: z.boolean(),
  method: z.string().min(1).optional(),
  evidence: z.string().min(1).optional(),
  result: z.enum(['Pass', 'Fail']).optional(),
  checkedBy: z.string().min(1).optional(),
  checkedAt: z.string().min(1).optional()
});

const linksSchema = z.object({
  hypothesisId: z.string().min(1).optional(),
  runbook: z.string().min(1).optional(),
  ticket: z.string().min(1).optional(),
  notes: z.string().min(1).optional()
});

const createSchema = z.object({
  summary: z.string().min(1),
  detail: z.string().optional(),
  owner: z.string().optional(),
  role: z.string().optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  dueAt: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  risk: riskEnum.optional(),
  changeControl: changeControlSchema.optional(),
  verification: verificationSchema.optional(),
  links: linksSchema.optional(),
  notes: z.string().optional(),
  createdBy: z.string().min(1)
});

const updateSchema = z.object({
  summary: z.string().min(1).optional(),
  detail: z.string().optional(),
  owner: z.string().optional(),
  role: z.string().optional(),
  status: statusEnum.optional(),
  priority: priorityEnum.optional(),
  dueAt: z.string().optional(),
  startedAt: z.string().optional(),
  completedAt: z.string().optional(),
  dependencies: z.array(z.string()).optional(),
  risk: riskEnum.optional(),
  changeControl: changeControlSchema.partial().optional(),
  verification: verificationSchema.partial().optional(),
  links: linksSchema.optional(),
  notes: z.string().optional()
});

export type CreateActionItemInput = z.infer<typeof createSchema>;
export type UpdateActionItemInput = z.infer<typeof updateSchema>;

function hasRollbackPlan(changeControl: ActionChangeControl): boolean {
  return Boolean(changeControl.rollbackPlan && changeControl.rollbackPlan.trim().length > 0);
}

function hasVerificationEvidence(verification: ActionVerification): boolean {
  return Boolean(
    verification.result &&
    verification.checkedBy && verification.checkedBy.trim().length > 0 &&
    verification.checkedAt && verification.checkedAt.trim().length > 0
  );
}

function mergeLinks(existing?: ActionLinks, incoming?: ActionLinks): ActionLinks | undefined {
  if (incoming === undefined) {
    return existing;
  }
  const merged = { ...(existing ?? {}), ...incoming };
  return Object.keys(merged).length > 0 ? merged : undefined;
}

function mergeActionItem(existing: ActionItem, updates: UpdateActionItemInput): ActionItem {
  const mergedChangeControl: ActionChangeControl = {
    ...existing.changeControl,
    ...(updates.changeControl ?? {})
  };

  const mergedVerification: ActionVerification = {
    ...existing.verification,
    ...(updates.verification ?? {})
  };

  const merged: ActionItem = {
    ...existing,
    ...updates,
    changeControl: mergedChangeControl,
    verification: mergedVerification,
    links: mergeLinks(existing.links, updates.links)
  };

  if (updates.dependencies !== undefined) {
    merged.dependencies = updates.dependencies;
  }

  if (updates.notes !== undefined) {
    merged.notes = updates.notes;
  }

  if (updates.dueAt !== undefined) {
    merged.dueAt = updates.dueAt;
  }

  if (updates.startedAt !== undefined) {
    merged.startedAt = updates.startedAt;
  }

  if (updates.completedAt !== undefined) {
    merged.completedAt = updates.completedAt;
  }

  return merged;
}

function enforceGuards(existing: ActionItem | undefined, updated: ActionItem) {
  if (updated.status === 'In-Progress') {
    if ((updated.risk === 'High' || updated.changeControl.required) && !hasRollbackPlan(updated.changeControl)) {
      throw new HttpError(422, 'Rollback plan required before moving to In-Progress when risk is High or change control is required.');
    }
  }

  if (updated.status === 'Done') {
    if (updated.verification.required && !hasVerificationEvidence(updated.verification)) {
      throw new HttpError(422, 'Verification result, checkedBy, and checkedAt are required before marking as Done.');
    }
    if (!updated.completedAt) {
      updated.completedAt = new Date().toISOString();
    }
  } else if (existing?.status === 'Done' && updated.completedAt === existing.completedAt) {
    updated.completedAt = undefined;
  }
}

export class ActionItemService {
  constructor(private readonly repository: ActionItemRepository) {}

  list(analysisId: string): ActionItem[] {
    return this.repository.list(analysisId);
  }

  create(analysisId: string, payload: unknown): ActionItem {
    const data = createSchema.parse(payload);
    const timestamp = new Date().toISOString();

    const changeControl: ActionChangeControl = data.changeControl ?? { required: false };
    const verification: ActionVerification = data.verification ?? { required: false };

    const item: ActionItem = {
      id: randomUUID(),
      analysisId,
      createdAt: timestamp,
      createdBy: data.createdBy,
      summary: data.summary,
      detail: data.detail,
      owner: data.owner,
      role: data.role,
      status: data.status ?? 'Planned',
      priority: data.priority ?? 'P2',
      dueAt: data.dueAt,
      startedAt: data.startedAt,
      completedAt: data.completedAt,
      dependencies: data.dependencies,
      risk: data.risk,
      changeControl,
      verification,
      links: data.links,
      notes: data.notes
    };

    enforceGuards(undefined, item);

    return this.repository.create(item);
  }

  update(analysisId: string, id: string, payload: unknown): ActionItem {
    const existing = this.repository.findById(analysisId, id);
    if (!existing) {
      throw new HttpError(404, 'Action item not found');
    }

    const data = updateSchema.parse(payload);
    const updated = mergeActionItem(existing, data);

    enforceGuards(existing, updated);

    return this.repository.update(updated);
  }

  delete(analysisId: string, id: string): void {
    const existing = this.repository.findById(analysisId, id);
    if (!existing) {
      throw new HttpError(404, 'Action item not found');
    }
    this.repository.delete(analysisId, id);
  }
}
