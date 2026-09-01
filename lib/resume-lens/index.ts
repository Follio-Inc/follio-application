export type {
  LensOccurrence,
  LensPhrase,
  LensPhraseKind,
  LensProfile,
  ResumeLensResult,
  TextRange,
} from './types';
export { MAX_LENS_PHRASES } from './types';
export { validateJobDescription, isLikelyUrlOnly, MIN_JD_CHARS, MAX_JD_CHARS } from './validate-jd';
export {
  buildPhraseRegex,
  escapeRegExp,
  findNonOverlappingRanges,
  phraseAppearsIn,
  splitTextByRanges,
} from './highlight';
export { selectLensPhrases } from './phrases';
export { formatPhraseHint, indexPhraseOccurrences } from './occurrences';
export { buildRecruiterStrip, buildResumeLens } from './build-lens';
export {
  applyResumeLensMarks,
  clearResumeLensMarks,
  LENS_MARK_CLASS,
} from './apply-dom-highlights';
