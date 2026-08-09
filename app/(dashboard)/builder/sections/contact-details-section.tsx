'use client';

import {
  closestCenter,
  DndContext,
  type DragEndEvent,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
} from '@dnd-kit/core';
import { restrictToParentElement, restrictToVerticalAxis } from '@dnd-kit/modifiers';
import {
  arrayMove,
  SortableContext,
  sortableKeyboardCoordinates,
  useSortable,
  verticalListSortingStrategy,
} from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import {
  BookOpen,
  Code,
  Eye,
  EyeOff,
  Github,
  Globe,
  GripVertical,
  Hash,
  Linkedin,
  Link as LinkIcon,
  Mail,
  MapPin,
  Newspaper,
  Paintbrush,
  Phone,
  Plus,
  Trash2,
  Twitter,
  Youtube,
} from 'lucide-react';
import { useCallback, useId, useMemo, useRef, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { notifyProfileUpdated } from '@/lib/events';
import { cn } from '@/lib/utils';

import type { FullProfile, Link } from '@/types';

// ──────────────────────────────────────────────
// Constants
// ──────────────────────────────────────────────

type EntryKind = 'location' | 'email' | 'phone' | 'link';

interface ContactEntry {
  id: string;
  kind: EntryKind;
  label: string;
  value: string;
  isVisible: boolean;
  linkType?: string;
  linkId?: string;
  placeholder: string;
  removable: boolean;
}

/** Icon mapping for link types */
const LINK_TYPE_CONFIG: Record<
  string,
  { label: string; icon: React.ComponentType<{ className?: string }>; placeholder: string }
> = {
  GITHUB: { label: 'GitHub', icon: Github, placeholder: 'https://github.com/username' },
  LINKEDIN: { label: 'LinkedIn', icon: Linkedin, placeholder: 'https://linkedin.com/in/username' },
  TWITTER: { label: 'Twitter / X', icon: Twitter, placeholder: 'https://x.com/username' },
  PORTFOLIO: { label: 'Website', icon: Globe, placeholder: 'https://yoursite.com' },
  BLOG: { label: 'Blog', icon: BookOpen, placeholder: 'https://yourblog.com' },
  DRIBBBLE: { label: 'Dribbble', icon: Paintbrush, placeholder: 'https://dribbble.com/username' },
  BEHANCE: { label: 'Behance', icon: Globe, placeholder: 'https://behance.net/username' },
  YOUTUBE: { label: 'YouTube', icon: Youtube, placeholder: 'https://youtube.com/@channel' },
  MEDIUM: { label: 'Medium', icon: BookOpen, placeholder: 'https://medium.com/@username' },
  SUBSTACK: { label: 'Substack', icon: Newspaper, placeholder: 'https://username.substack.com' },
  HASHNODE: { label: 'Hashnode', icon: Hash, placeholder: 'https://hashnode.com/@username' },
  DEVTO: { label: 'Dev.to', icon: Code, placeholder: 'https://dev.to/username' },
  OTHER: { label: 'Other', icon: LinkIcon, placeholder: 'https://example.com' },
};

/** Kind-level icon mapping for non-link entries */
const KIND_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  location: MapPin,
  email: Mail,
  phone: Phone,
};

/** Quick-add button definitions — link types the user can add */
const QUICK_ADD_OPTIONS = [
  { type: 'GITHUB', label: 'GitHub', icon: Github },
  { type: 'TWITTER', label: 'Twitter / X', icon: Twitter },
  { type: 'PORTFOLIO', label: 'Website', icon: Globe },
  { type: 'MEDIUM', label: 'Medium', icon: BookOpen },
  { type: 'YOUTUBE', label: 'YouTube', icon: Youtube },
  { type: 'BLOG', label: 'Blog', icon: BookOpen },
  { type: 'DRIBBBLE', label: 'Dribbble', icon: Paintbrush },
  { type: 'DEVTO', label: 'Dev.to', icon: Code },
  { type: 'HASHNODE', label: 'Hashnode', icon: Hash },
  { type: 'SUBSTACK', label: 'Substack', icon: Newspaper },
  { type: 'OTHER', label: 'Other', icon: LinkIcon },
] as const;

