/**
 * Deterministic resume quality analysis.
 *
 * No LLM, no network, no database. Given a resume, the same input always
 * produces the same report, which is what lets the Evaluation Agent cite
 * numbers it did not invent.
 *
 * Every check here is deliberately conservative. "No metric in this bullet"
 * is a statement about the text, not about the person's impact; "weak opener"
 * means the line begins with a filler phrase, not that the work was weak. The
 * wording of each finding is chosen so that passing it to a model cannot turn
 * it into a claim about the user.
 */

import type {
  BulletAnalysis,
  ExperienceAnalysis,
  ItemQuality,
  ProjectAnalysis,
  QualityFinding,
  ResumeForQuality,
  ResumeQualityReport,
} from './types';

const BASIS =
  'Computed from the text of this resume by deterministic checks — section emptiness, bullet ' +
  'length, presence of numbers, and filler phrases. It describes how the resume is written, ' +
  'not how good the work was, and it is not a score from any applicant tracking system.';

/** Phrases that pad a bullet without adding information. */
const WEAK_PHRASES = [
  'responsible for',
  'duties included',
  'tasked with',
  'worked on',
  'helped with',
  'assisted with',
  'involved in',
  'participated in',
  'various',
  'etc.',
  'and so on',
  'a variety of',
  'team player',
  'hard worker',
];

/** Openers that are not action verbs. A bullet starting here buries the verb. */
const WEAK_OPENERS = [
  'responsible',
  'duties',
  'tasked',
  'worked',
  'helped',
  'assisted',
  'involved',
  'participated',
  'i ',
  'my ',
  'we ',
  'the ',
  'a ',
  'an ',
];

/** A number, percentage, currency amount, or multiplier. */
const METRIC_PATTERN =
  /(\d+(\.\d+)?\s*%)|([$£€]\s*\d)|(\b\d+(\.\d+)?\s*[kmb]\b)|(\b\d+(\.\d+)?\b)/i;

const SHORT_BULLET_CHARS = 30;
const LONG_BULLET_CHARS = 300;

