/**
 * Portfolio Template Registry
 *
 * Two-tier registry:
 * 1. META_REGISTRY — Metadata only; safe for server-side services and scripts
 *    (no CSS, no React components). Always available.
 * 2. KIT_REGISTRY — Full kits including the React Component. Populated lazily
 *    on first access (client or Next.js bundler contexts that support CSS imports).
 */

import type { TemplateKit, TemplateKitMeta } from './types';

// ============================================================================
// META REGISTRY  (lightweight, no CSS / React)
// ============================================================================

import { META as devDarkMeta } from './developer-dark/meta';

const META_REGISTRY = new Map<string, TemplateKitMeta>();
META_REGISTRY.set(devDarkMeta.id, devDarkMeta);

/**
 * Get template metadata by ID (no CSS/React dependency).
 */
export function getTemplateMeta(templateId: string): TemplateKitMeta | null {
  return META_REGISTRY.get(templateId) ?? null;
}

/**
 * Get metadata for all registered templates.
 */
export function getAllTemplates(): TemplateKitMeta[] {
  return Array.from(META_REGISTRY.values());
}

/**
 * Get the default template ID.
 */
export function getDefaultTemplateId(): string {
  const first = META_REGISTRY.keys().next();
  if (first.done) {
    throw new Error('No templates registered');
  }
  return first.value;
}

// ============================================================================
// FULL KIT REGISTRY  (includes React Component + CSS)
// ============================================================================

let KIT_REGISTRY: Map<string, TemplateKit> | null = null;

function ensureKitRegistry(): Map<string, TemplateKit> {
  if (!KIT_REGISTRY) {
    KIT_REGISTRY = new Map();
    // Lazy-import: this pulls in the renderer + CSS.
    // Only safe in Next.js / webpack / turbopack contexts.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { developerDarkKit } = require('./developer-dark') as {
      developerDarkKit: TemplateKit;
    };
    KIT_REGISTRY.set(developerDarkKit.meta.id, developerDarkKit);
  }
  return KIT_REGISTRY;
}

/**
 * Get the full template kit (meta + Component) by ID.
 * Only call this in contexts where CSS imports are supported (Next.js pages/components).
 */
export function getTemplate(templateId: string): TemplateKit | null {
  return ensureKitRegistry().get(templateId) ?? null;
}

/**
 * Register a custom template kit at runtime.
 */
export function registerTemplate(kit: TemplateKit): void {
  const registry = ensureKitRegistry();
  if (registry.has(kit.meta.id)) {
    throw new Error(`Template "${kit.meta.id}" is already registered`);
  }
  registry.set(kit.meta.id, kit);
  META_REGISTRY.set(kit.meta.id, kit.meta);
}
