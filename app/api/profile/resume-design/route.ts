import { auth } from '@clerk/nextjs/server';
import { NextRequest, NextResponse } from 'next/server';

import { resolveActiveProfileContext } from '@/lib/active-profile';
import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import {
  RESUME_DESIGN_DEFAULTS,
  type ResumeDensity,
  type ResumeDesign,
  type ResumeDividerStyle,
  type ResumeFontFamily,
  type ResumeHeaderAlignment,
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
]);

const VALID_HEADER_ALIGNMENTS = new Set<ResumeHeaderAlignment>(['left', 'center', 'right']);

const VALID_DIVIDER_STYLES = new Set<ResumeDividerStyle>([
  'line',
  'double',
  'dotted',
  'dashed',
  'thick',
  'none',
]);

const VALID_DENSITIES = new Set<ResumeDensity>(['compact', 'normal', 'relaxed']);

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

  // fontFamily
  if (raw.fontFamily !== undefined) {
    if (!VALID_FONT_FAMILIES.has(raw.fontFamily as ResumeFontFamily)) {
      return {
        valid: false,
        data: null,
        error: `fontFamily must be one of: ${[...VALID_FONT_FAMILIES].join(', ')}`,
      };
    }
    design.fontFamily = raw.fontFamily as ResumeFontFamily;
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

  // justifyAll
  if (raw.justifyAll !== undefined) {
    if (typeof raw.justifyAll !== 'boolean') {
      return { valid: false, data: null, error: 'justifyAll must be a boolean' };
    }
    design.justifyAll = raw.justifyAll;
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