function stripHtml(text: string): string {
  return text
    .replace(/<[^>]+>/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function analyzeBullet(raw: string): BulletAnalysis {
  const text = stripHtml(raw);
  const lower = text.toLowerCase();

  const weakPhrases = WEAK_PHRASES.filter((phrase) => lower.includes(phrase));
  const startsWithActionVerb =
    text.length > 0 && !WEAK_OPENERS.some((opener) => lower.startsWith(opener));

  return {
    text,
    length: text.length,
    hasMetric: METRIC_PATTERN.test(text),
    startsWithActionVerb,
    weakPhrases,
  };
}

function experienceQuality(bullets: BulletAnalysis[]): ItemQuality {
  const nonEmpty = bullets.filter((bullet) => bullet.length > 0);
  if (nonEmpty.length === 0) return 'empty';
  if (nonEmpty.length === 1 && nonEmpty[0].length < 80) return 'thin';
  if (nonEmpty.length >= 3 || nonEmpty.some((bullet) => bullet.length > 100)) return 'rich';
  return 'adequate';
}

function projectQuality(project: ResumeForQuality['projects'][number]): ItemQuality {
  const description = stripHtml(project.description ?? '');
  let score = 0;
  if (description.length >= 120) score += 3;
  else if (description.length >= 40) score += 2;
  else if (description.length > 0) score += 1;
  if (project.highlights.length > 0) score += 1;
  if (project.techStack.length > 0) score += 1;

  if (score <= 0) return 'empty';
  if (score < 2) return 'thin';
  if (score < 4) return 'adequate';
  return 'rich';
}

/** Sections reported as missing when empty, in the order they are checked. */
const SECTION_CHECKS: Array<{ label: string; isEmpty: (resume: ResumeForQuality) => boolean }> = [
  { label: 'headline', isEmpty: (resume) => !resume.headline?.trim() },
  { label: 'summary', isEmpty: (resume) => !resume.summary?.trim() },
  { label: 'contact email', isEmpty: (resume) => !resume.contact.email?.trim() },
  { label: 'work experience', isEmpty: (resume) => resume.experiences.length === 0 },
  { label: 'education', isEmpty: (resume) => resume.education.length === 0 },
  { label: 'skills', isEmpty: (resume) => resume.skills.length === 0 },
  { label: 'projects', isEmpty: (resume) => resume.projects.length === 0 },
];

const SEVERITY_ORDER: Record<QualityFinding['severity'], number> = { high: 0, medium: 1, low: 2 };

/**
 * Analyse one resume.
 *
 * Findings are returned most severe first so the agent does not have to
 * decide ordering from prose, and so a truncated list still leads with what
 * matters most.
 */
export function analyzeResumeQuality(resume: ResumeForQuality): ResumeQualityReport {
  const findings: QualityFinding[] = [];

  const missingSections = SECTION_CHECKS.filter((check) => check.isEmpty(resume)).map(
    (check) => check.label
  );

  for (const label of missingSections) {
    findings.push({
      code: 'missing-section',
      // Experience and skills are what a resume is read for; the rest matter
      // less when absent.
      severity: label === 'work experience' || label === 'skills' ? 'high' : 'medium',
      location: label,
      detail: `This resume has no ${label}.`,
    });
  }

  const experiences: ExperienceAnalysis[] = resume.experiences.map((item) => {
    const location = `${item.role} @ ${item.company}`;
    const bullets = (item.bullets ?? []).map(analyzeBullet).filter((bullet) => bullet.length > 0);
    const quality = experienceQuality(bullets);
    const bulletsWithMetrics = bullets.filter((bullet) => bullet.hasMetric).length;

    if (bullets.length === 0) {
      findings.push({
        code: 'no-bullets',
        severity: 'high',
        location,
        detail: 'This role has no bullet points, so it says nothing about what was done.',
      });
    } else {
      if (bulletsWithMetrics === 0) {
        findings.push({
          code: 'no-metrics',
          severity: 'medium',
          location,
          detail:
            'No bullet in this role mentions a number, so the scale of the work is not stated. ' +
            'Add figures only where the user actually has them.',
        });
      }

      for (const bullet of bullets) {
        if (bullet.weakPhrases.length > 0) {
          findings.push({
            code: 'weak-phrasing',
            severity: 'medium',
            location,
            detail: `Contains filler: ${bullet.weakPhrases.join(', ')}.`,
            evidence: bullet.text.slice(0, 160),
          });
        }
        if (!bullet.startsWithActionVerb) {
          findings.push({
            code: 'weak-opener',
            severity: 'low',
            location,
            detail: 'This bullet does not open with an action verb.',
            evidence: bullet.text.slice(0, 160),
          });
        }
        if (bullet.length > LONG_BULLET_CHARS) {
          findings.push({
            code: 'long-bullet',
            severity: 'low',
            location,
            detail: `This bullet is ${bullet.length} characters, long enough to be skimmed past.`,
            evidence: bullet.text.slice(0, 160),
          });
        }
        if (bullet.length < SHORT_BULLET_CHARS) {
          findings.push({
            code: 'short-bullet',
            severity: 'low',
            location,
            detail: `This bullet is only ${bullet.length} characters and may be too sparse to land.`,
            evidence: bullet.text,
          });
        }
      }
    }

    return {
      id: item.id,
      location,
      bulletCount: bullets.length,
      quality,
      bulletsWithMetrics,
      bullets,
    };
  });

  const projects: ProjectAnalysis[] = resume.projects.map((project) => {
    const quality = projectQuality(project);
    if (quality === 'empty' || quality === 'thin') {
      findings.push({
        code: 'thin-project',
        severity: 'low',
        location: project.title,
        detail: 'This project has little description, tech or highlights to read.',
      });
    }
    return {
      id: project.id,
      title: project.title,
      quality,
      hasDescription: Boolean(stripHtml(project.description ?? '')),
      highlightCount: project.highlights.length,
      techCount: project.techStack.length,
    };
  });

  const totalBullets = experiences.reduce((sum, item) => sum + item.bulletCount, 0);
  const bulletsWithMetrics = experiences.reduce((sum, item) => sum + item.bulletsWithMetrics, 0);
  const metricCoveragePercent =
    totalBullets === 0 ? 0 : Math.round((bulletsWithMetrics / totalBullets) * 100);

  findings.sort((a, b) => SEVERITY_ORDER[a.severity] - SEVERITY_ORDER[b.severity]);

  return {
    missingSections,
    counts: {
      experiences: resume.experiences.length,
      education: resume.education.length,
      skills: resume.skills.length,
      projects: resume.projects.length,
      totalBullets,
      bulletsWithMetrics,
    },
    metricCoveragePercent,
    experiences,
    projects,
    findings,
    basis: BASIS,
  };
}
