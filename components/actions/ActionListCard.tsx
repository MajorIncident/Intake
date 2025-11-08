import { useEffect, useMemo, useState } from 'react';
import type { ActionItem, ActionPriority, ActionStatus } from '../../types/action-item';

type ActionListCardProps = {
  analysisId: string;
};

export default function ActionListCard({ analysisId }: ActionListCardProps) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newSummary, setNewSummary] = useState('');
  const hasSummary = newSummary.trim().length > 0;

  useEffect(() => {
    let ignore = false;
    (async () => {
      setLoading(true);
      try {
        const res = await fetch(`/analyses/${analysisId}/actions`);
        if (!res.ok) throw new Error('Failed to load actions');
        const data: ActionItem[] = await res.json();
        if (!ignore) {
          setItems(data);
        }
      } catch (error) {
        console.error('Unable to load actions', error);
        if (!ignore) {
          setItems([]);
        }
      } finally {
        if (!ignore) {
          setLoading(false);
        }
      }
    })();
    return () => {
      ignore = true;
    };
  }, [analysisId]);

  async function createQuickAction() {
    if (!hasSummary || creating) return;
    setCreating(true);
    try {
      const res = await fetch(`/analyses/${analysisId}/actions`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary: newSummary.trim() })
      });
      if (!res.ok) throw new Error('Failed to create action');
      const item: ActionItem = await res.json();
      setItems((prev) => [item, ...prev]);
      setNewSummary('');
    } catch (error) {
      console.error('Unable to create action', error);
    } finally {
      setCreating(false);
    }
  }

  const body = useMemo(() => {
    if (loading) {
      return <div className="skeleton">Loading actions…</div>;
    }
    if (items.length === 0) {
      return <div className="muted">No actions yet.</div>;
    }
    return (
      <ul className="action-list" role="list">
        {items.map((item) => (
          <ActionRow
            key={item.id}
            item={item}
            onChange={(updated) =>
              setItems((prev) => prev.map((p) => (p.id === updated.id ? updated : p)))
            }
          />
        ))}
      </ul>
    );
  }, [items, loading]);

  return (
    <section className="card action-card" aria-labelledby={`action-card-${analysisId}`}>
      <header className="card-header">
        <div className="card-title-group">
          <h3 id={`action-card-${analysisId}`}>Action List</h3>
          <div className="muted">Track, execute, verify</div>
        </div>
      </header>

      <div className="quick-add">
        <label className="visually-hidden" htmlFor={`quick-action-${analysisId}`}>
          New action summary
        </label>
        <input
          id={`quick-action-${analysisId}`}
          aria-label="New action summary"
          placeholder="e.g., Restart API gateway in zone A"
          value={newSummary}
          onChange={(event) => setNewSummary(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter') {
              event.preventDefault();
              createQuickAction();
            }
          }}
        />
        <button disabled={creating || !hasSummary} onClick={createQuickAction}>
          + Add
        </button>
      </div>

      {body}
    </section>
  );
}

type ActionRowProps = {
  item: ActionItem;
  onChange: (item: ActionItem) => void;
};

function ActionRow({ item, onChange }: ActionRowProps) {
  async function patch(patchPayload: Partial<ActionItem>) {
    try {
      const res = await fetch(`/analyses/${item.analysisId}/actions/${item.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patchPayload)
      });
      if (!res.ok) throw new Error('Failed to update action');
      const updated: ActionItem = await res.json();
      onChange(updated);
    } catch (error) {
      console.error('Unable to update action', error);
    }
  }

  return (
    <li
      className="action-row"
      data-status={item.status}
      data-priority={item.priority}
      data-owner={item.owner || ''}
      data-has-detail={item.detail ? 'true' : 'false'}
    >
      <StatusChip item={item} onChange={(status) => patch({ status })} />
      <PriorityChip item={item} onChange={(priority) => patch({ priority })} />
      <div className="summary" title={item.detail || ''}>
        {item.summary}
      </div>
      <OwnerPicker item={item} onChange={(owner) => patch({ owner })} />
      <EtaPicker item={item} onChange={(dueAt) => patch({ dueAt })} />
      <LinksButton item={item} />
      <MoreMenu item={item} onPatch={patch} />
    </li>
  );
}

type ChipProps = {
  item: ActionItem;
  onChange: (value: ActionStatus | ActionPriority | string | null) => void;
};

type PickerProps = {
  item: ActionItem;
  onChange: (value: string | null) => void;
};

type MenuProps = {
  item: ActionItem;
  onPatch: (patchPayload: Partial<ActionItem>) => void;
};

function StatusChip(_props: ChipProps) {
  return <button type="button" className="chip">Planned</button>;
}

function PriorityChip(_props: ChipProps) {
  return <button type="button" className="chip">P2</button>;
}

function OwnerPicker(_props: PickerProps) {
  return <button type="button" className="chip">Owner</button>;
}

function EtaPicker(_props: PickerProps) {
  return <button type="button" className="chip">ETA</button>;
}

function LinksButton(_props: { item: ActionItem }) {
  return <button type="button" className="icon-button">Links</button>;
}

function MoreMenu(_props: MenuProps) {
  return <button type="button" className="icon-button">⋯</button>;
}
