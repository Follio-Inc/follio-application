/**
 * Deterministic content-quality assessment for portfolio items.
 * Helps the agent choose the right rewrite strategy (especially projects).
 */

export type ItemQuality = 'rich' | 'adequate' | 'thin' | 'empty';

export interface AssessedItem {
  id: string;
  kind: 'project' | 'experience' | 'award' | 'writing';
  title: string;
  quality: ItemQuality;
  signals: string[];
  /** Hint for the writer tool. */
  strategy: string;
}

function scoreText(text: string | null | undefined): number {
  if (!text) return 0;
  const t = text.replace(/<[^>]+>/g, '').trim();
  if (!t) return 0;
  if (t.length < 40) return 1;
  if (t.length < 120) return 2;
  return 3;
}

export function assessProject(input: {
  id: string;
  title: string;
  description?: string | null;
  shortDesc?: string | null;
  highlights?: string[];
  techStack?: string[];
  github?: {
    stars?: number;
    readme?: string | null;
    isPinned?: boolean;
  } | null;
}): AssessedItem {
  const signals: string[] = [];
  let score = 0;

  const descScore = Math.max(scoreText(input.description), scoreText(input.shortDesc));
  score += descScore;
  if (descScore >= 3) signals.push('strong description');
  else if (descScore === 2) signals.push('adequate description');
  else if (descScore === 1) signals.push('thin description');
  else signals.push('missing description');

  if ((input.highlights?.length ?? 0) > 0) {
    score += 1;
    signals.push(`${input.highlights!.length} highlights`);
  }
  if ((input.techStack?.length ?? 0) > 0) {
    score += 0.5;
    signals.push(`tech: ${input.techStack!.slice(0, 4).join(', ')}`);
  }
  if (input.github?.readme && input.github.readme.length > 80) {
    score += 1;
    signals.push('readme available');
  }
  if (input.github?.isPinned) {
    score += 0.5;
    signals.push('pinned');
  }
  if ((input.github?.stars ?? 0) > 0) {
    signals.push(`★${input.github!.stars}`);
  }

  const quality = toQuality(score);
  return {
    id: input.id,
    kind: 'project',
    title: input.title,
    quality,
    signals,
    strategy: projectStrategy(quality),
  };
}

export function assessExperience(input: {
  id: string;
  role: string;
  company: string;
  bullets?: string[];
}): AssessedItem {
  const bullets = input.bullets ?? [];
  const nonEmpty = bullets.map((b) => b.replace(/<[^>]+>/g, '').trim()).filter(Boolean);
  const signals: string[] = [`${nonEmpty.length} bullets`];
  let quality: ItemQuality = 'empty';
  if (nonEmpty.length === 0) quality = 'empty';
  else if (nonEmpty.length === 1 && nonEmpty[0].length < 80) quality = 'thin';
  else if (nonEmpty.some((b) => b.length > 100) || nonEmpty.length >= 3) quality = 'rich';
  else quality = 'adequate';

  return {
    id: input.id,
    kind: 'experience',
    title: `${input.role} @ ${input.company}`,
    quality,
    signals,
    strategy:
      quality === 'empty'
        ? 'Write a minimal factual line from role + company only.'
        : quality === 'thin'
          ? 'Compress the thin bullet into one clear portfolio sentence; do not invent impact.'
          : 'Collapse bullets into one impact-led portfolio sentence; keep real metrics only.',
  };
}

function toQuality(score: number): ItemQuality {
  if (score <= 0) return 'empty';
  if (score < 2) return 'thin';
  if (score < 3.5) return 'adequate';
  return 'rich';
}

function projectStrategy(quality: ItemQuality): string {
  switch (quality) {
    case 'rich':
      return 'Polish existing description; preserve meaning; lead with purpose/impact.';
    case 'adequate':
      return 'Tighten into 1–2 clear sentences; keep facts; improve clarity.';
    case 'thin':
      return 'Expand carefully using title, tech, highlights, readme, and stats — no invented product story.';
    case 'empty':
      return 'Synthesize a minimal factual blurb from title + tech + GitHub signals only.';
  }
}
