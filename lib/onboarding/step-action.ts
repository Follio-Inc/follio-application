/**
 * Whether the user has taken a meaningful action on the current import step.
 * Used to switch the footer CTA from "Skip to Next Step" → "Next".
 */

export type ImportOnboardingStep = 'resume' | 'photo' | 'accounts' | 'platforms';

export interface ImportStepActionState {
  resumeFileName: string | null;
  uploadedPhoto: string | null;
  connectedLinkedin: boolean;
  connectedGithub: boolean;
  importStatuses: {
    github?: string;
    linkedin?: string;
    youtube?: string;
    medium?: string;
    substack?: string;
    links?: string;
  };
  /** Pasted LinkedIn URL/username (accounts step) */
  linkedinProfileInput?: string;
  /** Pasted GitHub URL/username (accounts step) */
  githubUsername?: string;
  /** Pasted personal portfolio / website URL (platforms step) */
  portfolioUrl?: string;
  youtubeChannel: string;
  mediumUsername: string;
  substackUsername: string;
  linkUrls: string[];
  linkInput: string;
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
    case 'accounts':
      return (
        state.connectedLinkedin ||
        state.connectedGithub ||
        isImportSuccess(state.importStatuses.github) ||
        isImportSuccess(state.importStatuses.linkedin) ||
        Boolean(state.linkedinProfileInput?.trim()) ||
        Boolean(state.githubUsername?.trim())
      );
    case 'platforms':
      return (
        Boolean(state.portfolioUrl?.trim()) ||
        Boolean(state.youtubeChannel.trim()) ||
        Boolean(state.mediumUsername.trim()) ||
        Boolean(state.substackUsername.trim()) ||
        state.linkUrls.length > 0 ||
        Boolean(state.linkInput.trim()) ||
        isImportSuccess(state.importStatuses.youtube) ||
        isImportSuccess(state.importStatuses.medium) ||
        isImportSuccess(state.importStatuses.substack) ||
        isImportSuccess(state.importStatuses.links)
      );
    default:
      return false;
  }
}

/** Primary footer label for optional import steps. */
export function importStepNextLabel(hasAction: boolean, isLastDataStep: boolean): string {
  if (isLastDataStep) {
    return hasAction ? 'Open resume' : 'Skip & open resume';
  }
  return hasAction ? 'Next' : 'Skip to Next Step';
}