// ──────────────────────────────────────────────
// Entry builder
// ──────────────────────────────────────────────

function buildEntries(profile: FullProfile): ContactEntry[] {
  const contactInfo = profile.contactInfo as Record<string, unknown> | null;
  const storedOrder = (contactInfo?.headerFieldsOrder as string[] | undefined) ?? null;

  const entries: ContactEntry[] = [];
  entries.push({
    id: 'location',
    kind: 'location',
    label: 'Location',
    value: profile.location || '',
    isVisible: (contactInfo?.locationPublic as boolean) ?? true,
    placeholder: 'San Francisco, CA',
    removable: false,
  });
  entries.push({
    id: 'email',
    kind: 'email',
    label: 'Email',
    value: (contactInfo?.email as string) || '',
    isVisible: (contactInfo?.emailPublic as boolean) || false,
    placeholder: 'you@example.com',
    removable: false,
  });
  entries.push({
    id: 'phone',
    kind: 'phone',
    label: 'Phone',
    value: (contactInfo?.phoneNumber as string) || (contactInfo?.phone as string) || '',
    isVisible: (contactInfo?.phonePublic as boolean) || false,
    placeholder: '+1 (555) 123-4567',
    removable: false,
  });

  const linkedInLink = profile.links.find((l) => l.type === 'LINKEDIN');
  entries.push({
    id: linkedInLink?.id || 'placeholder-LINKEDIN',
    kind: 'link',
    linkType: 'LINKEDIN',
    linkId: linkedInLink?.id,
    label: 'LinkedIn',
    value: linkedInLink?.url || '',
    isVisible: linkedInLink?.isVisible ?? true,
    placeholder: 'https://linkedin.com/in/username',
    removable: false,
  });

  const otherLinks = profile.links
    .filter((l) => l.type !== 'LINKEDIN')
    .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0));

  for (const link of otherLinks) {
    const config = LINK_TYPE_CONFIG[link.type];
    entries.push({
      id: link.id,
      kind: 'link',
      linkType: link.type,
      linkId: link.id,
      label: link.label || config?.label || 'Link',
      value: link.url,
      isVisible: link.isVisible ?? true,
      placeholder: config?.placeholder || 'https://example.com',
      removable: true,
    });
  }

  // Apply stored order if present (drag-and-drop order persisted by user)
  if (storedOrder && storedOrder.length > 0) {
    const byId = new Map<string, ContactEntry>();
    for (const e of entries) {
      byId.set(e.id, e);
    }
    const ordered: ContactEntry[] = [];
    const seen = new Set<string>();
    for (const orderId of storedOrder) {
      const entry = byId.get(orderId);
      if (entry && !seen.has(entry.id)) {
        ordered.push(entry);
        seen.add(entry.id);
      }
    }
    for (const e of entries) {
      if (!seen.has(e.id)) ordered.push(e);
    }
    return ordered;
  }

  return entries;
}

// ──────────────────────────────────────────────
// Sortable entry row
// ──────────────────────────────────────────────

interface SortableEntryRowProps {
  entry: ContactEntry;
  onValueChange: (value: string) => void;
  onVisibilityToggle: () => void;
  onRemove?: () => void;
  onBlur?: () => void;
  /** Whether this kind supports visibility toggle */
  hasVisibilityToggle: boolean;
  /** data-entry-id forwarded from the parent list */
  'data-entry-id'?: string;
}

