'use client';

import {
  BadgeCheck,
  ExternalLink,
  Eye,
  EyeOff,
  Loader2,
  Pencil,
  Plus,
  Trash2,
  X,
} from 'lucide-react';
import { useCallback, useState } from 'react';

import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { notifyProfileUpdated } from '@/lib/events';
import { useReorderPersist } from '@/lib/hooks/use-reorder-persist';
import { cn } from '@/lib/utils';

import { SortableCardList } from '../components/sortable-card-list';

import type { Certification } from '@/types';
import type { DateExtractor } from '../components/sortable-card-list';

const certificationDateExtractor: DateExtractor<Certification> = (cert) => ({
  start: cert.issueDate ? new Date(cert.issueDate) : null,
  end: cert.expirationDate ? new Date(cert.expirationDate) : null,
});

interface CertificationsSectionProps {
  certifications: Certification[];
  profileId: string;
  onUpdate: (certifications: Certification[]) => void;
  autoEditId?: string | 'new';
  onEditComplete?: () => void;
  /** When true, renders without Card wrapper for use inside accordion sections */
  embedded?: boolean;
}

const emptyCertification: Partial<Certification> = {
  name: '',
  issuer: '',
  credentialId: '',
  credentialUrl: '',
  issueDate: undefined,
  expirationDate: undefined,
};

