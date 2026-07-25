/**
 * Types for the OpenResume-style parser
 * Based on https://github.com/xitanggg/open-resume
 */

// Text item extracted from PDF with position metadata
export interface TextItem {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
  fontName: string;
  hasEOL: boolean; // End of line
}

export type TextItems = TextItem[];

// A line is an array of text items on the same line
export type Line = TextItem[];
export type Lines = Line[];

// Sections mapped to their lines
export type ResumeSectionToLines = {
  [sectionName: string]: Lines;
};

// Subsections within a section (e.g., multiple work experiences)
export type Subsections = Lines[];

// Feature scoring types
type FeatureScore = -4 | -3 | -2 | -1 | 0 | 1 | 2 | 3 | 4;
type ReturnMatchingTextOnly = boolean;

export type FeatureSet =
  | [(item: TextItem) => boolean, FeatureScore]
  | [(item: TextItem) => RegExpMatchArray | null, FeatureScore, ReturnMatchingTextOnly];

export interface TextScore {
  text: string;
  score: number;
  match: boolean;
}

export type TextScores = TextScore[];

// Resume data types
export interface ResumeProfile {
  name: string;
  email: string;
  phone: string;
  location: string;
  url: string;
  summary: string;
}

export interface ResumeWorkExperience {
  company: string;
  jobTitle: string;
  date: string;
  descriptions: string[];
}

export interface ResumeEducation {
  school: string;
  degree: string;
  gpa: string;
  date: string;
  descriptions: string[];
}

export interface ResumeProject {
  project: string;
  date: string;
  descriptions: string[];
}

export interface ResumeSkills {
  featuredSkills: { skill: string; rating: number }[];
  descriptions: string[];
}

export interface ResumeCustom {
  descriptions: string[];
}

export interface Resume {
  profile: ResumeProfile;
  workExperiences: ResumeWorkExperience[];
  educations: ResumeEducation[];
  projects: ResumeProject[];
  skills: ResumeSkills;
  custom: ResumeCustom;
}

// Parsed resume for our application
export interface ParsedResume {
  firstName: string;
  middleName?: string;
  lastName: string;
  headline: string;
  email: string;
  phone: string;
  location: string;
  summary: string;
  links: string[];
  skills: string[];
  /** Category + skills when the resume used grouped skill lines */
  skillGroups?: Array<{ name: string; skills: string[] }>;
  workExperiences: {
    company: string;
    title: string;
    location?: string;
    startDate?: string;
    endDate?: string;
    description: string;
    isCurrent: boolean;
  }[];
  educations: {
    institution: string;
    degree: string;
    field?: string;
    startDate?: string;
    endDate?: string;
    gpa?: string;
  }[];
  projects: {
    name: string;
    description: string;
    url?: string;
    startDate?: string;
    endDate?: string;
  }[];
  certifications: {
    name: string;
    issuer?: string;
    date?: string;
  }[];
  confidence: number;
  parseMethod: 'open-resume';
}
