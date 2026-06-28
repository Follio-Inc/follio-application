'use client';

import { useEffect, useMemo, useState } from 'react';

import { ONBOARDING_TEMPLATE_KEY } from '@/lib/portfolio/templates/onboarding';
import { getAllTemplates, getDefaultTemplateId } from '@/lib/portfolio/templates/registry';

import { TemplateOptionCard, type TemplateOption } from './template-option-card';

export { ONBOARDING_TEMPLATE_KEY };

/**
 * Template chooser shown during onboarding. Self-managing: it persists the
 * selection to sessionStorage (writing the default on mount if unset) so the
 * choice survives the import → review → complete handoff without the host
 * component needing to thread state through.
 */
export function OnboardingTemplateChoice() {
  const templates: TemplateOption[] = useMemo(
    () =>
      getAllTemplates().map((t) => ({
        id: t.id,
        name: t.name,
        description: t.description,
        tags: t.tags,
        accentColors: t.compatibleAccentColors,
      })),
    []
  );

  const [selected, setSelected] = useState<string | null>(null);

  // Initialise from sessionStorage (or default) and ensure a value is persisted.
  useEffect(() => {
    let initial: string | null = null;
    try {
      initial = sessionStorage.getItem(ONBOARDING_TEMPLATE_KEY);
    } catch {
      // sessionStorage unavailable — fall back to default
    }
    if (!initial || !templates.some((t) => t.id === initial)) {
      initial = getDefaultTemplateId();
      try {
        sessionStorage.setItem(ONBOARDING_TEMPLATE_KEY, initial);
      } catch {
        // ignore
      }
    }
    setSelected(initial);
  }, [templates]);

  const handleSelect = (templateId: string) => {
    setSelected(templateId);
    try {
      sessionStorage.setItem(ONBOARDING_TEMPLATE_KEY, templateId);
    } catch {
      // ignore
    }
  };

  // With only one template there's nothing to choose.
  if (templates.length < 2) return null;

  return (
    <div className="space-y-3 text-left">
      <div>
        <h3 className="text-sm font-semibold">Pick a starting style</h3>
        <p className="text-xs text-muted-foreground">
          Choose a look for your portfolio. You can switch anytime from your dashboard.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        {templates.map((template) => (
          <TemplateOptionCard
            key={template.id}
            template={template}
            selected={selected === template.id}
            onSelect={handleSelect}
          />
        ))}
      </div>
    </div>
  );
}
