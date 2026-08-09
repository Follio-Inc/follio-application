import { spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

import { getLiveQaPathway, listLiveQaPathways } from './catalog';
import {
  getLiveQaRoot,
  listPersonaFixtures,
  listResumeFixtures,
  resolvePersonaPath,
  resolveResumePath,
} from './fixtures';
import { isAiTriageAvailable, triagePathwayFailure } from './triage';
import type {
  LiveQaCatalog,
  LiveQaPathwayResult,
  LiveQaRunRequest,
  LiveQaRunResult,
} from './types';

const MAX_OUTPUT_CHARS = 40_000;

function trimOutput(text: string): string {
  if (text.length <= MAX_OUTPUT_CHARS) return text;
  return `${text.slice(0, MAX_OUTPUT_CHARS)}\n…(truncated)`;
}

function artifactsDirForRun(): string {
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  return path.join(getLiveQaRoot(), '.artifacts', stamp);
}

function parsePathwayResults(
  stdout: string,
  pathwayIds: string[],
  durationMs: number
): LiveQaPathwayResult[] {
  // Playwright list reporter lines like: `  ✓  1 [chromium] › public-landing.spec.ts:3:3 › public.landing › …`
  return pathwayIds.map((pathwayId) => {
    const pathway = getLiveQaPathway(pathwayId);
    const escaped = pathwayId.replace(/\./g, '\\.');
    const failed = new RegExp(`✘|×|failed|Error:.*${escaped}`, 'i').test(stdout);
    const passed = new RegExp(`(✓|✔|passed).*${escaped}`, 'i').test(stdout);
    const skipped = new RegExp(`(°-|skipped).*${escaped}`, 'i').test(stdout);

    let ok = passed && !failed;
    let summary = 'completed';
    if (skipped && !passed && !failed) {
      ok = true;
      summary = 'skipped (missing auth/fixture — see stdout)';
    } else if (failed || (!passed && !skipped)) {
      ok = false;
      summary = failed ? 'failed' : 'no pass marker found';
    }

    return {
      pathwayId,
      ok,
      durationMs: Math.round(durationMs / Math.max(pathwayIds.length, 1)),
      summary: pathway ? `${pathway.title}: ${summary}` : summary,
      error: ok ? undefined : `See stdout for ${pathwayId}`,
      screenshotPaths: [],
      triage: null,
    };
  });
}

function collectScreenshots(dir: string): string[] {
  if (!fs.existsSync(dir)) return [];
  const found: string[] = [];
  const walk = (current: string) => {
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const full = path.join(current, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (/\.(png|jpg|jpeg)$/i.test(entry.name)) found.push(full);
    }
  };
  walk(dir);
  return found;
}

/**
 * Spawns Playwright against selected Live QA pathways.
 * Local-only — caller must gate with assertCanRunDeveloperSuites.
 */
export async function runLiveQa(request: LiveQaRunRequest): Promise<LiveQaRunResult> {
  const pathways = listLiveQaPathways(request.pathwayIds);
  if (!pathways.length) {
    const now = new Date().toISOString();
    return {
      ok: false,
      exitCode: 1,
      durationMs: 0,
      startedAt: now,
      finishedAt: now,
      baseUrl: request.baseUrl || process.env.LIVE_QA_BASE_URL || 'http://localhost:3000',
      pathwayIds: request.pathwayIds,
      results: [],
      stdout: '',
      stderr: 'No matching pathways',
      artifactsDir: null,
    };
  }

  const startedAt = new Date();
  const startedMs = Date.now();
  const cwd = process.cwd();
  const liveQaRoot = getLiveQaRoot();
  const artifactsDir = artifactsDirForRun();
  fs.mkdirSync(artifactsDir, { recursive: true });

  const baseUrl = (
    request.baseUrl ||
    process.env.LIVE_QA_BASE_URL ||
    'http://localhost:3000'
  ).replace(/\/$/, '');
  const resumePath = resolveResumePath(
    request.resumeFixtureId || 'alex-morgan',
    request.customResumePath
  );
  const personaPath = resolvePersonaPath(request.personaFixtureId || 'jordan-park');
  const storageState = process.env.LIVE_QA_STORAGE_STATE || '';

  const specArgs = pathways.map((pathway) => path.join(liveQaRoot, pathway.spec));
  const configPath = path.join(liveQaRoot, 'playwright.config.ts');
  const playwrightCli = path.join(cwd, 'node_modules', '@playwright', 'test', 'cli.js');

  const args = ['test', `--config=${configPath}`, ...specArgs];

  const { stdout, stderr, exitCode } = await new Promise<{
    stdout: string;
    stderr: string;
    exitCode: number | null;
  }>((resolve) => {
    const child = spawn(process.execPath, [playwrightCli, ...args], {
      cwd,
      env: {
        ...process.env,
        FORCE_COLOR: '0',
        CI: 'true',
        LIVE_QA_BASE_URL: baseUrl,
        LIVE_QA_ARTIFACTS_DIR: artifactsDir,
        LIVE_QA_HEADED: request.headed ? 'true' : 'false',
        ...(resumePath ? { LIVE_QA_RESUME_PDF: resumePath } : {}),
        ...(personaPath ? { LIVE_QA_PERSONA_PATH: personaPath } : {}),
        ...(storageState ? { LIVE_QA_STORAGE_STATE: storageState } : {}),
      },
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    let out = '';
    let err = '';
    child.stdout.on('data', (chunk: Buffer) => {
      out += chunk.toString('utf8');
    });
    child.stderr.on('data', (chunk: Buffer) => {
      err += chunk.toString('utf8');
    });
    child.on('error', (error) => {
      err += `\n${error.message}`;
      resolve({ stdout: out, stderr: err, exitCode: 1 });
    });
    child.on('close', (code) => {
      resolve({ stdout: out, stderr: err, exitCode: code });
    });
  });

  const durationMs = Date.now() - startedMs;
  const screenshots = collectScreenshots(artifactsDir);
  let results = parsePathwayResults(
    stdout,
    pathways.map((p) => p.id),
    durationMs
  ).map((result) => ({
    ...result,
    screenshotPaths: screenshots.filter((file) =>
      file.toLowerCase().includes(result.pathwayId.split('.').pop() || '')
    ),
  }));

  // Attach any leftover screenshots to failed results
  results = results.map((result) => {
    if (result.screenshotPaths.length) return result;
    if (!result.ok) return { ...result, screenshotPaths: screenshots.slice(0, 3) };
    return result;
  });

  if (request.triageWithAi !== false && isAiTriageAvailable()) {
    results = await Promise.all(
      results.map(async (result) => {
        if (result.ok) return result;
        const pathway = getLiveQaPathway(result.pathwayId);
        const triage = await triagePathwayFailure({
          pathwayId: result.pathwayId,
          intents: pathway?.intents ?? [],
          errorText: result.error || '',
          stdoutSnippet: stdout,
        });
        return { ...result, triage };
      })
    );
  }

  const finishedAt = new Date();
  const ok = exitCode === 0 && results.every((result) => result.ok);

  return {
    ok,
    exitCode,
    durationMs,
    startedAt: startedAt.toISOString(),
    finishedAt: finishedAt.toISOString(),
    baseUrl,
    pathwayIds: pathways.map((p) => p.id),
    results,
    stdout: trimOutput(stdout),
    stderr: trimOutput(stderr),
    artifactsDir,
  };
}

export function buildLiveQaCatalog(): LiveQaCatalog {
  const storageState = process.env.LIVE_QA_STORAGE_STATE;
  return {
    pathways: listLiveQaPathways(),
    resumes: listResumeFixtures(),
    personas: listPersonaFixtures(),
    defaults: {
      baseUrl: (
        process.env.LIVE_QA_BASE_URL ||
        process.env.NEXT_PUBLIC_APP_URL ||
        'http://localhost:3000'
      ).replace(/\/$/, ''),
      storageStateConfigured: Boolean(storageState && fs.existsSync(storageState)),
      aiTriageAvailable: isAiTriageAvailable(),
    },
  };
}