function SortableEntryRow({
  entry,
  onValueChange,
  onVisibilityToggle,
  onRemove,
  onBlur,
  hasVisibilityToggle,
  'data-entry-id': dataEntryId,
}: SortableEntryRowProps) {
  const {
    attributes,
    listeners,
    setNodeRef,
    setActivatorNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({
    id: entry.id,
  });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
  };

  const Icon =
    entry.kind === 'link'
      ? LINK_TYPE_CONFIG[entry.linkType || 'OTHER']?.icon || LinkIcon
      : KIND_ICONS[entry.kind] || LinkIcon;

  return (
    <div
      ref={setNodeRef}
      style={style}
      data-entry-id={dataEntryId}
      className={cn(
        'group flex items-center gap-1.5 rounded-xl bg-background px-2.5 py-1.5 transition-colors',
        isDragging && 'z-50 bg-background shadow-md',
        !isDragging && 'hover:bg-background/80'
      )}
    >
      {/* Drag handle */}
      <button
        ref={setActivatorNodeRef}
        type="button"
        className="flex shrink-0 cursor-grab touch-none items-center text-muted-foreground/30 opacity-0 transition-opacity hover:text-muted-foreground focus-visible:opacity-100 active:cursor-grabbing group-hover:opacity-100"
        {...attributes}
        {...listeners}
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>

      {/* Type icon + label */}
      <div className="flex w-[5.5rem] shrink-0 items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-muted-foreground/70" />
        <span className="truncate text-xs text-muted-foreground">{entry.label}</span>
      </div>

      {/* Value input */}
      <Input
        value={entry.value}
        onChange={(e) => onValueChange(e.target.value)}
        onBlur={onBlur}
        placeholder={entry.placeholder}
        className="h-8 flex-1 border-0 bg-transparent px-1.5 text-sm shadow-none focus-visible:ring-0"
      />

      {/* Visibility toggle — right side, before remove */}
      {hasVisibilityToggle ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onVisibilityToggle}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md transition-colors hover:bg-accent"
              tabIndex={-1}
            >
              {entry.isVisible ? (
                <Eye className="h-3.5 w-3.5 text-primary" />
              ) : (
                <EyeOff className="h-3.5 w-3.5 text-muted-foreground/45" />
              )}
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            {entry.isVisible ? 'Visible on resume' : 'Hidden from resume'}
          </TooltipContent>
        </Tooltip>
      ) : (
        <div className="h-6 w-6 shrink-0" />
      )}

      {/* Remove button (only for removable entries, shown on hover) */}
      {entry.removable ? (
        <Tooltip>
          <TooltipTrigger asChild>
            <button
              type="button"
              onClick={onRemove}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-muted-foreground/30 opacity-0 transition-opacity hover:bg-accent hover:text-destructive focus-visible:opacity-100 group-hover:opacity-100"
              tabIndex={-1}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="top" className="text-xs">
            Remove
          </TooltipContent>
        </Tooltip>
      ) : (
        <div className="h-6 w-6 shrink-0" />
      )}
    </div>
  );
}

// ──────────────────────────────────────────────
// Main component
// ──────────────────────────────────────────────

interface ContactDetailsSectionProps {
  profile: FullProfile;
  onProfileUpdate: (data: Partial<FullProfile>) => void;
  onContactUpdate: (data: Record<string, unknown>) => void;
  onLinksUpdate: (links: Link[]) => void;
}

