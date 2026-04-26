/**
 * Snap View — Algorithmic Computation
 *
 * Pure functions that compute snap view data from raw profile data.
 * No server-only dependencies — safe to use in client components.
 *
 * Used as:
 * 1. Instant fallback before AI data loads
 * 2. Complete replacement when AI is unavailable
 */

import type { PublicProfile } from '@/types';
import type {
  SnapCareerEntry,
  SnapEducationEntry,
  SnapProject,
  SnapSkillCluster,
  SnapViewData,
  SnapViewStats,
} from '@/types/snap-view';

// ============================================================================
// PUBLIC API
// ============================================================================

/**
 * Compute snap view data from a public profile — no AI, instant.
 */
export function computeAlgorithmicSnapView(profile: PublicProfile): SnapViewData {
  const stats = computeStats(profile);
  const careerTimeline = buildCareerTimeline(profile);
  const education = buildEducation(profile);
  const skillClusters = buildSkillClusters(profile);
  const keyProjects = buildKeyProjects(profile);

  return {
    generatedAt: new Date().toISOString(),
    tagline: buildAlgorithmicTagline(profile, stats),
    stats,
    careerTimeline,
    education,
    skillClusters,
    keyProjects,
    recruiterBrief: buildAlgorithmicBrief(profile, stats, careerTimeline),
    certifications: (profile.certifications ?? []).map((c) => c.name).slice(0, 4),
    awards: (profile.awards ?? []).map((a) => a.title).slice(0, 4),
    topSkills: buildTopSkills(profile),
    isAIGenerated: false,
  };
}

// ============================================================================
// STAT COMPUTATION
// ============================================================================

