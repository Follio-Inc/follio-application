import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { isValidResumeTemplateId } from '@/lib/resume/templates';
import {
  RESUME_DESIGN_DEFAULTS,
  type ResumeColorTheme,
  type ResumeDensity,
  type ResumeDesign,
  type ResumeDividerStyle,
  type ResumeFontFamily,
  type ResumeHeaderAlignment,
  type ResumeHeaderPhotoLayout,
  type ResumePageLayout,
  type ResumeTextStyle,
} from '@/types';

// ─── Validation ───────────────────────────────────────────────────

const VALID_FONT_FAMILIES = new Set<ResumeFontFamily>([
  'georgia',
  'times',
  'garamond',
  'inter',
  'roboto',
  'lato',
  'merriweather',
  'source-sans',
  'open-sans',
  'raleway',
  'instrument-sans',
  'dm-sans',
  'system',
  'great-vibes',
]);

function validateFontField(
  raw: Record<string, unknown>,
  key:
    | 'fontFamily'
    | 'nameFontFamily'
    | 'titleFontFamily'
    | 'headingFontFamily'
    | 'contactFontFamily',
  design: ResumeDesign
): { valid: true } | { valid: false; error: string } {
  if (raw[key] === undefined) return { valid: true };
  if (!VALID_FONT_FAMILIES.has(raw[key] as ResumeFontFamily)) {
    return {
      valid: false,
      error: `${key} must be one of: ${[...VALID_FONT_FAMILIES].join(', ')}`,
    };
  }
  design[key] = raw[key] as ResumeFontFamily;
  return { valid: true };
}

function validateTextStyleField(
  raw: Record<string, unknown>,
  key: 'nameStyle' | 'titleStyle' | 'headingStyle' | 'bodyStyle' | 'contactStyle',
  design: ResumeDesign
): { valid: true } | { valid: false; error: string } {
  if (raw[key] === undefined) return { valid: true };
  const value = raw[key];
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {
      valid: false,
      error: `${key} must be an object with bold, italic, underline booleans`,
    };
  }
  const style = value as Record<string, unknown>;
  for (const flag of ['bold', 'italic', 'underline'] as const) {
    if (style[flag] !== undefined && typeof style[flag] !== 'boolean') {
      return { valid: false, error: `${key}.${flag} must be a boolean` };
    }
  }
  design[key] = {
    bold: Boolean(style.bold),
    italic: Boolean(style.italic),
    underline: Boolean(style.underline),
  } satisfies ResumeTextStyle;
  return { valid: true };
}

const VALID_HEADER_ALIGNMENTS = new Set<ResumeHeaderAlignment>(['left', 'center', 'right']);

const VALID_HEADER_PHOTO_LAYOUTS = new Set<ResumeHeaderPhotoLayout>([
  'photo-left',
  'photo-right',
  'photo-above',
  'photo-above-left',
]);

const VALID_DIVIDER_STYLES = new Set<ResumeDividerStyle>([
  'line',
  'double',
  'dotted',
  'dashed',
  'thick',
  'none',
]);

const VALID_DENSITIES = new Set<ResumeDensity>(['compact', 'normal', 'relaxed']);

const VALID_COLOR_THEMES = new Set<ResumeColorTheme>(['light', 'dark', 'system']);

const VALID_PAGE_LAYOUTS = new Set<ResumePageLayout>(['continuous', 'a4', 'letter']);
/** Accept legacy `paged` on write and normalize to `letter`. */
const LEGACY_PAGE_LAYOUTS = new Set(['paged']);

/** Validates a CSS hex color string (3-, 4-, 6-, or 8-digit). */
function isValidHexColor(value: unknown): value is string {
  if (typeof value !== 'string') return false;
  return /^#([0-9A-Fa-f]{3,4}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/.test(value);
}

