import { describe, expect, it } from 'vitest';

import {
  LIVE_QA_PATHWAYS,
  getLiveQaPathway,
  listLiveQaPathways,
  listPersonaFixtures,
  listResumeFixtures,
  buildLiveQaCatalog,
} from '@/_admin-panel/modules/developer/live-qa';

describe('Live QA catalog', () => {
  it('registers unique pathway ids with specs and intents', () => {
    const ids = LIVE_QA_PATHWAYS.map((pathway) => pathway.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(LIVE_QA_PATHWAYS.length).toBeGreaterThanOrEqual(8);

    for (const pathway of LIVE_QA_PATHWAYS) {
      expect(pathway.spec).toMatch(/\.spec\.ts$/);
      expect(pathway.intents.length).toBeGreaterThan(0);
      expect(getLiveQaPathway(pathway.id)?.id).toBe(pathway.id);
    }
  });

  it('filters pathways by id list', () => {
    const subset = listLiveQaPathways(['public.landing', 'auth.dashboard-gate']);
    expect(subset.map((pathway) => pathway.id)).toEqual(['public.landing', 'auth.dashboard-gate']);
  });

  it('exposes resume and persona fixtures', () => {
    const resumes = listResumeFixtures();
    const personas = listPersonaFixtures();
    expect(resumes.some((item) => item.id === 'alex-morgan')).toBe(true);
    expect(personas.some((item) => item.id === 'jordan-park')).toBe(true);
    expect(personas.some((item) => item.id === 'fresh-grad')).toBe(true);
  });

  it('builds a catalog with defaults', () => {
    const catalog = buildLiveQaCatalog();
    expect(catalog.pathways.length).toBe(LIVE_QA_PATHWAYS.length);
    expect(catalog.defaults.baseUrl).toBeTruthy();
    expect(typeof catalog.defaults.storageStateConfigured).toBe('boolean');
    expect(typeof catalog.defaults.aiTriageAvailable).toBe('boolean');
  });

  it('covers critical folio pipeline areas', () => {
    const areas = new Set(LIVE_QA_PATHWAYS.map((pathway) => pathway.area));
    expect(areas.has('Public')).toBe(true);
    expect(areas.has('Auth')).toBe(true);
    expect(areas.has('Onboarding')).toBe(true);
    expect(areas.has('Designer')).toBe(true);
    expect(areas.has('Share')).toBe(true);
    expect(areas.has('Multi-resume')).toBe(true);
    expect(areas.has('Cover letter')).toBe(true);
    expect(areas.has('Links')).toBe(true);
  });
});
