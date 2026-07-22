'use client';

import { useEffect, useMemo, useState } from 'react';

import { ONBOARDING_CARD_DESCRIPTION, ONBOARDING_CARD_TITLE } from '@/lib/onboarding-ui';
import { isPortfolioEnabled } from '@/lib/features';
import { ONBOARDING_TEMPLATE_KEY } from '@/lib/portfolio/templates/onboarding';
import { getAllTemplates, getDefaultTemplateId } from '@/lib/portfolio/templates/registry';

import { TemplateOptionCard, type TemplateOption } from './template-option-card';

export { ONBOARDING_TEMPLATE_KEY };

/**
 * Template chooser for onboarding. Self-managing: persists the selection to
 * sessionStorage (writing the default on mount if unset) so complete can read
 * it without the host threading state.
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
  if (!isPortfolioEnabled() || templates.length < 2) return null;

  return (
    <div className="space-y-3 text-left">
      <div>
        <h3 className={ONBOARDING_CARD_TITLE}>Pick a starting style</h3>
        <p className={`mt-1 ${ONBOARDING_CARD_DESCRIPTION}`}>
          Choose a look for your portfolio. You can switch anytime from your dashboard.
        </p>
      </div>
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