export function computeStats(profile: PublicProfile): SnapViewStats {
  const workExps = profile.workExperiences ?? [];
  const educations = profile.educations ?? [];
  const skills = profile.skills ?? [];

  const totalYears = workExps.reduce((total, exp) => {
    const start = new Date(exp.startDate);
    const end = exp.isCurrent ? new Date() : exp.endDate ? new Date(exp.endDate) : new Date();
    return total + (end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  }, 0);

  const companies = new Set(workExps.map((e) => e.company)).size;

  const degreeRank: Record<string, number> = {
    phd: 4,
    doctorate: 4,
    'doctor of': 4,
    md: 4,
    jd: 3,
    master: 3,
    ms: 3,
    ma: 3,
    mba: 3,
    bachelor: 2,
    bs: 2,
    ba: 2,
    bsc: 2,
    associate: 1,
  };

  let highestDegree: string | null = null;
  let highestRank = 0;

  for (const edu of educations) {
    const degreeLower = (edu.degree ?? '').toLowerCase();
    for (const [key, rank] of Object.entries(degreeRank)) {
      if (degreeLower.includes(key) && rank > highestRank) {
        highestRank = rank;
        if (rank === 4) highestDegree = 'PhD';
        else if (rank === 3) {
          if (degreeLower.includes('mba')) highestDegree = 'MBA';
          else if (degreeLower.includes('jd')) highestDegree = 'JD';
          else highestDegree = 'MS';
        } else if (rank === 2) highestDegree = 'BS';
        else highestDegree = 'AS';
      }
    }
  }

  return {
    yearsOfExperience: Math.round(totalYears),
    companiesCount: companies,
    skillsCount: skills.length,
    highestDegree,
  };
}

// ============================================================================
// HELPERS
// ============================================================================

function formatMonthYear(date: Date | string | null): string {
  if (!date) return '';
  const d = new Date(date);
  if (isNaN(d.getTime())) return '';
  const months = [
    'Jan',
    'Feb',
    'Mar',
    'Apr',
    'May',
    'Jun',
    'Jul',
    'Aug',
    'Sep',
    'Oct',
    'Nov',
    'Dec',
  ];
  return `${months[d.getMonth()]} ${d.getFullYear()}`;
}

export function buildCareerTimeline(profile: PublicProfile): SnapCareerEntry[] {
  return (profile.workExperiences ?? []).map((exp) => {
    const startStr = formatMonthYear(exp.startDate);
    const endStr = exp.isCurrent ? 'Present' : formatMonthYear(exp.endDate);

    // Extract first bullet as highlight, strip HTML tags, truncate
    let highlight = '';
    if (exp.bullets && exp.bullets.length > 0) {
      highlight = exp.bullets[0]
        .replace(/<[^>]*>/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (highlight.length > 80) {
        highlight = highlight.substring(0, 77) + '...';
      }
    }

    return {
      role: exp.role,
      company: exp.company,
      period: `${startStr} → ${endStr}`,
      highlight,
      isCurrent: exp.isCurrent,
    };
  });
}

export function buildEducation(profile: PublicProfile): SnapEducationEntry[] {
  return (profile.educations ?? []).map((edu) => {
    const degree = [edu.degree, edu.fieldOfStudy].filter(Boolean).join(' in ');
    const endDate = edu.endDate ? new Date(edu.endDate) : null;
    const year = endDate && !isNaN(endDate.getTime()) ? String(endDate.getFullYear()) : '';

    let distinction: string | undefined;
    if (edu.gpa) distinction = `GPA: ${edu.gpa}`;
    else if (edu.honors && edu.honors.length > 0) distinction = edu.honors.join(', ');

    return {
      degree: degree || 'Degree',
      institution: edu.institution,
      year,
      distinction,
    };
  });
}

export function buildSkillClusters(profile: PublicProfile): SnapSkillCluster[] {
  const skillGroups = profile.skillGroups ?? [];
  const ungroupedSkills = profile.skills ?? [];

  // Use existing skill groups if available
  if (skillGroups.length > 0) {
    return skillGroups
      .filter((g) => g.skills.length > 0)
      .map((g) => ({
        category: g.name,
        skills: g.skills.map((s) => s.name).slice(0, 5),
      }))
      .slice(0, 4);
  }

  // Otherwise, cluster by level
  const expertSkills = ungroupedSkills.filter((s) => s.level === 'EXPERT');
  const advancedSkills = ungroupedSkills.filter((s) => s.level === 'ADVANCED');
  const otherSkills = ungroupedSkills.filter((s) => s.level !== 'EXPERT' && s.level !== 'ADVANCED');

  const clusters: SnapSkillCluster[] = [];

  if (expertSkills.length > 0) {
    clusters.push({
      category: 'Expert',
      skills: expertSkills.map((s) => s.name).slice(0, 5),
    });
  }
  if (advancedSkills.length > 0) {
    clusters.push({
      category: 'Advanced',
      skills: advancedSkills.map((s) => s.name).slice(0, 5),
    });
  }
  if (otherSkills.length > 0) {
    clusters.push({
      category: 'Proficient',
      skills: otherSkills.map((s) => s.name).slice(0, 5),
    });
  }

  return clusters.slice(0, 4);
}

export function buildKeyProjects(profile: PublicProfile): SnapProject[] {
  const projects = profile.projects ?? [];

  // Prioritize: featured first, then by stars, then by sort order
  const sorted = [...projects].sort((a, b) => {
    if (a.featured && !b.featured) return -1;
    if (!a.featured && b.featured) return 1;
    return (b.githubStars ?? 0) - (a.githubStars ?? 0);
  });

  return sorted.slice(0, 3).map((p) => {
    let impact = p.description ?? '';
    impact = impact
      .replace(/<[^>]*>/g, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (impact.length > 80) {
      impact = impact.substring(0, 77) + '...';
    }

    return {
      name: p.title,
      impact,
      tech: (p.techStack ?? []).slice(0, 3),
    };
  });
}

/**
 * Build a flat, deduplicated list of top skills for Follio bubble display.
 * Prioritizes: Expert > Advanced > others. Returns 8-12 skills max.
 */
export function buildTopSkills(profile: PublicProfile): string[] {
  const skills = profile.skills ?? [];
  const seen = new Set<string>();
  const result: string[] = [];

  const addSkill = (name: string) => {
    const key = name.toLowerCase().trim();
    if (!seen.has(key) && key.length > 0) {
      seen.add(key);
      result.push(name.trim());
    }
  };

  // Expert first, then Advanced, then rest
  const expert = skills.filter((s) => s.level === 'EXPERT');
  const advanced = skills.filter((s) => s.level === 'ADVANCED');
  const rest = skills.filter((s) => s.level !== 'EXPERT' && s.level !== 'ADVANCED');

  for (const s of expert) addSkill(s.name);
  for (const s of advanced) addSkill(s.name);
  for (const s of rest) addSkill(s.name);

  return result.slice(0, 12);
}

function buildAlgorithmicTagline(profile: PublicProfile, stats: SnapViewStats): string {
  const parts: string[] = [];

  if (profile.headline) {
    parts.push(profile.headline);
  } else {
    const currentRole = (profile.workExperiences ?? []).find((e) => e.isCurrent);
    if (currentRole) {
      parts.push(`${currentRole.role} at ${currentRole.company}`);
    }
  }

  if (stats.yearsOfExperience > 0) {
    parts.push(`${stats.yearsOfExperience}+ years of experience`);
  }

  return parts.join(' · ') || 'Professional';
}

export function buildAlgorithmicBrief(
  profile: PublicProfile,
  stats: SnapViewStats,
  timeline: SnapCareerEntry[]
): string {
  const name = `${profile.firstName ?? ''} ${profile.lastName ?? ''}`.trim() || 'This candidate';
  const parts: string[] = [];

  const currentRole = timeline.find((t) => t.isCurrent);
  if (currentRole && stats.yearsOfExperience > 0) {
    parts.push(
      `${name} is a ${currentRole.role} at ${currentRole.company} with ${stats.yearsOfExperience}+ years of professional experience across ${stats.companiesCount} ${stats.companiesCount === 1 ? 'organization' : 'organizations'}.`
    );
  } else if (stats.yearsOfExperience > 0) {
    parts.push(
      `${name} brings ${stats.yearsOfExperience}+ years of professional experience across ${stats.companiesCount} ${stats.companiesCount === 1 ? 'organization' : 'organizations'}.`
    );
  }

  if (stats.skillsCount > 0) {
    const topSkills = (profile.skills ?? [])
      .filter((s) => s.level === 'EXPERT')
      .map((s) => s.name)
      .slice(0, 3);

    if (topSkills.length > 0) {
      parts.push(`Expert-level proficiency in ${topSkills.join(', ')}.`);
    } else {
      parts.push(`Proficient across ${stats.skillsCount} technical skills.`);
    }
  }

  if (stats.highestDegree) {
    const edu = (profile.educations ?? [])[0];
    if (edu) {
      parts.push(`Holds a ${stats.highestDegree} from ${edu.institution}.`);
    }
  }

  return parts.join(' ') || `${name} is a qualified professional candidate.`;
}
