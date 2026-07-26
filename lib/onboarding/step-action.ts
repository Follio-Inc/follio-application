/**
 * Whether the user has taken a meaningful action on the current import step.
 * Used to switch the footer CTA from "Skip" → "Next" / "Choose template".
 */

export type ImportOnboardingStep = 'resume' | 'photo' | 'connect';

export interface ImportStepActionState {
  resumeFileName: string | null;
  uploadedPhoto: string | null;
  /** Constellation connect step — any successful import or typed input */
  constellationHasAction?: boolean;
  connectedLinkedin?: boolean;
  connectedGithub?: boolean;
  importStatuses?: {
    github?: string;
    linkedin?: string;
    youtube?: string;
    medium?: string;
    substack?: string;
    links?: string;
  };
  linkedinProfileInput?: string;
  githubUsername?: string;
  portfolioUrl?: string;
  youtubeChannel?: string;
  mediumUsername?: string;
  substackUsername?: string;
  linkUrls?: string[];
  linkInput?: string;
}

function isImportSuccess(status: string | undefined): boolean {
  return status === 'success' || status === 'added';
}

/** True when the current step has enough user input to label the CTA "Next". */
export function hasImportStepAction(
  step: ImportOnboardingStep,
  state: ImportStepActionState
): boolean {
  switch (step) {
    case 'resume':
      return Boolean(state.resumeFileName);
    case 'photo':
      return Boolean(state.uploadedPhoto);
    case 'connect':
      if (state.constellationHasAction) return true;
      return (
        Boolean(state.connectedLinkedin) ||
        Boolean(state.connectedGithub) ||
        isImportSuccess(state.importStatuses?.github) ||
        isImportSuccess(state.importStatuses?.linkedin) ||
        isImportSuccess(state.importStatuses?.medium) ||
        isImportSuccess(state.importStatuses?.youtube) ||
        isImportSuccess(state.importStatuses?.substack) ||
        Boolean(state.linkedinProfileInput?.trim()) ||
        Boolean(state.githubUsername?.trim()) ||
        Boolean(state.portfolioUrl?.trim()) ||
        Boolean(state.youtubeChannel?.trim()) ||
        Boolean(state.mediumUsername?.trim()) ||
        Boolean(state.substackUsername?.trim()) ||
        (state.linkUrls?.length ?? 0) > 0 ||
        Boolean(state.linkInput?.trim())
      );
    default:
      return false;
  }
}

/** Primary footer label for optional import steps. */
export function importStepNextLabel(hasAction: boolean, isLastDataStep: boolean): string {
  if (isLastDataStep) {
    return hasAction ? 'Choose template' : 'Skip';
  }
  return hasAction ? 'Next' : 'Skip';
}
