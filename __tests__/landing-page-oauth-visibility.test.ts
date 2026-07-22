import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import { describe, expect, it } from 'vitest';

/**
 * Google Auth Platform brand review rejects homepages whose purpose copy is
 * invisible on first paint (e.g. Framer Motion SSR `opacity:0` on the hero).
 */
describe('landing page OAuth brand-review visibility', () => {
  const src = readFileSync(resolve(process.cwd(), 'components/landing-page.tsx'), 'utf8');

  it('states what Follio is in the hero without opacity:0 initial animation', () => {
    expect(src).toContain('Follio is a web app for job seekers and professionals');

    const heroStart = src.indexOf('function Hero()');
    const landingStart = src.indexOf('export function LandingPage()');
    expect(heroStart).toBeGreaterThan(-1);
    expect(landingStart).toBeGreaterThan(heroStart);

    const heroSrc = src.slice(heroStart, landingStart);
    expect(heroSrc).not.toMatch(/initial=\{\{\s*opacity:\s*0/);
    expect(heroSrc).toContain('<h1');
    expect(heroSrc).toContain('<p className="text-eyebrow">');
  });

  it('keeps FadeIn content opacity readable for crawlers', () => {
    expect(src).toMatch(/hidden:\s*\{\s*opacity:\s*1/);
  });
});