export function CertificationsSection({
  certifications,
  onUpdate,
  autoEditId,
  onEditComplete,
  embedded,
}: CertificationsSectionProps) {
  const [isDialogOpen, setIsDialogOpen] = useState(!!autoEditId);
  const [editingCertification, setEditingCertification] = useState<Certification | null>(() => {
    if (autoEditId && autoEditId !== 'new') {
      return certifications.find((c) => c.id === autoEditId) ?? null;
    }
    return null;
  });
  const [formData, setFormData] = useState<Partial<Certification>>(() => {
    if (autoEditId && autoEditId !== 'new') {
      const c = certifications.find((c) => c.id === autoEditId);
      return c
        ? {
            ...c,
            issueDate: c.issueDate ? new Date(c.issueDate) : undefined,
            expirationDate: c.expirationDate ? new Date(c.expirationDate) : undefined,
          }
        : { ...emptyCertification };
    }
    return { ...emptyCertification };
  });
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const persistOrder = useReorderPersist<Certification>('certification', onUpdate);

  const handleReorder = useCallback(
    (reordered: Certification[]) => {
      persistOrder(reordered, certifications);
    },
    [persistOrder, certifications]
  );

  const toggleVisibility = async (certification: Certification) => {
    const newValue = !(certification.isVisible ?? true);
    // Optimistic update
    onUpdate(
      certifications.map((c) => (c.id === certification.id ? { ...c, isVisible: newValue } : c))
    );
    try {
      const response = await fetch(`/api/profile/certifications/${certification.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isVisible: newValue }),
      });
      if (!response.ok) throw new Error('Failed to update visibility');
      notifyProfileUpdated();
    } catch {
      // Revert on error
      onUpdate(
        certifications.map((c) => (c.id === certification.id ? { ...c, isVisible: !newValue } : c))
      );
    }
  };

  const handleDialogOpenChange = (open: boolean) => {
    setIsDialogOpen(open);
    if (!open && autoEditId) onEditComplete?.();
  };

  const handleOpenDialog = (certification?: Certification) => {
    if (certification) {
      setEditingCertification(certification);
      setFormData({
        ...certification,
        issueDate: certification.issueDate ? new Date(certification.issueDate) : undefined,
        expirationDate: certification.expirationDate
          ? new Date(certification.expirationDate)
          : undefined,
      });
    } else {
      setEditingCertification(null);
      setFormData(emptyCertification);
    }
    setError(null);
    setIsDialogOpen(true);
  };

  const handleSave = async () => {
    setIsLoading(true);
    setError(null);

    try {
      const payload = {
        name: formData.name,
        issuer: formData.issuer,
        credentialId: formData.credentialId || undefined,
        credentialUrl: formData.credentialUrl || undefined,
        issueDate: formData.issueDate || undefined,
        expirationDate: formData.expirationDate || undefined,
      };

      if (editingCertification) {
        const response = await fetch(`/api/profile/certifications/${editingCertification.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to update certification');
        }

        const { certification } = await response.json();
        const updatedCertifications = certifications.map((c) =>
          c.id === editingCertification.id ? certification : c
        );
        onUpdate(updatedCertifications);
      } else {
        const response = await fetch('/api/profile/certifications', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        });

        if (!response.ok) {
          const data = await response.json();
          throw new Error(data.error || 'Failed to create certification');
        }

        const { certification } = await response.json();
        onUpdate([...certifications, certification]);
      }

      setIsDialogOpen(false);
      setFormData(emptyCertification);
      setEditingCertification(null);
      if (autoEditId) onEditComplete?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDelete = async (certificationId: string) => {
    if (!confirm('Are you sure you want to delete this certification?')) return;

    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch(`/api/profile/certifications/${certificationId}`, {
        method: 'DELETE',
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || 'Failed to delete certification');
      }

      onUpdate(certifications.filter((c) => c.id !== certificationId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An error occurred');
    } finally {
      setIsLoading(false);
    }
  };

  const formatDate = (date: Date | string | null | undefined) => {
    if (!date) return '';
    const d = new Date(date);
    if (Number.isNaN(d.getTime())) return '';
    // Month-precision dates are stored as UTC; format in UTC to keep the month stable.
    return d.toLocaleDateString('en-US', { month: 'short', year: 'numeric', timeZone: 'UTC' });
  };

  const isExpired = (date: Date | string | null | undefined) => {
    if (!date) return false;
    return new Date(date) < new Date();
  };

  // ── Inline form (auto-edit mode) ──

  const renderInlineForm = () => (
    <div className="space-y-4 rounded-lg border-2 border-primary/30 bg-muted/30 p-4 shadow-md ring-2 ring-primary/10">
      <div className="flex items-center gap-2 rounded-md bg-primary/10 px-3 py-2 text-sm font-medium text-primary">
        <div className="h-2 w-2 animate-pulse rounded-full bg-primary" />
        {editingCertification ? 'Editing certification' : 'Adding new certification'} — save or
        discard to continue
      </div>

      {error && (
        <div className="rounded-md bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
      )}

      <div className="space-y-2">
        <Label>Certification Name *</Label>
        <Input
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          placeholder="AWS Solutions Architect"
        />
      </div>

      <div className="space-y-2">
        <Label>Issuing Organization *</Label>
        <Input
          value={formData.issuer || ''}
          onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
          placeholder="Amazon Web Services"
        />
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label>Issue Date</Label>
          <Input
            type="date"
            value={
              formData.issueDate ? new Date(formData.issueDate).toISOString().split('T')[0] : ''
            }
            onChange={(e) =>
              setFormData({
                ...formData,
                issueDate: e.target.value ? new Date(e.target.value) : undefined,
              })
            }
          />
        </div>
        <div className="space-y-2">
          <Label>Expiration Date</Label>
          <Input
            type="date"
            value={
              formData.expirationDate
                ? new Date(formData.expirationDate).toISOString().split('T')[0]
                : ''
            }
            onChange={(e) =>
              setFormData({
                ...formData,
                expirationDate: e.target.value ? new Date(e.target.value) : undefined,
              })
            }
          />
          <p className="text-xs text-muted-foreground">Leave empty if no expiration</p>
        </div>
      </div>

      <div className="space-y-2">
        <Label>Credential ID</Label>
        <Input
          value={formData.credentialId || ''}
          onChange={(e) => setFormData({ ...formData, credentialId: e.target.value })}
          placeholder="ABC123XYZ"
        />
      </div>

      <div className="space-y-2">
        <Label>Credential URL</Label>
        <Input
          type="url"
          value={formData.credentialUrl || ''}
          onChange={(e) => setFormData({ ...formData, credentialUrl: e.target.value })}
          placeholder="https://verify.example.com/..."
        />
      </div>

      <div className="flex items-center gap-2 border-t pt-4">
        <Button
          onClick={handleSave}
          disabled={isLoading || !formData.name || !formData.issuer}
          size="sm"
          className="gap-2"
        >
          {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          {isLoading ? 'Saving...' : 'Save'}
        </Button>
        <Button
          variant="outline"
          size="sm"
          onClick={() => onEditComplete?.()}
          disabled={isLoading}
          className="gap-2"
        >
          <X className="mr-1 h-4 w-4" />
          Discard
        </Button>
      </div>
    </div>
  );

  // Auto-edit mode: render only the inline form
  if (autoEditId) {
    return renderInlineForm();
  }

  const addButton = (
    <Button onClick={() => handleOpenDialog()} size={embedded ? 'sm' : 'default'} className="gap-2">
      <Plus className="h-4 w-4" />
      Add Certification
    </Button>
  );

  const certificationsList = (
    <div className={cn(!embedded && 'rounded-xl bg-muted/40 p-4')}>
      {certifications.length === 0 ? (
        <div className="rounded-lg border border-dashed p-8 text-center">
          <BadgeCheck className="mx-auto h-12 w-12 text-muted-foreground/50" />
          <h3 className="mt-4 font-medium">No certifications added yet</h3>
          <p className="mt-2 text-sm text-muted-foreground">
            Add certifications to showcase your professional credentials
          </p>
          <Button onClick={() => handleOpenDialog()} className="mt-4 gap-2">
            <Plus className="h-4 w-4" />
            Add Certification
          </Button>
        </div>
      ) : (
        <SortableCardList
          items={certifications}
          onReorder={handleReorder}
          dateExtractor={certificationDateExtractor}
          disabled={isLoading}
          renderItem={(certification) => (
            <div
              className={cn(
                'group flex items-start gap-4 rounded-lg border p-4 transition-colors hover:bg-muted/50',
                certification.isVisible === false && 'opacity-50'
              )}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/10">
                <BadgeCheck className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h4 className="font-medium">{certification.name}</h4>
                    <p className="text-sm text-muted-foreground">{certification.issuer}</p>
                  </div>
                  <div className="flex items-center gap-1 opacity-0 transition-opacity group-hover:opacity-100">
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => toggleVisibility(certification)}
                      title={
                        certification.isVisible === false ? 'Show on resume' : 'Hide from resume'
                      }
                    >
                      {certification.isVisible === false ? (
                        <EyeOff className="h-4 w-4" />
                      ) : (
                        <Eye className="h-4 w-4" />
                      )}
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8"
                      onClick={() => handleOpenDialog(certification)}
                      title="Edit"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="ghost"
                      size="icon"
                      className="h-8 w-8 text-destructive hover:text-destructive"
                      onClick={() => handleDelete(certification.id)}
                      title="Delete"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
                <div className="mt-1 flex items-center gap-2 text-xs text-muted-foreground">
                  {certification.issueDate && (
                    <span>Issued {formatDate(certification.issueDate)}</span>
                  )}
                  {certification.expirationDate && (
                    <>
                      <span>•</span>
                      <span
                        className={
                          isExpired(certification.expirationDate) ? 'text-destructive' : ''
                        }
                      >
                        {isExpired(certification.expirationDate) ? 'Expired' : 'Expires'}{' '}
                        {formatDate(certification.expirationDate)}
                      </span>
                    </>
                  )}
                  {!certification.expirationDate && certification.issueDate && (
                    <>
                      <span>•</span>
                      <span className="text-green-600">No expiration</span>
                    </>
                  )}
                </div>
                {certification.credentialId && (
                  <p className="mt-1 text-xs text-muted-foreground">
                    Credential ID: {certification.credentialId}
                  </p>
                )}
                {certification.credentialUrl && (
                  <a
                    href={certification.credentialUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 text-xs text-primary hover:underline"
                  >
                    Verify credential <ExternalLink className="h-3 w-3" />
                  </a>
                )}
              </div>
            </div>
          )}
        />
      )}
    </div>
  );

  const dialog = (
    <Dialog open={isDialogOpen} onOpenChange={handleDialogOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {editingCertification ? 'Edit Certification' : 'Add Certification'}
          </DialogTitle>
        </DialogHeader>
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <Label htmlFor="name">Certification Name *</Label>
            <Input
              id="name"
              value={formData.name || ''}
              onChange={(e) => setFormData({ ...formData, name: e.target.value })}
              placeholder="AWS Solutions Architect"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="issuer">Issuing Organization *</Label>
            <Input
              id="issuer"
              value={formData.issuer || ''}
              onChange={(e) => setFormData({ ...formData, issuer: e.target.value })}
              placeholder="Amazon Web Services"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="issueDate">Issue Date</Label>
              <Input
                id="issueDate"
                type="date"
                value={
                  formData.issueDate ? new Date(formData.issueDate).toISOString().split('T')[0] : ''
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    issueDate: e.target.value ? new Date(e.target.value) : undefined,
                  })
                }
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="expirationDate">Expiration Date</Label>
              <Input
                id="expirationDate"
                type="date"
                value={
                  formData.expirationDate
                    ? new Date(formData.expirationDate).toISOString().split('T')[0]
                    : ''
                }
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    expirationDate: e.target.value ? new Date(e.target.value) : undefined,
                  })
                }
              />
              <p className="text-xs text-muted-foreground">Leave empty if no expiration</p>
            </div>
          </div>

          <div className="space-y-2">
            <Label htmlFor="credentialId">Credential ID</Label>
            <Input
              id="credentialId"
              value={formData.credentialId || ''}
              onChange={(e) => setFormData({ ...formData, credentialId: e.target.value })}
              placeholder="ABC123XYZ"
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="credentialUrl">Credential URL</Label>
            <Input
              id="credentialUrl"
              type="url"
              value={formData.credentialUrl || ''}
              onChange={(e) => setFormData({ ...formData, credentialUrl: e.target.value })}
              placeholder="https://verify.example.com/..."
            />
          </div>

          {error && (
            <div className="rounded-lg bg-destructive/10 p-3 text-sm text-destructive">{error}</div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => setIsDialogOpen(false)}>
            Cancel
          </Button>
          <Button onClick={handleSave} disabled={isLoading || !formData.name || !formData.issuer}>
            {isLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
            {editingCertification ? 'Save Changes' : 'Add Certification'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );

  if (embedded) {
    return (
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">
            Add professional certifications and licenses
          </p>
          {addButton}
        </div>
        {certificationsList}
        {dialog}
      </div>
    );
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>Certifications</CardTitle>
            <CardDescription>Add professional certifications and licenses</CardDescription>
          </div>
          {addButton}
        </div>
      </CardHeader>
      <CardContent>
        {certificationsList}
        {dialog}
      </CardContent>
    </Card>
  );
}