function validateResumeDesign(body: unknown): {
  valid: boolean;
  data: ResumeDesign | null;
  error?: string;
} {
  if (!body || typeof body !== 'object') {
    return { valid: false, data: null, error: 'Request body must be an object' };
  }

  const raw = body as Record<string, unknown>;
  const design: ResumeDesign = {};

  // colorTheme
  if (raw.colorTheme !== undefined) {
    if (!VALID_COLOR_THEMES.has(raw.colorTheme as ResumeColorTheme)) {
      return {
        valid: false,
        data: null,
        error: `colorTheme must be one of: ${[...VALID_COLOR_THEMES].join(', ')}`,
      };
    }
    design.colorTheme = raw.colorTheme as ResumeColorTheme;
  }

  // headingColor
  if (raw.headingColor !== undefined) {
    if (!isValidHexColor(raw.headingColor)) {
      return { valid: false, data: null, error: 'headingColor must be a valid hex color' };
    }
    design.headingColor = raw.headingColor;
  }

  // accentColor
  if (raw.accentColor !== undefined) {
    if (!isValidHexColor(raw.accentColor)) {
      return { valid: false, data: null, error: 'accentColor must be a valid hex color' };
    }
    design.accentColor = raw.accentColor;
  }

  for (const key of [
    'fontFamily',
    'nameFontFamily',
    'titleFontFamily',
    'headingFontFamily',
    'contactFontFamily',
  ] as const) {
    const result = validateFontField(raw, key, design);
    if (!result.valid) return { valid: false, data: null, error: result.error };
  }

  // headerAlignment
  if (raw.headerAlignment !== undefined) {
    if (!VALID_HEADER_ALIGNMENTS.has(raw.headerAlignment as ResumeHeaderAlignment)) {
      return {
        valid: false,
        data: null,
        error: `headerAlignment must be one of: ${[...VALID_HEADER_ALIGNMENTS].join(', ')}`,
      };
    }
    design.headerAlignment = raw.headerAlignment as ResumeHeaderAlignment;
  }

  // headerPhotoLayout
  if (raw.headerPhotoLayout !== undefined) {
    if (!VALID_HEADER_PHOTO_LAYOUTS.has(raw.headerPhotoLayout as ResumeHeaderPhotoLayout)) {
      return {
        valid: false,
        data: null,
        error: `headerPhotoLayout must be one of: ${[...VALID_HEADER_PHOTO_LAYOUTS].join(', ')}`,
      };
    }
    design.headerPhotoLayout = raw.headerPhotoLayout as ResumeHeaderPhotoLayout;
  }

  // photoSize
  if (raw.photoSize !== undefined) {
    const size = Number(raw.photoSize);
    if (isNaN(size) || size < 40 || size > 120) {
      return { valid: false, data: null, error: 'photoSize must be a number between 40 and 120' };
    }
    design.photoSize = size;
  }

  // dividerStyle
  if (raw.dividerStyle !== undefined) {
    if (!VALID_DIVIDER_STYLES.has(raw.dividerStyle as ResumeDividerStyle)) {
      return {
        valid: false,
        data: null,
        error: `dividerStyle must be one of: ${[...VALID_DIVIDER_STYLES].join(', ')}`,
      };
    }
    design.dividerStyle = raw.dividerStyle as ResumeDividerStyle;
  }

  // density
  if (raw.density !== undefined) {
    if (!VALID_DENSITIES.has(raw.density as ResumeDensity)) {
      return {
        valid: false,
        data: null,
        error: `density must be one of: ${[...VALID_DENSITIES].join(', ')}`,
      };
    }
    design.density = raw.density as ResumeDensity;
  }

  // fontSize
  if (raw.fontSize !== undefined) {
    const size = Number(raw.fontSize);
    if (isNaN(size) || size < 8 || size > 20) {
      return { valid: false, data: null, error: 'fontSize must be a number between 8 and 20' };
    }
    design.fontSize = size;
  }

  // nameFontSize
  if (raw.nameFontSize !== undefined) {
    const size = Number(raw.nameFontSize);
    if (isNaN(size) || size < 16 || size > 48) {
      return { valid: false, data: null, error: 'nameFontSize must be a number between 16 and 48' };
    }
    design.nameFontSize = size;
  }

  // titleFontSize (professional title under the name)
  if (raw.titleFontSize !== undefined) {
    const size = Number(raw.titleFontSize);
    if (isNaN(size) || size < 10 || size > 24) {
      return {
        valid: false,
        data: null,
        error: 'titleFontSize must be a number between 10 and 24',
      };
    }
    design.titleFontSize = size;
  }

  // headingFontSize (section titles)
  if (raw.headingFontSize !== undefined) {
    const size = Number(raw.headingFontSize);
    if (isNaN(size) || size < 9 || size > 18) {
      return {
        valid: false,
        data: null,
        error: 'headingFontSize must be a number between 9 and 18',
      };
    }
    design.headingFontSize = size;
  }

  // contactFontSize (email / phone)
  if (raw.contactFontSize !== undefined) {
    const size = Number(raw.contactFontSize);
    if (isNaN(size) || size < 9 || size > 18) {
      return {
        valid: false,
        data: null,
        error: 'contactFontSize must be a number between 9 and 18',
      };
    }
    design.contactFontSize = size;
  }

  for (const key of [
    'nameStyle',
    'titleStyle',
    'headingStyle',
    'bodyStyle',
    'contactStyle',
  ] as const) {
    const result = validateTextStyleField(raw, key, design);
    if (!result.valid) return { valid: false, data: null, error: result.error };
  }

  // justifyAll
  if (raw.justifyAll !== undefined) {
    if (typeof raw.justifyAll !== 'boolean') {
      return { valid: false, data: null, error: 'justifyAll must be a boolean' };
    }
    design.justifyAll = raw.justifyAll;
  }

  // pageLayout
  if (raw.pageLayout !== undefined) {
    if (LEGACY_PAGE_LAYOUTS.has(raw.pageLayout as string)) {
      design.pageLayout = 'letter';
    } else if (!VALID_PAGE_LAYOUTS.has(raw.pageLayout as ResumePageLayout)) {
      return {
        valid: false,
        data: null,
        error: `pageLayout must be one of: ${[...VALID_PAGE_LAYOUTS].join(', ')}`,
      };
    } else {
      design.pageLayout = raw.pageLayout as ResumePageLayout;
    }
  }

  // templateId
  if (raw.templateId !== undefined) {
    if (!isValidResumeTemplateId(raw.templateId)) {
      return {
        valid: false,
        data: null,
        error: 'templateId must be a valid resume template id',
      };
    }
    design.templateId = raw.templateId;
  }

  return { valid: true, data: design };
}

