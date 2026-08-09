import fs from 'node:fs';
import path from 'node:path';

import type { LiveQaPersonaFixture, LiveQaResumeFixture } from './types';

export function getLiveQaRoot(): string {
  return path.join(process.cwd(), '_admin-panel/modules/developer/live-qa');
}

export function getFixturesRoot(): string {
  return path.join(getLiveQaRoot(), 'fixtures');
}

export function getResumePoolDir(): string {
  return path.join(getFixturesRoot(), 'resumes');
}

export function getResumeUploadsDir(): string {
  return path.join(getResumePoolDir(), 'uploads');
}

export function getPersonasDir(): string {
  return path.join(getFixturesRoot(), 'personas');
}

const POOL_RESUMES: Omit<LiveQaResumeFixture, 'source'>[] = [
  {
    id: 'alex-morgan',
    label: 'Alex Morgan',
    description: 'Sample PDF from the Follio asset pack — primary upload fixture.',
    filename: 'alex-morgan.pdf',
  },
];

const PERSONAS: LiveQaPersonaFixture[] = [
  {
    id: 'jordan-park',
    label: 'Jordan Park',
    description: 'Senior product engineer — dense blank-path persona.',
    filename: 'jordan-park.json',
  },
  {
    id: 'fresh-grad',
    label: 'Fresh graduate',
    description: 'Sparse early-career persona for blank-path edge coverage.',
    filename: 'fresh-grad.json',
  },
];

function listUploadedResumes(): LiveQaResumeFixture[] {
  const dir = getResumeUploadsDir();
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((name) => name.toLowerCase().endsWith('.pdf'))
    .map((filename) => ({
      id: `upload:${filename}`,
      label: filename,
      description: 'Uploaded via Live QA portal.',
      filename: path.join('uploads', filename),
      source: 'upload' as const,
    }));
}

export function listResumeFixtures(): LiveQaResumeFixture[] {
  const pool = POOL_RESUMES.map((item) => ({ ...item, source: 'pool' as const }));
  return [...pool, ...listUploadedResumes()];
}

export function listPersonaFixtures(): LiveQaPersonaFixture[] {
  return [...PERSONAS];
}

export function resolveResumePath(fixtureId: string, customPath?: string): string | null {
  if (customPath && fs.existsSync(customPath)) return customPath;

  const fixtures = listResumeFixtures();
  const match = fixtures.find((item) => item.id === fixtureId);
  if (!match) {
    const fallback = fixtures[0];
    if (!fallback) return null;
    return path.join(getResumePoolDir(), fallback.filename);
  }
  return path.join(getResumePoolDir(), match.filename);
}

export function resolvePersonaPath(fixtureId: string): string | null {
  const match =
    listPersonaFixtures().find((item) => item.id === fixtureId) ?? listPersonaFixtures()[0];
  if (!match) return null;
  return path.join(getPersonasDir(), match.filename);
}

/** Persist a one-off PDF uploaded from the Live QA UI. */
export function saveUploadedResume(filename: string, bytes: Buffer): LiveQaResumeFixture {
  const safe = filename.replace(/[^a-zA-Z0-9._-]/g, '_');
  const stamped = `${Date.now()}-${safe.endsWith('.pdf') ? safe : `${safe}.pdf`}`;
  const dir = getResumeUploadsDir();
  fs.mkdirSync(dir, { recursive: true });
  const full = path.join(dir, stamped);
  fs.writeFileSync(full, bytes);
  return {
    id: `upload:${stamped}`,
    label: stamped,
    description: 'Uploaded via Live QA portal.',
    filename: path.join('uploads', stamped),
    source: 'upload',
  };
}
