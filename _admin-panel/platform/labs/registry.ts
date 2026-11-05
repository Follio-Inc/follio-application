import type { LabImplementation } from './types';

/**
 * The labs that actually exist (PLATFORM_TODO item 20).
 *
 * Client-safe data, like `nav.ts` and the coverage map. It answers exactly one
 * question — **is there a lab for this id, and where is it** — and deliberately
 * carries nothing else: the feature's name, category, status and description
 * are the coverage map's, and a second copy here would be free to disagree
 * with it.
 *
 * An entry appears here when a lab is routed and reachable, not when someone
 * means to build one — which is the whole reason the registry is separate from
 * the declaration the coverage map carries.
 */

/** Where every lab route must live. */
export const LABS_ROOT = '/admin/platform/labs';

/**
 * Implemented labs, by the `lab` id their feature declares.
 *
 * `resume-import-ai` arrived with item 21, in the same commit that routed it.
 * The Labs home turns it from planned to available on its own — no special
 * case there, because the status is derived from this list.
 */
export const IMPLEMENTED_LABS: LabImplementation[] = [
  { id: 'resume-import-ai', route: `${LABS_ROOT}/resume-import-ai` },
];

/** The implementation for a declared lab id, or null when there is none. */
export function findLabImplementation(
  labId: string,
  labs: LabImplementation[] = IMPLEMENTED_LABS
): LabImplementation | null {
  return labs.find((lab) => lab.id === labId) ?? null;
}
