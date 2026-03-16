/**
 * Portfolio Pipeline Orchestrator
 *
 * Runs the 6-stage AI pipeline in sequence and coordinates:
 * 1. Data collection
 * 2. All AI stages (A→F)
 * 3. Composition (AI outputs → PortfolioPlan)
 * 4. Persistence to database
 * 5. Progress reporting
 *
 * This is the top-level entry point for portfolio generation.
 */

import { db } from '@/lib/db';
import { logger } from '@/lib/logger';
import { composePortfolioPlan } from '@/services/portfolio/composition-engine.service';
import { collectProfileData } from '@/services/portfolio/data-collector.service';
import {
  applyValidationFixes,
  executeDesignBrief,
  executeEvidenceExtraction,
  executeNarrativeGeneration,
  executePortfolioStrategy,
  executeProfileUnderstanding,
  executeValidation,
} from '@/services/portfolio/pipeline';

import type {
  GenerationMeta,
  PipelineDebugInfo,
  PortfolioGenerationProgress,
  PortfolioGenerationStatus,
  PortfolioPlan,
} from '@/types/portfolio';

const orchestratorLogger = logger.child({ source: 'portfolio-orchestrator' });

// ============================================================================
// PROGRESS CALLBACK TYPE
// ============================================================================

export type ProgressCallback = (progress: PortfolioGenerationProgress) => void;

// ============================================================================
// PIPELINE EXECUTION
// ============================================================================

/**
 * Generate a complete portfolio for a profile.
 *
 * This is the main entry point. It:
 * 1. Collects all profile data
 * 2. Runs the 6-stage AI pipeline
 * 3. Composes the final PortfolioPlan
 * 4. Saves to database
 * 5. Returns the plan
 *
 * @param profileId - The profile to generate a portfolio for
 * @param onProgress - Optional callback for progress updates
 * @returns The generated PortfolioPlan
 */
