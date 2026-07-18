/**
 * Portfolio AI Pipeline — Barrel Export
 *
 * The 6-stage AI pipeline for portfolio generation:
 *  A: Profile Understanding  — Who is this person?
 *  B: Evidence Extraction     — What proves their claims?
 *  C: Portfolio Strategy      — What should the portfolio look like?
 *  D: Narrative Generation    — What should the copy say?
 *  E: Design Brief            — What visual direction to take?
 *  F: Validation              — Is everything grounded in data?
 */

export { executeProfileUnderstanding } from './stage-a-understanding';
export { executeEvidenceExtraction } from './stage-b-evidence';
export { executePortfolioStrategy } from './stage-c-strategy';
export { executeNarrativeGeneration, buildNarrativeUserPrompt } from './stage-d-narrative';
export type { NarrativeGenerationContext } from './stage-d-narrative';
export { COMPONENT_VARIANTS, executeDesignBrief, VALID_COLOR_THEMES } from './stage-e-design';
export { applyValidationFixes, executeValidation } from './stage-f-validation';
