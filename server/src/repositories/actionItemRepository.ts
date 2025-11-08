import type { DB } from '../db';
import type { ActionItem } from '../types/action-item';

function serialize(item: ActionItem) {
  return {
    id: item.id,
    analysis_id: item.analysisId,
    created_at: item.createdAt,
    created_by: item.createdBy,
    summary: item.summary,
    detail: item.detail ?? null,
    owner: item.owner ?? null,
    role: item.role ?? null,
    status: item.status,
    priority: item.priority,
    due_at: item.dueAt ?? null,
    started_at: item.startedAt ?? null,
    completed_at: item.completedAt ?? null,
    dependencies: item.dependencies ? JSON.stringify(item.dependencies) : null,
    risk: item.risk ?? null,
    change_control: JSON.stringify(item.changeControl),
    verification: JSON.stringify(item.verification),
    links: item.links ? JSON.stringify(item.links) : null,
    notes: item.notes ?? null
  };
}

function deserialize(row: any): ActionItem {
  return {
    id: row.id,
    analysisId: row.analysis_id,
    createdAt: row.created_at,
    createdBy: row.created_by,
    summary: row.summary,
    detail: row.detail ?? undefined,
    owner: row.owner ?? undefined,
    role: row.role ?? undefined,
    status: row.status,
    priority: row.priority,
    dueAt: row.due_at ?? undefined,
    startedAt: row.started_at ?? undefined,
    completedAt: row.completed_at ?? undefined,
    dependencies: row.dependencies ? JSON.parse(row.dependencies) : undefined,
    risk: row.risk ?? undefined,
    changeControl: JSON.parse(row.change_control),
    verification: JSON.parse(row.verification),
    links: row.links ? JSON.parse(row.links) : undefined,
    notes: row.notes ?? undefined
  };
}

export class ActionItemRepository {
  constructor(private readonly db: DB) {}

  list(analysisId: string): ActionItem[] {
    const stmt = this.db.prepare(`SELECT * FROM action_items WHERE analysis_id = ? ORDER BY created_at ASC`);
    const rows = stmt.all(analysisId);
    return rows.map(deserialize);
  }

  findById(analysisId: string, id: string): ActionItem | undefined {
    const stmt = this.db.prepare(`SELECT * FROM action_items WHERE analysis_id = ? AND id = ?`);
    const row = stmt.get(analysisId, id);
    return row ? deserialize(row) : undefined;
  }

  create(item: ActionItem): ActionItem {
    const stmt = this.db.prepare(`
      INSERT INTO action_items (
        id, analysis_id, created_at, created_by, summary, detail, owner, role, status, priority, due_at,
        started_at, completed_at, dependencies, risk, change_control, verification, links, notes
      ) VALUES (
        @id, @analysis_id, @created_at, @created_by, @summary, @detail, @owner, @role, @status, @priority, @due_at,
        @started_at, @completed_at, @dependencies, @risk, @change_control, @verification, @links, @notes
      )
    `);
    stmt.run(serialize(item));
    return item;
  }

  update(item: ActionItem): ActionItem {
    const stmt = this.db.prepare(`
      UPDATE action_items SET
        summary = @summary,
        detail = @detail,
        owner = @owner,
        role = @role,
        status = @status,
        priority = @priority,
        due_at = @due_at,
        started_at = @started_at,
        completed_at = @completed_at,
        dependencies = @dependencies,
        risk = @risk,
        change_control = @change_control,
        verification = @verification,
        links = @links,
        notes = @notes
      WHERE id = @id AND analysis_id = @analysis_id
    `);
    stmt.run(serialize(item));
    return item;
  }

  delete(analysisId: string, id: string): void {
    const stmt = this.db.prepare(`DELETE FROM action_items WHERE analysis_id = ? AND id = ?`);
    stmt.run(analysisId, id);
  }
}
