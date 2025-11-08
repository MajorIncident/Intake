import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  useId
} from 'react';
import type { PointerEvent, ReactNode } from 'react';
import type { ActionItem, ActionLinks, ActionPriority, ActionStatus } from '../../types/action-item';

type MenuPosition = { top: number; left: number };

type MenuState = { itemId: string; position: MenuPosition };

type ChangeControlState = {
  item: ActionItem;
  nextStatus: ActionStatus;
};

type VerifyDialogState = {
  item: ActionItem;
  nextStatus?: ActionStatus;
};

type BlockerDialogState = {
  item: ActionItem;
};

type OwnerDialogState = {
  item: ActionItem;
};

type EtaDialogState = {
  item: ActionItem;
};

type LinksDialogState = {
  item: ActionItem;
  values: ActionLinks;
};

const PRIMARY_STATUS_FLOW: ActionStatus[] = ['Planned', 'In-Progress', 'Done'];
const STATUS_OPTIONS: ActionStatus[] = ['Planned', 'In-Progress', 'Blocked', 'Deferred', 'Done', 'Cancelled'];
const STATUS_LABELS: Record<ActionStatus, string> = {
  Planned: 'Planned',
  'In-Progress': 'In Progress',
  Blocked: 'Blocked',
  Deferred: 'Deferred',
  Done: 'Done',
  Cancelled: 'Cancelled'
};

const PRIORITY_OPTIONS: ActionPriority[] = ['P1', 'P2', 'P3'];
const PRIORITY_LABELS: Record<ActionPriority, string> = {
  P1: 'P1',
  P2: 'P2',
  P3: 'P3'
};

const SPACE_KEYS = new Set([' ', 'Spacebar']);

const dueDateFormatter = new Intl.DateTimeFormat(undefined, {
  month: 'short',
  day: 'numeric',
  hour: '2-digit',
  minute: '2-digit'
});

