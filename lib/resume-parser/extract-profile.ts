/**
 * Extract profile information from the profile section
 * Based on OpenResume's extract-profile.ts
 */

import {
  getTextWithHighestFeatureScore,
  hasAt,
  hasComma,
  hasLetter,
  hasLetterAndIsAllUpperCase,
  hasNumber,
  hasParenthesis,
  hasSlash,
  isBold,
} from './feature-scoring-system';
import { getSectionLinesByKeywords } from './group-lines-into-sections';
import type { FeatureSet, ResumeProfile, ResumeSectionToLines, TextItem } from './types';

// ============================================
// Feature functions for profile extraction
// ============================================

/**
 * Name: contains only letters, spaces, or periods
 */
const matchOnlyLetterSpaceOrPeriod = (item: TextItem) => item.text.match(/^[a-zA-Z\s\.]+$/);

/**
 * Email: matches xxx@xxx.xxx format
 */
const matchEmail = (item: TextItem) => item.text.match(/\S+@\S+\.\S+/);

/**
 * Phone: matches various phone formats
 */
const matchPhone = (item: TextItem) =>
  item.text.match(/\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/) ||
  item.text.match(/\+?\d{1,3}[\s.-]?\d{3,4}[\s.-]?\d{3,4}[\s.-]?\d{3,4}/);

/**
 * Location: matches "City, ST" format
 */
const matchCityAndState = (item: TextItem) => item.text.match(/[A-Z][a-zA-Z\s]+,\s*[A-Z]{2}\b/);

/**
 * URL: matches url format xxx.xxx/xxx or http(s)://
 */
const matchUrl = (item: TextItem) => item.text.match(/\S+\.[a-z]+\/\S*/i);

const matchUrlHttpFallback = (item: TextItem) => item.text.match(/https?:\/\/\S+/);

const matchUrlWwwFallback = (item: TextItem) => item.text.match(/www\.\S+/);

/**
 * Summary: has 4 or more words
 */
const has4OrMoreWords = (item: TextItem) =>
  item.text.split(/\s+/).filter((w) => w.length > 0).length >= 4;

// ============================================
// Feature sets for each profile attribute
// ============================================

const NAME_FEATURE_SETS: FeatureSet[] = [
  [matchOnlyLetterSpaceOrPeriod, 3, true],
  [isBold, 2],
  [hasLetterAndIsAllUpperCase, 2],
  // Negative scores for other attributes
  [hasAt, -4], // Email
  [hasNumber, -4], // Phone
  [hasParenthesis, -4], // Phone
  [hasComma, -4], // Location
  [hasSlash, -4], // Url
  [has4OrMoreWords, -2], // Summary
];

const EMAIL_FEATURE_SETS: FeatureSet[] = [
  [matchEmail, 4, true],
  [isBold, -1],
  [hasLetterAndIsAllUpperCase, -1],
  [hasParenthesis, -4],
  [hasComma, -4],
  [hasSlash, -4],
  [has4OrMoreWords, -4],
];

const PHONE_FEATURE_SETS: FeatureSet[] = [
  [matchPhone, 4, true],
  [hasLetter, -4],
];

const LOCATION_FEATURE_SETS: FeatureSet[] = [
  [matchCityAndState, 4, true],
  [isBold, -1],
  [hasAt, -4],
  [hasParenthesis, -3],
  [hasSlash, -4],
];

const URL_FEATURE_SETS: FeatureSet[] = [
  [matchUrl, 4, true],
  [matchUrlHttpFallback, 3, true],
  [matchUrlWwwFallback, 3, true],
  [isBold, -1],
  [hasAt, -4],
  [hasParenthesis, -3],
  [hasComma, -4],
  [has4OrMoreWords, -4],
];

const SUMMARY_FEATURE_SETS: FeatureSet[] = [
  [has4OrMoreWords, 4],
  [isBold, -1],
  [hasAt, -4],
  [hasParenthesis, -3],
  [matchCityAndState, -4, false],
];

/**
 * Extract profile information from sections
 */
export function extractProfile(sections: ResumeSectionToLines): {
  profile: ResumeProfile;
  profileScores: Record<string, unknown>;
} {
  const lines = sections.profile || [];
  const textItems = lines.flat();

  const [name, nameScores] = getTextWithHighestFeatureScore(textItems, NAME_FEATURE_SETS);

  const [email, emailScores] = getTextWithHighestFeatureScore(textItems, EMAIL_FEATURE_SETS);

  const [phone, phoneScores] = getTextWithHighestFeatureScore(textItems, PHONE_FEATURE_SETS);

  const [location, locationScores] = getTextWithHighestFeatureScore(
    textItems,
    LOCATION_FEATURE_SETS
  );

  const [url, urlScores] = getTextWithHighestFeatureScore(textItems, URL_FEATURE_SETS);

  const [summary, summaryScores] = getTextWithHighestFeatureScore(
    textItems,
    SUMMARY_FEATURE_SETS,
    undefined,
    true // Concatenate for ties (summary can be multiple sentences)
  );

  // Also check for dedicated summary/objective sections
  const summaryLines = getSectionLinesByKeywords(sections, ['summary', 'objective', 'about']);
  const sectionSummary = summaryLines
    .flat()
    .map((item) => item.text)
    .join(' ')
    .trim();

  return {
    profile: {
      name: name.trim(),
      email: email.trim(),
      phone: phone.trim(),
      location: location.trim(),
      url: url.trim(),
      summary: sectionSummary || summary.trim(),
    },
    profileScores: {
      nameScores,
      emailScores,
      phoneScores,
      locationScores,
      urlScores,
      summaryScores,
    },
  };
}