export function ContactDetailsSection({
  profile,
  onProfileUpdate,
  onContactUpdate,
  onLinksUpdate,
}: ContactDetailsSectionProps) {
  const dndId = useId();
  const [entries, setEntries] = useState<ContactEntry[]>(() => buildEntries(profile));
  const savingLinkIds = useRef<Set<string>>(new Set());

  // Debounce refs for link saves
  const linkSaveTimers = useRef<Map<string, NodeJS.Timeout>>(new Map());

  // dnd-kit sensors
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  const entryIds = useMemo(() => entries.map((e) => e.id), [entries]);

  // ── Compute which link types are already in use ──
  const usedLinkTypes = useMemo(() => {
    const types = new Set<string>();
    for (const entry of entries) {
      if (entry.kind === 'link' && entry.linkType) {
        types.add(entry.linkType);
      }
    }
    return types;
  }, [entries]);

  const availableQuickAdds = useMemo(
    () => QUICK_ADD_OPTIONS.filter((opt) => !usedLinkTypes.has(opt.type)),
    [usedLinkTypes]
  );

  // ── Value change handlers ──

  const handleValueChange = useCallback(
    (entryId: string, kind: EntryKind, newValue: string) => {
      setEntries((prev) => prev.map((e) => (e.id === entryId ? { ...e, value: newValue } : e)));

      switch (kind) {
        case 'location':
          onProfileUpdate({ location: newValue });
          break;
        case 'email':
          onContactUpdate({ email: newValue });
          break;
        case 'phone':
          onContactUpdate({ phone: newValue, phoneNumber: newValue });
          break;
        case 'link':
          // Link saves are debounced on blur — no draft update needed
          break;
      }
    },
    [onProfileUpdate, onContactUpdate]
  );

  // ── Link CRUD ──

  const saveLink = useCallback(
    async (entry: ContactEntry) => {
      if (!entry.value.trim()) return;

      const isPlaceholder = entry.id.startsWith('placeholder-');

      try {
        savingLinkIds.current.add(entry.id);

        if (isPlaceholder && entry.linkType) {
          // Create new link
          const label = LINK_TYPE_CONFIG[entry.linkType]?.label || 'Link';
          const response = await fetch('/api/profile/links', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ type: entry.linkType, url: entry.value, label }),
          });
          if (!response.ok) throw new Error('Failed to create link');
          const { link } = (await response.json()) as { link: Link };

          // Update entry with real ID
          setEntries((prev) =>
            prev.map((e) => (e.id === entry.id ? { ...e, id: link.id, linkId: link.id } : e))
          );

          // Update parent state
          onLinksUpdate([...profile.links, link]);
          notifyProfileUpdated();
        } else if (entry.linkId) {
          // Capture the server's current value so we can revert the input if the save fails.
          const previousValue = profile.links.find((l) => l.id === entry.linkId)?.url ?? '';

          // Update existing link
          const response = await fetch(`/api/profile/links/${entry.linkId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url: entry.value }),
          });
          if (!response.ok) {
            // Restore the last-known-good value so the UI never claims an unsaved edit persisted.
            setEntries((prev) =>
              prev.map((e) => (e.id === entry.id ? { ...e, value: previousValue } : e))
            );
            throw new Error('Failed to update link');
          }
          const { link } = (await response.json()) as { link: Link };

          // Update parent state
          const updatedLinks = profile.links.map((l) => (l.id === link.id ? link : l));
          onLinksUpdate(updatedLinks);
          notifyProfileUpdated();
        }
      } catch (error) {
        console.error('Failed to save link:', error);
      } finally {
        savingLinkIds.current.delete(entry.id);
      }
    },
    [profile.links, onLinksUpdate]
  );

  const handleLinkBlur = useCallback(
    (entry: ContactEntry) => {
      // Clear any pending debounce
      const existing = linkSaveTimers.current.get(entry.id);
      if (existing) clearTimeout(existing);

      // Save after a short delay to handle tab-away vs clicking another input
      const timer = setTimeout(() => {
        const currentEntry = entries.find((e) => e.id === entry.id);
        if (currentEntry && currentEntry.value.trim()) {
          saveLink(currentEntry);
        }
      }, 300);
      linkSaveTimers.current.set(entry.id, timer);
    },
    [entries, saveLink]
  );

  const handleRemoveLink = useCallback(
    async (entry: ContactEntry) => {
      if (!entry.linkId) return;

      // Optimistic removal
      const prevEntries = [...entries];
      setEntries((prev) => prev.filter((e) => e.id !== entry.id));

      try {
        const response = await fetch(`/api/profile/links/${entry.linkId}`, {
          method: 'DELETE',
        });
        if (!response.ok) throw new Error('Failed to delete link');

        // Update parent state
        const updatedLinks = profile.links.filter((l) => l.id !== entry.linkId);
        onLinksUpdate(updatedLinks);
        notifyProfileUpdated();
      } catch {
        // Revert on error
        setEntries(prevEntries);
      }
    },
    [entries, profile.links, onLinksUpdate]
  );

  // ── Visibility toggles ──

  const handleVisibilityToggle = useCallback(
    async (entry: ContactEntry) => {
      const newVisible = !entry.isVisible;

      setEntries((prev) =>
        prev.map((e) => (e.id === entry.id ? { ...e, isVisible: newVisible } : e))
      );

      try {
        if (entry.kind === 'email' || entry.kind === 'phone' || entry.kind === 'location') {
          const fieldMap: Record<string, string> = {
            email: 'emailPublic',
            phone: 'phonePublic',
            location: 'locationPublic',
          };
          const field = fieldMap[entry.kind];
          onContactUpdate({ [field]: newVisible });
          const res = await fetch('/api/profile/contact', {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ [field]: newVisible }),
          });
          if (!res.ok) {
            // Roll back the optimistic builder-store update before surfacing the error.
            onContactUpdate({ [field]: !newVisible });
            throw new Error(`Failed to update ${entry.kind} visibility`);
          }
          notifyProfileUpdated();
        } else if (entry.kind === 'link' && entry.linkId) {
          const res = await fetch(`/api/profile/links/${entry.linkId}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ isVisible: newVisible }),
          });
          if (!res.ok) throw new Error('Failed to update link visibility');

          const updatedLinks = profile.links.map((l) =>
            l.id === entry.linkId ? { ...l, isVisible: newVisible } : l
          );
          onLinksUpdate(updatedLinks);
          notifyProfileUpdated();
        }
      } catch {
        setEntries((prev) =>
          prev.map((e) => (e.id === entry.id ? { ...e, isVisible: !newVisible } : e))
        );
      }
    },
    [profile.links, onContactUpdate, onLinksUpdate]
  );

  // ── Drag and drop reorder ──

  const handleDragEnd = useCallback(
    (event: DragEndEvent) => {
      const { active, over } = event;
      if (!over || active.id === over.id) return;

      // Compute the reordered list (pure, no side effects)
      const oldIndex = entries.findIndex((e) => e.id === (active.id as string));
      const newIndex = entries.findIndex((e) => e.id === (over.id as string));
      if (oldIndex === -1 || newIndex === -1) return;

      // Snapshot the pre-reorder state so we can roll back if persistence fails.
      const previousEntries = entries;
      const previousOrderIds = entries.map((e) => e.id);

      const reordered = arrayMove(entries, oldIndex, newIndex);

      // 1. Update local UI state
      setEntries(reordered);

      // 2. Sync order to the builder store so the preview updates in real-time
      const orderIds = reordered.map((e) => e.id);
      onContactUpdate({ headerFieldsOrder: orderIds });

      // Roll back both local state and the builder store on failure.
      const rollback = () => {
        setEntries(previousEntries);
        onContactUpdate({ headerFieldsOrder: previousOrderIds });
      };

      // 3. Persist to API
      fetch('/api/profile/contact', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ headerFieldsOrder: orderIds }),
      })
        .then((res) => {
          if (!res.ok) throw new Error('Failed to persist header order');
          notifyProfileUpdated();
        })
        .catch((err) => {
          console.error('Failed to persist header order:', err);
          rollback();
        });

      // Persist link sortOrder for links (keeps link entity order in sync)
      const linkEntries = reordered
        .filter((e) => e.kind === 'link' && e.linkId)
        .map((e, idx) => ({ id: e.linkId!, sortOrder: idx }));

      if (linkEntries.length > 0) {
        fetch('/api/profile/reorder', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ model: 'link', items: linkEntries }),
        })
          .then((res) => {
            if (!res.ok) throw new Error('Failed to persist link order');
            notifyProfileUpdated();
          })
          .catch((err) => console.error('Failed to persist link order:', err));
      }
    },
    [entries, onContactUpdate]
  );

  // ── Quick add ──

  const handleQuickAdd = useCallback(
    async (linkType: string) => {
      const config = LINK_TYPE_CONFIG[linkType] || LINK_TYPE_CONFIG.OTHER;
      const tempId = `new-${linkType}-${Date.now()}`;

      // Add entry with temporary ID
      const newEntry: ContactEntry = {
        id: tempId,
        kind: 'link',
        linkType,
        label: config.label,
        value: '',
        isVisible: true,
        placeholder: config.placeholder,
        removable: true,
      };

      setEntries((prev) => [...prev, newEntry]);

      // Create the link entity immediately (with empty URL — user will fill in)
      try {
        const response = await fetch('/api/profile/links', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: linkType,
            url: '',
            label: config.label,
          }),
        });

        if (!response.ok) throw new Error('Failed to create link');
        const { link } = (await response.json()) as { link: Link };

        // Replace temp entry with real entity
        setEntries((prev) =>
          prev.map((e) => (e.id === tempId ? { ...e, id: link.id, linkId: link.id } : e))
        );

        onLinksUpdate([...profile.links, link]);
        notifyProfileUpdated();

        // Focus the new input after a tick
        setTimeout(() => {
          const input = document.querySelector(
            `[data-entry-id="${link.id}"] input`
          ) as HTMLInputElement | null;
          input?.focus();
        }, 100);
      } catch {
        // Remove the temp entry on failure
        setEntries((prev) => prev.filter((e) => e.id !== tempId));
      }
    },
    [profile.links, onLinksUpdate]
  );

  // ── Sync entries when profile changes externally ──
  // (e.g., after import, undo/redo, or link add/remove)
  const profileLinksRef = useRef(profile.links);
  const profileContactRef = useRef(profile.contactInfo);

  if (
    profile.links !== profileLinksRef.current ||
    profile.contactInfo !== profileContactRef.current
  ) {
    profileLinksRef.current = profile.links;
    profileContactRef.current = profile.contactInfo;

    const freshEntries = buildEntries(profile);
    const currentIds = new Set(entries.map((e) => e.id));

    const merged: ContactEntry[] = [];
    for (const existing of entries) {
      const fresh = freshEntries.find((f) => f.id === existing.id);
      if (fresh) {
        merged.push({ ...existing, value: fresh.value, isVisible: fresh.isVisible });
      } else if (existing.id.startsWith('new-') || existing.id.startsWith('placeholder-')) {
        merged.push(existing);
      }
    }
    for (const fresh of freshEntries) {
      if (!currentIds.has(fresh.id)) {
        merged.push(fresh);
      }
    }

    const mergedIds = merged.map((e) => e.id).join(',');
    const currentIdStr = entries.map((e) => e.id).join(',');
    const mergedVis = merged.map((e) => `${e.id}:${e.isVisible}`).join(',');
    const currentVis = entries.map((e) => `${e.id}:${e.isVisible}`).join(',');

    if (mergedIds !== currentIdStr || mergedVis !== currentVis) {
      setEntries(merged);
    }
  }

  return (
    <div className="space-y-3">
      <p className="text-eyebrow">Contact &amp; Links</p>

      {/* Sortable entry list — soft nested surfaces, no borders */}
      <DndContext
        id={dndId}
        sensors={sensors}
        collisionDetection={closestCenter}
        modifiers={[restrictToVerticalAxis, restrictToParentElement]}
        onDragEnd={handleDragEnd}
      >
        <SortableContext items={entryIds} strategy={verticalListSortingStrategy}>
          <div className="space-y-2">
            {entries.map((entry) => (
              <SortableEntryRow
                key={entry.id}
                data-entry-id={entry.id}
                entry={entry}
                onValueChange={(val) => handleValueChange(entry.id, entry.kind, val)}
                onVisibilityToggle={() => handleVisibilityToggle(entry)}
                onRemove={entry.removable ? () => handleRemoveLink(entry) : undefined}
                onBlur={entry.kind === 'link' ? () => handleLinkBlur(entry) : undefined}
                hasVisibilityToggle
              />
            ))}
          </div>
        </SortableContext>
      </DndContext>

      {/* Quick add — quiet ghost chips */}
      {availableQuickAdds.length > 0 && (
        <div className="flex flex-wrap items-center gap-1 pt-0.5">
          <span className="mr-1 text-[11px] text-muted-foreground/70">Add</span>
          {availableQuickAdds.map((option) => {
            const Icon = option.icon;
            return (
              <Button
                key={option.type}
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground hover:text-foreground"
                onClick={() => handleQuickAdd(option.type)}
              >
                <Plus className="h-3 w-3 opacity-60" />
                <Icon className="h-3 w-3" />
                {option.label}
              </Button>
            );
          })}
        </div>
      )}
    </div>
  );
}