export async function generatePortfolio(
  profileId: string,
  onProgress?: ProgressCallback
): Promise<PortfolioPlan> {
  const startTime = Date.now();
  const stageDurations: Record<string, number> = {};
  const stageModels: Record<string, string> = {};
  let totalInput = 0;
  let totalOutput = 0;

  const report = (
    status: PortfolioGenerationStatus,
    stage: string,
    completed: number,
    message: string
  ) => {
    onProgress?.({
      status,
      currentStage: stage,
      stagesCompleted: completed,
      totalStages: 8, // collect + 6 AI stages + compose
      message,
      error: null,
    });
  };

  try {
    orchestratorLogger.info('Starting portfolio generation', { profileId });

    // Mark as generating in DB
    const existingPortfolio = await db.generatedPortfolio.findFirst({
      where: { profileId, isActive: true },
    });

    const nextVersion = existingPortfolio ? existingPortfolio.version + 1 : 1;
    const portfolioRecord = await db.generatedPortfolio.create({
      data: {
        profileId,
        version: nextVersion,
        status: 'GENERATING',
        plan: {},
      },
    });

    // ─── Stage 0: Data Collection ───
    report('collecting-data', 'Data Collection', 0, 'Gathering your profile data...');
    const stageStart = Date.now();
    const collectedData = await collectProfileData(profileId);
    stageDurations['dataCollection'] = Date.now() - stageStart;

    orchestratorLogger.info('Data collected', {
      profileId,
      completeness: collectedData.meta.completeness,
      sources: collectedData.meta.activeSources,
    });

    // ─── Stage A: Profile Understanding ───
    report('understanding-profile', 'Profile Understanding', 1, 'Understanding who you are...');
    const stageAStart = Date.now();
    const understanding = await executeProfileUnderstanding(collectedData);
    stageDurations['profileUnderstanding'] = Date.now() - stageAStart;
    stageModels['profileUnderstanding'] = understanding._meta.model;
    totalInput += understanding._meta.tokensUsed.input;
    totalOutput += understanding._meta.tokensUsed.output;

    orchestratorLogger.info('Profile understood', {
      profileId,
      archetype: understanding.primaryArchetype,
      careerStage: understanding.careerStage,
      themes: understanding.definingThemes,
    });

    // ─── Stage B: Evidence Extraction ───
    report(
      'extracting-evidence',
      'Evidence Extraction',
      2,
      'Finding your strongest proof points...'
    );
    const stageBStart = Date.now();
    const evidence = await executeEvidenceExtraction(collectedData, understanding);
    stageDurations['evidenceExtraction'] = Date.now() - stageBStart;
    stageModels['evidenceExtraction'] = evidence._meta.model;
    totalInput += evidence._meta.tokensUsed.input;
    totalOutput += evidence._meta.tokensUsed.output;

    orchestratorLogger.info('Evidence extracted', {
      profileId,
      topEvidenceCount: evidence.topEvidence.length,
      mustFeatureCount: evidence.mustFeature.length,
      weakItemCount: evidence.weakItems.length,
    });

    // ─── Stage C: Portfolio Strategy ───
    report('planning-strategy', 'Portfolio Strategy', 3, 'Planning your portfolio structure...');
    const stageCStart = Date.now();
    const strategy = await executePortfolioStrategy(collectedData, understanding, evidence);
    stageDurations['portfolioStrategy'] = Date.now() - stageCStart;
    stageModels['portfolioStrategy'] = strategy._meta.model;
    totalInput += strategy._meta.tokensUsed.input;
    totalOutput += strategy._meta.tokensUsed.output;

    orchestratorLogger.info('Strategy planned', {
      profileId,
      pageCount: strategy.pageCount,
      tone: strategy.tone,
      leadWith: strategy.leadWith,
      pages: strategy.pages.map((p) => p.slug),
    });

    // ─── Stage D: Narrative Generation ───
    report('generating-narrative', 'Narrative Generation', 4, 'Writing your portfolio story...');
    const stageDStart = Date.now();
    let narrative = await executeNarrativeGeneration(
      collectedData,
      understanding,
      evidence,
      strategy
    );
    stageDurations['narrativeGeneration'] = Date.now() - stageDStart;
    stageModels['narrativeGeneration'] = narrative._meta.model;
    totalInput += narrative._meta.tokensUsed.input;
    totalOutput += narrative._meta.tokensUsed.output;

    orchestratorLogger.info('Narrative generated', {
      profileId,
      headline: narrative.headline,
      hasExperienceNarrative: !!narrative.experienceNarrative,
      hasGithubNarrative: !!narrative.githubNarrative,
      hasPullQuote: !!narrative.pullQuote,
    });

    // ─── Stage E: Design Brief ───
    report('creating-design', 'Design Brief', 5, 'Choosing your visual style...');
    const stageEStart = Date.now();
    const designBrief = await executeDesignBrief(
      collectedData,
      understanding,
      evidence,
      strategy,
      narrative
    );
    stageDurations['designBrief'] = Date.now() - stageEStart;
    stageModels['designBrief'] = designBrief._meta.model;
    totalInput += designBrief._meta.tokensUsed.input;
    totalOutput += designBrief._meta.tokensUsed.output;

    orchestratorLogger.info('Design brief created', {
      profileId,
      colorTheme: designBrief.colorTheme,
      typeScale: designBrief.typeScale,
      layout: designBrief.layoutPreference,
    });

    // ─── Stage F: Validation ───
    report('validating', 'Validation', 6, 'Verifying accuracy...');
    const stageFStart = Date.now();
    const validation = await executeValidation(collectedData, narrative);
    stageDurations['validation'] = Date.now() - stageFStart;
    stageModels['validation'] = validation._meta.model;
    totalInput += validation._meta.tokensUsed.input;
    totalOutput += validation._meta.tokensUsed.output;

    // Apply fixes if validation found issues
    if (validation.modifications.length > 0) {
      narrative = applyValidationFixes(narrative, validation);
      orchestratorLogger.info('Applied validation fixes', {
        profileId,
        fixes: validation.modifications.length,
      });
    }

    orchestratorLogger.info('Validation complete', {
      profileId,
      score: validation.overallScore,
      passed: validation.passed,
      warnings: validation.warnings.length,
    });

    // ─── Compose Final Plan ───
    report('composing', 'Composition', 7, 'Assembling your portfolio...');
    const composeStart = Date.now();

    const pipelineDebug: PipelineDebugInfo = {
      profileUnderstanding: understanding,
      evidenceExtraction: evidence,
      portfolioStrategy: strategy,
      narrativeContent: narrative,
      designBrief,
      validationReport: validation,
    };

    const generationMeta: GenerationMeta = {
      generatedAt: new Date().toISOString(),
      totalDurationMs: Date.now() - startTime,
      totalTokensUsed: { input: totalInput, output: totalOutput },
      pipelineVersion: '1.0.0',
      stageDurations,
      stageModels,
    };

    const plan = composePortfolioPlan({
      collectedData,
      understanding,
      evidence,
      strategy,
      narrative,
      designBrief,
      validation,
      pipelineDebug,
      generationMeta,
      portfolioId: portfolioRecord.id,
      version: nextVersion,
    });

    stageDurations['composition'] = Date.now() - composeStart;

    // ─── Save to Database ───
    await db.generatedPortfolio.update({
      where: { id: portfolioRecord.id },
      data: {
        status: 'DRAFT',
        plan: JSON.parse(JSON.stringify(plan)),
        collectedData: JSON.parse(JSON.stringify(collectedData)),
        pipelineOutput: JSON.parse(JSON.stringify(pipelineDebug)),
        generationTimeMs: Date.now() - startTime,
        totalTokensUsed: JSON.parse(JSON.stringify({ input: totalInput, output: totalOutput })),
        pipelineVersion: '1.0.0',
        isActive: true,
      },
    });

    // Deactivate previous versions
    if (existingPortfolio) {
      await db.generatedPortfolio.update({
        where: { id: existingPortfolio.id },
        data: { isActive: false },
      });
    }

    report('complete', 'Complete', 8, 'Your portfolio is ready!');

    orchestratorLogger.info('Portfolio generation complete', {
      profileId,
      version: nextVersion,
      totalDurationMs: Date.now() - startTime,
      totalTokens: { input: totalInput, output: totalOutput },
      pageCount: plan.pages.length,
    });

    return plan;
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';

    orchestratorLogger.error('Portfolio generation failed', error, {
      profileId,
      durationMs: Date.now() - startTime,
    });

    // Update DB record to failed
    try {
      const failedRecord = await db.generatedPortfolio.findFirst({
        where: { profileId, status: 'GENERATING' },
        orderBy: { createdAt: 'desc' },
      });
      if (failedRecord) {
        await db.generatedPortfolio.update({
          where: { id: failedRecord.id },
          data: { status: 'FAILED' },
        });
      }
    } catch {
      // Don't mask the original error
    }

    onProgress?.({
      status: 'failed',
      currentStage: 'Error',
      stagesCompleted: 0,
      totalStages: 8,
      message: 'Portfolio generation failed',
      error: errorMessage,
    });

    throw error;
  }
}

/**
 * Get the active (latest published/draft) portfolio for a profile.
 * Returns the raw DB record so the caller can access metadata.
 */
export async function getActivePortfolio(profileId: string) {
  const portfolio = await db.generatedPortfolio.findFirst({
    where: {
      profileId,
      isActive: true,
      status: { in: ['DRAFT', 'PUBLISHED'] },
    },
    orderBy: { version: 'desc' },
  });

  return portfolio;
}

/**
 * Publish a portfolio (make it publicly visible).
 */
export async function publishPortfolio(portfolioId: string) {
  return db.generatedPortfolio.update({
    where: { id: portfolioId },
    data: {
      status: 'PUBLISHED',
      publishedAt: new Date(),
    },
  });
}