// ─── GET ──────────────────────────────────────────────────────────

/**
 * GET /api/profile/resume-design
 * Retrieve the resume design settings for the active profile.
 */
export async function GET() {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const context = await resolveActiveProfileContext(userId);

    // resumeDesign is a new JSON column — Prisma client may not have it
    // in its generated types yet, so we select it manually.
    const profile = await db.profile.findUnique({
      where: { id: context.profileId },
    });

    if (!profile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 });
    }

    const rawDesign = (profile as Record<string, unknown>).resumeDesign;
    const design: ResumeDesign = {
      ...RESUME_DESIGN_DEFAULTS,
      ...((rawDesign as ResumeDesign | null) ?? {}),
    };

    return NextResponse.json({ design });
  } catch (error) {
    logger.error('Failed to fetch resume design', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// ─── PATCH ────────────────────────────────────────────────────────

/**
 * PATCH /api/profile/resume-design
 * Update the resume design settings for the active profile.
 */
export async function PATCH(request: NextRequest) {
  try {
    const { userId } = await auth();
    if (!userId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await request.json();
    const { valid, data, error } = validateResumeDesign(body);

    if (!valid || !data) {
      return NextResponse.json({ error: error ?? 'Validation failed' }, { status: 400 });
    }

    const context = await resolveActiveProfileContext(userId);

    // Merge with existing design to allow partial updates
    const existing = await db.profile.findUnique({
      where: { id: context.profileId },
    });

    const rawDesign = (existing as Record<string, unknown> | null)?.resumeDesign;
    const mergedDesign: ResumeDesign = {
      ...((rawDesign as ResumeDesign | null) ?? {}),
      ...data,
    };

    // Use type assertion for the data payload since Prisma client may
    // not have the column in its generated types until next regeneration.
    await db.profile.update({
      where: { id: context.profileId },
      data: {
        resumeDesign: mergedDesign as unknown as undefined,
        updatedAt: new Date(),
      } as Parameters<typeof db.profile.update>[0]['data'],
    });

    return NextResponse.json({ success: true, design: mergedDesign });
  } catch (error) {
    logger.error('Failed to update resume design', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