export default function ActionListCard({ analysisId }: { analysisId: string }) {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [creating, setCreating] = useState(false);
  const [newSummary, setNewSummary] = useState('');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [statusMenu, setStatusMenu] = useState<MenuState | null>(null);
  const [priorityMenu, setPriorityMenu] = useState<MenuState | null>(null);
  const [changeControlState, setChangeControlState] = useState<ChangeControlState | null>(null);
  const [verifyState, setVerifyState] = useState<VerifyDialogState | null>(null);
  const [blockerState, setBlockerState] = useState<BlockerDialogState | null>(null);
  const [ownerState, setOwnerState] = useState<OwnerDialogState | null>(null);
  const [etaState, setEtaState] = useState<EtaDialogState | null>(null);
  const [linksState, setLinksState] = useState<LinksDialogState | null>(null);

  const quickAddRef = useRef<HTMLInputElement>(null);
  const rowRefs = useRef(new Map<string, HTMLLIElement>());
  const statusButtonRefs = useRef(new Map<string, HTMLButtonElement>());
  const priorityButtonRefs = useRef(new Map<string, HTMLButtonElement>());

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
          if (data.length && !selectedId) {
            setSelectedId(data[0].id);
          }
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
  }, [analysisId, selectedId]);

  useEffect(() => {
    if (selectedId && !items.some((item) => item.id === selectedId)) {
      setSelectedId(items.length ? items[0].id : null);
    }
  }, [items, selectedId]);

  useEffect(() => {
    if (!selectedId) return;
    const node = rowRefs.current.get(selectedId);
    if (node) {
      node.focus();
    }
  }, [selectedId, items]);

  const selectedItem = useMemo(
    () => (selectedId ? items.find((item) => item.id === selectedId) ?? null : null),
    [items, selectedId]
  );

  const registerRowRef = useCallback((id: string, node: HTMLLIElement | null) => {
    if (!node) {
      rowRefs.current.delete(id);
      return;
    }
    rowRefs.current.set(id, node);
  }, []);

  const registerStatusButtonRef = useCallback((id: string, node: HTMLButtonElement | null) => {
    if (!node) {
      statusButtonRefs.current.delete(id);
      return;
    }
    statusButtonRefs.current.set(id, node);
  }, []);

  const registerPriorityButtonRef = useCallback((id: string, node: HTMLButtonElement | null) => {
    if (!node) {
      priorityButtonRefs.current.delete(id);
      return;
    }
    priorityButtonRefs.current.set(id, node);
  }, []);

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
      setSelectedId(item.id);
    } catch (error) {
      console.error('Unable to create action', error);
    } finally {
      setCreating(false);
    }
  }

  const patchItem = useCallback(
    async (itemId: string, patchPayload: Partial<ActionItem>) => {
      try {
        const res = await fetch(`/analyses/${analysisId}/actions/${itemId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(patchPayload)
        });
        if (!res.ok) throw new Error('Failed to update action');
        const updated: ActionItem = await res.json();
        setItems((prev) => prev.map((item) => (item.id === updated.id ? updated : item)));
        setSelectedId(updated.id);
      } catch (error) {
        console.error('Unable to update action', error);
      }
    },
    [analysisId]
  );

  const openStatusMenu = useCallback((itemId: string, anchor: HTMLElement) => {
    setStatusMenu({ itemId, position: getMenuPosition(anchor) });
  }, []);

  const openPriorityMenu = useCallback((itemId: string, anchor: HTMLElement) => {
    setPriorityMenu({ itemId, position: getMenuPosition(anchor) });
  }, []);

  const handleStatusCycle = useCallback(
    (item: ActionItem) => {
      const next = getNextPrimaryStatus(item.status);
      attemptStatusChange(item, next);
    },
    []
  );

  const attemptStatusChange = useCallback(
    (item: ActionItem, status: ActionStatus) => {
      if (status === item.status) return;

      if (status === 'In-Progress' && requiresRollbackPlan(item)) {
        setChangeControlState({ item, nextStatus: status });
        return;
      }

      if (status === 'Done' && requiresVerificationEvidence(item)) {
        setVerifyState({ item, nextStatus: status });
        return;
      }

      if (status === 'Blocked') {
        setBlockerState({ item });
        return;
      }

      patchItem(item.id, { status });
    },
    [patchItem]
  );

  const handlePriorityChange = useCallback(
    (item: ActionItem, priority: ActionPriority) => {
      if (item.priority === priority) return;
      patchItem(item.id, { priority });
    },
    [patchItem]
  );

  const handleOwnerShortcut = useCallback(() => {
    if (selectedItem) {
      setOwnerState({ item: selectedItem });
    }
  }, [selectedItem]);

  const handleEtaShortcut = useCallback(() => {
    if (selectedItem) {
      setEtaState({ item: selectedItem });
    }
  }, [selectedItem]);

  const handleVerifyShortcut = useCallback(() => {
    if (selectedItem) {
      setVerifyState({ item: selectedItem });
    }
  }, [selectedItem]);

  const handleLinksShortcut = useCallback(() => {
    if (!selectedItem) return;
    const likelyCause = readLikelyCauseId();
    const existing = selectedItem.links ?? {};
    setLinksState({
      item: selectedItem,
      values: {
        hypothesisId: existing.hypothesisId ?? likelyCause ?? '',
        runbook: existing.runbook ?? '',
        ticket: existing.ticket ?? '',
        notes: existing.notes ?? ''
      }
    });
  }, [selectedItem]);

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (isTypingEventTarget(event.target)) return;

      const key = event.key;

      if (key === 'n' || key === 'N') {
        if (quickAddRef.current) {
          event.preventDefault();
          quickAddRef.current.focus();
          quickAddRef.current.select();
        }
        return;
      }

      if (!selectedItem) return;

      if (SPACE_KEYS.has(key)) {
        event.preventDefault();
        if (event.shiftKey) {
          const btn = statusButtonRefs.current.get(selectedItem.id);
          if (btn) {
            openStatusMenu(selectedItem.id, btn);
          }
        } else {
          handleStatusCycle(selectedItem);
        }
        return;
      }

      if (key === 'V' || key === 'v') {
        event.preventDefault();
        handleVerifyShortcut();
        return;
      }

      if (key === 'O' || key === 'o') {
        event.preventDefault();
        handleOwnerShortcut();
        return;
      }

      if (key === 'E' || key === 'e') {
        event.preventDefault();
        handleEtaShortcut();
        return;
      }

      if (key === 'L' || key === 'l') {
        event.preventDefault();
        handleLinksShortcut();
        return;
      }

      if (key === '1' || key === '2' || key === '3') {
        event.preventDefault();
        const map: Record<string, ActionPriority> = { '1': 'P1', '2': 'P2', '3': 'P3' };
        const priority = map[key];
        if (priority) {
          handlePriorityChange(selectedItem, priority);
        }
      }
    }

    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [handleEtaShortcut, handleLinksShortcut, handleOwnerShortcut, handlePriorityChange, handleStatusCycle, handleVerifyShortcut, openStatusMenu, selectedItem]);

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
            selected={item.id === selectedId}
            onSelect={() => setSelectedId(item.id)}
            registerRowRef={(node) => registerRowRef(item.id, node)}
            registerStatusButtonRef={(node) => registerStatusButtonRef(item.id, node)}
            registerPriorityButtonRef={(node) => registerPriorityButtonRef(item.id, node)}
            onCycleStatus={() => handleStatusCycle(item)}
            onOpenStatusMenu={(anchor) => openStatusMenu(item.id, anchor)}
            onOpenPriorityMenu={(anchor) => openPriorityMenu(item.id, anchor)}
            onOwnerEdit={() => setOwnerState({ item })}
            onEtaEdit={() => setEtaState({ item })}
            onVerify={() => setVerifyState({ item })}
            onLinksEdit={() => {
              const likelyCause = readLikelyCauseId();
              const existing = item.links ?? {};
              setLinksState({
                item,
                values: {
                  hypothesisId: existing.hypothesisId ?? likelyCause ?? '',
                  runbook: existing.runbook ?? '',
                  ticket: existing.ticket ?? '',
                  notes: existing.notes ?? ''
                }
              });
            }}
          />
        ))}
      </ul>
    );
  }, [items, loading, selectedId, registerRowRef, registerStatusButtonRef, registerPriorityButtonRef, handleStatusCycle, openStatusMenu, openPriorityMenu]);

  const statusMenuItem = statusMenu ? items.find((item) => item.id === statusMenu.itemId) : null;
  const priorityMenuItem = priorityMenu ? items.find((item) => item.id === priorityMenu.itemId) : null;

  return (
    <section className="card action-card" aria-labelledby={`action-card-${analysisId}`}>
      <header className="card-header">
        <div className="card-title-group">
          <h3 id={`action-card-${analysisId}`}>Action List</h3>
          <div className="muted">Track, execute, verify</div>
        </div>
      </header>

      <div className="quick-add" data-skip-shortcuts="true">
        <label className="visually-hidden" htmlFor={`quick-action-${analysisId}`}>
          New action summary
        </label>
        <input
          id={`quick-action-${analysisId}`}
          ref={quickAddRef}
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
        <button type="button" disabled={creating || !hasSummary} onClick={createQuickAction}>
          + Add
        </button>
      </div>

      {body}

      {statusMenu && statusMenuItem ? (
        <StatusMenu
          position={statusMenu.position}
          current={statusMenuItem.status}
          onSelect={(status) => {
            setStatusMenu(null);
            attemptStatusChange(statusMenuItem, status);
          }}
          onClose={() => setStatusMenu(null)}
        />
      ) : null}

      {priorityMenu && priorityMenuItem ? (
        <PriorityMenu
          position={priorityMenu.position}
          current={priorityMenuItem.priority}
          onSelect={(priority) => {
            setPriorityMenu(null);
            handlePriorityChange(priorityMenuItem, priority);
          }}
          onClose={() => setPriorityMenu(null)}
        />
      ) : null}

      {changeControlState ? (
        <ChangeControlDialog
          item={changeControlState.item}
          nextStatus={changeControlState.nextStatus}
          onCancel={() => setChangeControlState(null)}
          onConfirm={({ rollbackPlan, changeId }) => {
            const { item, nextStatus } = changeControlState;
            const payload: Partial<ActionItem> = {
              status: nextStatus,
              changeControl: {
                required: item.changeControl?.required ?? false,
                ...item.changeControl,
                rollbackPlan,
                id: changeId
              }
            };
            setChangeControlState(null);
            patchItem(item.id, payload);
          }}
        />
      ) : null}

      {verifyState ? (
        <VerifyDialog
          item={verifyState.item}
          nextStatus={verifyState.nextStatus}
          onCancel={() => setVerifyState(null)}
          onConfirm={(verification) => {
            const { item, nextStatus } = verifyState;
            const payload: Partial<ActionItem> = {
              verification,
              status: nextStatus ?? item.status
            };
            setVerifyState(null);
            patchItem(item.id, payload);
          }}
        />
      ) : null}

      {blockerState ? (
        <BlockerDialog
          item={blockerState.item}
          onCancel={() => setBlockerState(null)}
          onConfirm={({ note, dependencyId }) => {
            const { item } = blockerState;
            const dependencies = dependencyId
              ? uniqueList([...(item.dependencies ?? []), dependencyId])
              : undefined;
            const payload: Partial<ActionItem> = {
              status: 'Blocked',
              notes: appendNote(item.notes, note)
            };
            if (dependencies) {
              payload.dependencies = dependencies;
            }
            setBlockerState(null);
            patchItem(item.id, payload);
          }}
        />
      ) : null}

      {ownerState ? (
        <OwnerDialog
          item={ownerState.item}
          onCancel={() => setOwnerState(null)}
          onConfirm={(owner) => {
            const { item } = ownerState;
            setOwnerState(null);
            patchItem(item.id, { owner });
          }}
        />
      ) : null}

      {etaState ? (
        <EtaDialog
          item={etaState.item}
          onCancel={() => setEtaState(null)}
          onConfirm={(dueAt) => {
            const { item } = etaState;
            setEtaState(null);
            patchItem(item.id, { dueAt });
          }}
        />
      ) : null}

      {linksState ? (
        <LinksDialog
          item={linksState.item}
          initialValues={linksState.values}
          onCancel={() => setLinksState(null)}
          onConfirm={(links) => {
            const { item } = linksState;
            setLinksState(null);
            patchItem(item.id, { links });
          }}
        />
      ) : null}
    </section>
  );
}

type ActionRowProps = {
  item: ActionItem;
  selected: boolean;
  onSelect: () => void;
  registerRowRef: (node: HTMLLIElement | null) => void;
  registerStatusButtonRef: (node: HTMLButtonElement | null) => void;
  registerPriorityButtonRef: (node: HTMLButtonElement | null) => void;
  onCycleStatus: () => void;
  onOpenStatusMenu: (anchor: HTMLElement) => void;
  onOpenPriorityMenu: (anchor: HTMLElement) => void;
  onOwnerEdit: () => void;
  onEtaEdit: () => void;
  onVerify: () => void;
  onLinksEdit: () => void;
};

function ActionRow({
  item,
  selected,
  onSelect,
  registerRowRef,
  registerStatusButtonRef,
  registerPriorityButtonRef,
  onCycleStatus,
  onOpenStatusMenu,
  onOpenPriorityMenu,
  onOwnerEdit,
  onEtaEdit,
  onVerify,
  onLinksEdit
}: ActionRowProps) {
  const rowRef = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    registerRowRef(rowRef.current);
    return () => registerRowRef(null);
  }, [registerRowRef]);

  return (
    <li
      ref={rowRef}
      className={`action-row${selected ? ' is-selected' : ''}`}
      data-status={item.status}
      data-priority={item.priority}
      data-owner={item.owner || ''}
      role="listitem"
      tabIndex={0}
      aria-selected={selected}
      onClick={onSelect}
      onFocus={onSelect}
    >
      <StatusChip
        status={item.status}
        onCycle={onCycleStatus}
        onMenuRequest={onOpenStatusMenu}
        registerRef={registerStatusButtonRef}
      />
      <PriorityChip
        priority={item.priority}
        onMenuRequest={onOpenPriorityMenu}
        registerRef={registerPriorityButtonRef}
      />
      <div className="summary" title={item.detail || ''}>
        <div className="summary__title">{item.summary}</div>
        {item.detail ? <div className="summary__detail">{item.detail}</div> : null}
      </div>
      <OwnerPicker owner={item.owner} onEdit={onOwnerEdit} />
      <EtaPicker dueAt={item.dueAt} onEdit={onEtaEdit} />
      <LinksButton onClick={onLinksEdit} />
      <VerifyButton required={item.verification?.required ?? false} onClick={onVerify} />
    </li>
  );
}

function StatusChip({
  status,
  onCycle,
  onMenuRequest,
  registerRef
}: {
  status: ActionStatus;
  onCycle: () => void;
  onMenuRequest: (anchor: HTMLElement) => void;
  registerRef: (node: HTMLButtonElement | null) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const longPressTimer = useRef<number>();
  const longPressTriggered = useRef(false);

  useEffect(() => {
    registerRef(buttonRef.current);
    return () => registerRef(null);
  }, [registerRef]);

  function clearLongPress() {
    if (longPressTimer.current) {
      window.clearTimeout(longPressTimer.current);
      longPressTimer.current = undefined;
    }
  }

  const handlePointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (event.pointerType === 'mouse') return;
    longPressTriggered.current = false;
    clearLongPress();
    longPressTimer.current = window.setTimeout(() => {
      longPressTriggered.current = true;
      if (buttonRef.current) {
        onMenuRequest(buttonRef.current);
      }
    }, 500);
  };

  const handlePointerUp = () => {
    clearLongPress();
  };

  const handleClick = () => {
    if (longPressTriggered.current) {
      longPressTriggered.current = false;
      return;
    }
    onCycle();
  };

  return (
    <button
      ref={buttonRef}
      type="button"
      className="chip chip--status"
      title="Advance status (Space). Long-press for all statuses."
      data-status={status}
      aria-pressed={status !== 'Planned'}
      onClick={handleClick}
      onContextMenu={(event) => {
        event.preventDefault();
        if (buttonRef.current) {
          onMenuRequest(buttonRef.current);
        }
      }}
      onPointerDown={handlePointerDown}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      onPointerCancel={handlePointerUp}
    >
      {STATUS_LABELS[status]}
    </button>
  );
}

function PriorityChip({
  priority,
  onMenuRequest,
  registerRef
}: {
  priority: ActionPriority;
  onMenuRequest: (anchor: HTMLElement) => void;
  registerRef: (node: HTMLButtonElement | null) => void;
}) {
  const buttonRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    registerRef(buttonRef.current);
    return () => registerRef(null);
  }, [registerRef]);

  return (
    <button
      ref={buttonRef}
      type="button"
      className="chip chip--priority"
      title="Set action priority (1/2/3)."
      data-priority={priority}
      onClick={() => {
        if (buttonRef.current) {
          onMenuRequest(buttonRef.current);
        }
      }}
      onContextMenu={(event) => {
        event.preventDefault();
        if (buttonRef.current) {
          onMenuRequest(buttonRef.current);
        }
      }}
    >
      {PRIORITY_LABELS[priority]}
    </button>
  );
}

function OwnerPicker({ owner, onEdit }: { owner?: string | null; onEdit: () => void }) {
  return (
    <button type="button" className="chip chip--pill" onClick={onEdit} title="Assign owner (O).">
      {owner?.trim() ? owner : 'Owner'}
    </button>
  );
}

function EtaPicker({ dueAt, onEdit }: { dueAt?: string | null; onEdit: () => void }) {
  return (
    <button type="button" className="chip chip--pill" onClick={onEdit} title="Set ETA (E).">
      {formatDueAt(dueAt)}
    </button>
  );
}

function LinksButton({ onClick }: { onClick: () => void }) {
  return (
    <button type="button" className="icon-button" onClick={onClick} title="Link supporting context.">
      Links
    </button>
  );
}

function VerifyButton({ required, onClick }: { required: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      className={`icon-button verify-button${required ? ' is-required' : ''}`}
      onClick={onClick}
      title="Record verification result (V)."
    >
      Verify
    </button>
  );
}

function StatusMenu({
  position,
  current,
  onSelect,
  onClose
}: {
  position: MenuPosition;
  current: ActionStatus;
  onSelect: (status: ActionStatus) => void;
  onClose: () => void;
}) {
  return (
    <MenuShell position={position} title="Set status" onClose={onClose}>
      {STATUS_OPTIONS.map((status) => (
        <button
          key={status}
          type="button"
          className={`menu-item${status === current ? ' is-active' : ''}`}
          data-status={status}
          onClick={() => onSelect(status)}
        >
          {STATUS_LABELS[status]}
        </button>
      ))}
    </MenuShell>
  );
}

function PriorityMenu({
  position,
  current,
  onSelect,
  onClose
}: {
  position: MenuPosition;
  current: ActionPriority;
  onSelect: (priority: ActionPriority) => void;
  onClose: () => void;
}) {
  return (
    <MenuShell position={position} title="Set priority" onClose={onClose}>
      {PRIORITY_OPTIONS.map((priority) => (
        <button
          key={priority}
          type="button"
          className={`menu-item${priority === current ? ' is-active' : ''}`}
          data-priority={priority}
          onClick={() => onSelect(priority)}
        >
          {PRIORITY_LABELS[priority]}
        </button>
      ))}
    </MenuShell>
  );
}

function MenuShell({
  position,
  title,
  children,
  onClose
}: {
  position: MenuPosition;
  title: string;
  children: ReactNode;
  onClose: () => void;
}) {
  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  return (
    <div className="menu-layer" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="menu-sheet" style={{ top: position.top, left: position.left }}>
        <div className="menu-title">{title}</div>
        <div className="menu-list">{children}</div>
      </div>
    </div>
  );
}

type ChangeControlDialogProps = {
  item: ActionItem;
  nextStatus: ActionStatus;
  onCancel: () => void;
  onConfirm: (payload: { rollbackPlan: string; changeId?: string }) => void;
};

function ChangeControlDialog({ item, nextStatus, onCancel, onConfirm }: ChangeControlDialogProps) {
  const rollbackPlanId = useId();
  const changeIdField = useId();
  const [rollbackPlan, setRollbackPlan] = useState(item.changeControl?.rollbackPlan ?? '');
  const [changeId, setChangeId] = useState(item.changeControl?.id ?? '');
  const trimmedPlan = rollbackPlan.trim();

  return (
    <DialogFrame
      title="Rollback plan required"
      description={`Provide a rollback plan before moving to ${STATUS_LABELS[nextStatus]}.`}
      submitLabel={`Move to ${STATUS_LABELS[nextStatus]}`}
      submitDisabled={!trimmedPlan}
      onSubmit={() => onConfirm({ rollbackPlan: trimmedPlan, changeId: changeId.trim() || undefined })}
      onClose={onCancel}
    >
      <div className="field">
        <label htmlFor={rollbackPlanId}>Rollback plan</label>
        <textarea
          id={rollbackPlanId}
          value={rollbackPlan}
          onChange={(event) => setRollbackPlan(event.target.value)}
          rows={4}
          required
          autoFocus
        />
        <p className="field-hint">Concise steps to recover if the change fails.</p>
      </div>
      <div className="field">
        <label htmlFor={changeIdField}>Change ID (optional)</label>
        <input id={changeIdField} value={changeId} onChange={(event) => setChangeId(event.target.value)} />
      </div>
    </DialogFrame>
  );
}

type VerifyDialogProps = {
  item: ActionItem;
  nextStatus?: ActionStatus;
  onCancel: () => void;
  onConfirm: (verification: ActionItem['verification']) => void;
};

function VerifyDialog({ item, nextStatus, onCancel, onConfirm }: VerifyDialogProps) {
  const methodId = useId();
  const evidenceId = useId();
  const resultId = useId();
  const checkedById = useId();
  const checkedAtId = useId();

  const [method, setMethod] = useState(item.verification?.method ?? '');
  const [evidence, setEvidence] = useState(item.verification?.evidence ?? '');
  const [result, setResult] = useState<'Pass' | 'Fail' | ''>(item.verification?.result ?? '');
  const [checkedBy, setCheckedBy] = useState(item.verification?.checkedBy ?? '');
  const [checkedAt, setCheckedAt] = useState(
    isoToLocalInput(item.verification?.checkedAt) || isoToLocalInput(new Date().toISOString())
  );

  const disabled = !result || !checkedBy.trim() || !checkedAt;

  return (
    <DialogFrame
      title="Verify action"
      description={nextStatus === 'Done' ? 'Record verification before closing the action.' : 'Capture verification evidence.'}
      submitLabel={nextStatus === 'Done' ? 'Mark as Done' : 'Save verification'}
      submitDisabled={disabled}
      onSubmit={() => {
        const payload = {
          required: item.verification?.required ?? false,
          ...item.verification,
          method: method.trim() || undefined,
          evidence: evidence.trim() || undefined,
          result: result as 'Pass' | 'Fail',
          checkedBy: checkedBy.trim(),
          checkedAt: localInputToIso(checkedAt) ?? new Date().toISOString()
        };
        onConfirm(payload);
      }}
      onClose={onCancel}
    >
      <div className="field">
        <label htmlFor={methodId}>Verification method</label>
        <input id={methodId} value={method} onChange={(event) => setMethod(event.target.value)} placeholder="Metric, alarm, user test" />
      </div>
      <div className="field">
        <label htmlFor={evidenceId}>Evidence / link</label>
        <input id={evidenceId} value={evidence} onChange={(event) => setEvidence(event.target.value)} placeholder="URL or notes" />
      </div>
      <div className="field">
        <label htmlFor={resultId}>Result</label>
        <select id={resultId} value={result} onChange={(event) => setResult(event.target.value as 'Pass' | 'Fail' | '')} required>
          <option value="">Select…</option>
          <option value="Pass">Pass</option>
          <option value="Fail">Fail</option>
        </select>
      </div>
      <div className="field-grid">
        <div className="field">
          <label htmlFor={checkedById}>Checked by</label>
          <input id={checkedById} value={checkedBy} onChange={(event) => setCheckedBy(event.target.value)} required />
        </div>
        <div className="field">
          <label htmlFor={checkedAtId}>Checked at</label>
          <input id={checkedAtId} type="datetime-local" value={checkedAt} onChange={(event) => setCheckedAt(event.target.value)} required />
        </div>
      </div>
    </DialogFrame>
  );
}

type BlockerDialogProps = {
  item: ActionItem;
  onCancel: () => void;
  onConfirm: (payload: { note: string; dependencyId?: string }) => void;
};

function BlockerDialog({ item, onCancel, onConfirm }: BlockerDialogProps) {
  const noteId = useId();
  const dependencyId = useId();
  const [note, setNote] = useState('');
  const [dependency, setDependency] = useState('');
  const trimmed = note.trim();

  return (
    <DialogFrame
      title="Mark blocked"
      description="Capture what is blocking this action."
      submitLabel="Save blocker"
      submitDisabled={!trimmed}
      onSubmit={() => onConfirm({ note: trimmed, dependencyId: dependency.trim() || undefined })}
      onClose={onCancel}
    >
      <div className="field">
        <label htmlFor={noteId}>Blocker note</label>
        <textarea
          id={noteId}
          value={note}
          onChange={(event) => setNote(event.target.value)}
          rows={3}
          placeholder="e.g., Waiting on database failover"
          required
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor={dependencyId}>Dependency ID (optional)</label>
        <input
          id={dependencyId}
          value={dependency}
          onChange={(event) => setDependency(event.target.value)}
          placeholder="Action or change ID"
        />
      </div>
    </DialogFrame>
  );
}

type OwnerDialogProps = {
  item: ActionItem;
  onCancel: () => void;
  onConfirm: (owner: string | null) => void;
};

function OwnerDialog({ item, onCancel, onConfirm }: OwnerDialogProps) {
  const ownerId = useId();
  const [value, setValue] = useState(item.owner ?? '');
  return (
    <DialogFrame
      title="Assign owner"
      description="Who is driving this action?"
      submitLabel="Save owner"
      onSubmit={() => onConfirm(value.trim() || null)}
      onClose={onCancel}
    >
      <div className="field">
        <label htmlFor={ownerId}>Owner</label>
        <input id={ownerId} value={value} onChange={(event) => setValue(event.target.value)} autoFocus placeholder="Name or alias" />
      </div>
    </DialogFrame>
  );
}

type EtaDialogProps = {
  item: ActionItem;
  onCancel: () => void;
  onConfirm: (dueAt: string | null) => void;
};

function EtaDialog({ item, onCancel, onConfirm }: EtaDialogProps) {
  const etaId = useId();
  const [value, setValue] = useState(isoToLocalInput(item.dueAt) || '');
  return (
    <DialogFrame
      title="Set ETA"
      description="When do you expect this to complete?"
      submitLabel="Save ETA"
      onSubmit={() => onConfirm(localInputToIso(value) ?? null)}
      onClose={onCancel}
    >
      <div className="field">
        <label htmlFor={etaId}>Due date</label>
        <input id={etaId} type="datetime-local" value={value} onChange={(event) => setValue(event.target.value)} autoFocus />
      </div>
    </DialogFrame>
  );
}

type LinksDialogProps = {
  item: ActionItem;
  initialValues: ActionLinks;
  onCancel: () => void;
  onConfirm: (links: ActionLinks | undefined) => void;
};

function LinksDialog({ item, initialValues, onCancel, onConfirm }: LinksDialogProps) {
  const hypothesisId = useId();
  const runbookId = useId();
  const ticketId = useId();
  const notesId = useId();
  const [values, setValues] = useState<ActionLinks>(initialValues);

  function updateField<Key extends keyof ActionLinks>(key: Key, value: ActionLinks[Key]) {
    setValues((prev) => ({ ...prev, [key]: value }));
  }

  return (
    <DialogFrame
      title="Link context"
      description="Capture runbooks, tickets, and likely cause IDs."
      submitLabel="Save links"
      onSubmit={() => onConfirm(normalizeLinks(values))}
      onClose={onCancel}
    >
      <div className="field">
        <label htmlFor={hypothesisId}>Hypothesis ID</label>
        <input
          id={hypothesisId}
          value={values.hypothesisId ?? ''}
          onChange={(event) => updateField('hypothesisId', event.target.value)}
          placeholder="⭐ Likely cause"
          autoFocus
        />
      </div>
      <div className="field">
        <label htmlFor={runbookId}>Runbook</label>
        <input
          id={runbookId}
          value={values.runbook ?? ''}
          onChange={(event) => updateField('runbook', event.target.value)}
          placeholder="URL"
        />
      </div>
      <div className="field">
        <label htmlFor={ticketId}>Ticket</label>
        <input id={ticketId} value={values.ticket ?? ''} onChange={(event) => updateField('ticket', event.target.value)} placeholder="Incident or change ID" />
      </div>
      <div className="field">
        <label htmlFor={notesId}>Notes</label>
        <textarea id={notesId} value={values.notes ?? ''} onChange={(event) => updateField('notes', event.target.value)} rows={3} />
      </div>
    </DialogFrame>
  );
}

type DialogFrameProps = {
  title: string;
  description?: string;
  submitLabel: string;
  submitDisabled?: boolean;
  onSubmit: () => void;
  onClose: () => void;
  children: ReactNode;
};

function DialogFrame({ title, description, submitLabel, submitDisabled, onSubmit, onClose, children }: DialogFrameProps) {
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    function handleKey(event: KeyboardEvent) {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
      }
    }
    document.addEventListener('keydown', handleKey);
    return () => document.removeEventListener('keydown', handleKey);
  }, [onClose]);

  useEffect(() => {
    document.body.classList.add('dialog-open');
    return () => {
      document.body.classList.remove('dialog-open');
    };
  }, []);

  return (
    <div className="action-dialog-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <form
        className="action-dialog"
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        aria-describedby={description ? descriptionId : undefined}
        onSubmit={(event) => {
          event.preventDefault();
          onSubmit();
        }}
      >
        <header className="action-dialog__header">
          <h4 id={titleId}>{title}</h4>
          {description ? (
            <p id={descriptionId} className="action-dialog__description">
              {description}
            </p>
          ) : null}
        </header>
        <div className="action-dialog__body">{children}</div>
        <footer className="action-dialog__footer">
          <button type="button" className="btn-secondary" onClick={onClose}>
            Cancel
          </button>
          <button type="submit" className="btn-primary" disabled={submitDisabled}>
            {submitLabel}
          </button>
        </footer>
      </form>
    </div>
  );
}

function getNextPrimaryStatus(current: ActionStatus): ActionStatus {
  const index = PRIMARY_STATUS_FLOW.indexOf(current);
  if (index === -1) {
    return PRIMARY_STATUS_FLOW[0];
  }
  return PRIMARY_STATUS_FLOW[(index + 1) % PRIMARY_STATUS_FLOW.length];
}

function getMenuPosition(anchor: HTMLElement): MenuPosition {
  const rect = anchor.getBoundingClientRect();
  const estimatedWidth = 220;
  const padding = 12;
  const top = Math.min(window.innerHeight - padding, rect.bottom + 6);
  let left = rect.left;
  if (left + estimatedWidth > window.innerWidth - padding) {
    left = window.innerWidth - estimatedWidth - padding;
  }
  left = Math.max(padding, left);
  return { top, left };
}

function requiresRollbackPlan(item: ActionItem): boolean {
  const plan = item.changeControl?.rollbackPlan;
  const hasPlan = Boolean(plan && plan.trim().length > 0);
  return (item.risk === 'High' || item.changeControl?.required) && !hasPlan;
}

function requiresVerificationEvidence(item: ActionItem): boolean {
  if (!item.verification?.required) return false;
  const verification = item.verification;
  return !(
    verification.result &&
    verification.checkedBy && verification.checkedBy.trim().length > 0 &&
    verification.checkedAt && verification.checkedAt.trim().length > 0
  );
}

function formatDueAt(iso?: string | null): string {
  if (!iso) return 'ETA';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return 'ETA';
  return dueDateFormatter.format(date);
}

function isoToLocalInput(value?: string | null): string {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const offset = date.getTimezoneOffset() * 60000;
  const local = new Date(date.getTime() - offset);
  return local.toISOString().slice(0, 16);
}

function localInputToIso(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return null;
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString();
}

function appendNote(existing: string | null | undefined, note: string): string {
  if (!existing) return note;
  const trimmed = existing.trim();
  return trimmed ? `${trimmed}\n${note}` : note;
}

function uniqueList(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function normalizeLinks(values: ActionLinks): ActionLinks | undefined {
  const normalized: ActionLinks = {};
  if (values.hypothesisId && values.hypothesisId.trim()) {
    normalized.hypothesisId = values.hypothesisId.trim();
  }
  if (values.runbook && values.runbook.trim()) {
    normalized.runbook = values.runbook.trim();
  }
  if (values.ticket && values.ticket.trim()) {
    normalized.ticket = values.ticket.trim();
  }
  if (values.notes && values.notes.trim()) {
    normalized.notes = values.notes.trim();
  }
  return Object.keys(normalized).length ? normalized : undefined;
}

function readLikelyCauseId(): string | null {
  try {
    const raw = window.localStorage.getItem('kt-intake-full-v2');
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    const value = parsed?.likelyCauseId;
    if (typeof value === 'string') {
      const trimmed = value.trim();
      return trimmed ? trimmed : null;
    }
  } catch (error) {
    console.debug('Unable to read likely cause ID', error);
  }
  return null;
}

function isTypingEventTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) {
    return false;
  }
  const tag = target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA') {
    return true;
  }
  if (target.isContentEditable) {
    return true;
  }
  return Boolean(target.closest('[data-skip-shortcuts="true"]'));
}
