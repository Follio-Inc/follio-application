/**
 * Skill group formatting helpers
 */

import {
  editorRowsToDraftSkillGroups,
  extractSkillNamesFromHtml,
  flattenSkillGroups,
  formatSkillsList,
  normalizeSkillGroups,
  parseCommaSeparatedSkills,
  resolveSkillCategoryLabel,
  resolveSkillsHtml,
  skillGroupsFromFlatSkills,
  skillGroupsHaveCategoryLabels,
  skillsToHtml,
} from '@/lib/skills/groups';
import { describe, expect, it } from 'vitest';

describe('parseCommaSeparatedSkills', () => {
  it('splits and trims comma-separated skills', () => {
    expect(parseCommaSeparatedSkills('Python, Java, TypeScript')).toEqual([
      'Python',
      'Java',
      'TypeScript',
    ]);
  });

  it('deduplicates case-insensitively', () => {
    expect(parseCommaSeparatedSkills('Python, python, JAVA')).toEqual(['Python', 'JAVA']);
  });
});

describe('skillsToHtml / extractSkillNamesFromHtml', () => {
  it('builds justified paragraph HTML', () => {
    expect(skillsToHtml(['React', 'Node'])).toBe('<p style="text-align: justify">React, Node</p>');
  });

  it('extracts names from justified CSV HTML', () => {
    expect(extractSkillNamesFromHtml(skillsToHtml(['React', 'Node']))).toEqual(['React', 'Node']);
  });

  it('extracts names from bullet lists', () => {
    const html =
      '<ul data-bullet-style="disc" class="rich-text-bullets"><li><p>Python</p></li><li><p><strong>Go</strong></p></li></ul>';
    expect(extractSkillNamesFromHtml(html)).toEqual(['Python', 'Go']);
  });

  it('resolveSkillsHtml prefers stored HTML', () => {
    const html = '<p style="text-align: justify"><strong>React</strong></p>';
    expect(resolveSkillsHtml(html, ['React'])).toBe(html);
    expect(resolveSkillsHtml(null, ['React'])).toBe(skillsToHtml(['React']));
  });
});

describe('normalizeSkillGroups', () => {
  it('uses Skills when category is blank but skills exist', () => {
    expect(normalizeSkillGroups([{ name: '', skills: 'React, Node' }])).toEqual([
      {
        name: 'Skills',
        skills: ['React', 'Node'],
        skillsHtml: skillsToHtml(['React', 'Node']),
      },
    ]);
  });

  it('skips empty rows', () => {
    expect(normalizeSkillGroups([{ name: '', skills: '' }])).toEqual([]);
  });

  it('keeps category + skills pairs', () => {
    expect(
      normalizeSkillGroups([
        { name: 'Languages', skills: 'Python, Go' },
        { name: 'Frameworks', skills: ['React', 'Django'] },
      ])
    ).toEqual([
      {
        name: 'Languages',
        skills: ['Python', 'Go'],
        skillsHtml: skillsToHtml(['Python', 'Go']),
      },
      {
        name: 'Frameworks',
        skills: ['React', 'Django'],
        skillsHtml: skillsToHtml(['React', 'Django']),
      },
    ]);
  });

  it('prefers skillsHtml when provided', () => {
    const html = '<p style="text-align: justify"><strong>Rust</strong>, Go</p>';
    expect(normalizeSkillGroups([{ name: 'Languages', skills: [], skillsHtml: html }])).toEqual([
      { name: 'Languages', skills: ['Rust', 'Go'], skillsHtml: html },
    ]);
  });
});

describe('flattenSkillGroups', () => {
  it('flattens unique skills in order', () => {
    expect(
      flattenSkillGroups([
        { name: 'Languages', skills: ['Python', 'Go'] },
        { name: 'Tools', skills: ['Python', 'Docker'] },
      ])
    ).toEqual(['Python', 'Go', 'Docker']);
  });
});

describe('skillGroupsFromFlatSkills', () => {
  it('wraps flat skills in a Skills category', () => {
    expect(skillGroupsFromFlatSkills(['React', 'Node'])).toEqual([
      {
        name: 'Skills',
        skills: ['React', 'Node'],
        skillsHtml: skillsToHtml(['React', 'Node']),
      },
    ]);
  });

  it('returns empty for no skills', () => {
    expect(skillGroupsFromFlatSkills([])).toEqual([]);
  });
});

describe('formatSkillsList', () => {
  it('joins with commas', () => {
    expect(formatSkillsList(['Python', 'Java'])).toBe('Python, Java');
  });
});

describe('resolveSkillCategoryLabel', () => {
  it('returns null for blank names', () => {
    expect(resolveSkillCategoryLabel('', ['Languages'])).toBeNull();
    expect(resolveSkillCategoryLabel('   ', ['Languages'])).toBeNull();
  });

  it('hides the sole generic Skills bucket', () => {
    expect(resolveSkillCategoryLabel('Skills', ['Skills'])).toBeNull();
  });

  it('keeps real category names', () => {
    expect(resolveSkillCategoryLabel('Languages', ['Languages', 'Tools'])).toBe('Languages');
    expect(resolveSkillCategoryLabel('Skills', ['Languages', 'Skills'])).toBe('Skills');
  });
});

describe('skillGroupsHaveCategoryLabels', () => {
  it('is false for a sole Skills group or blank names', () => {
    expect(skillGroupsHaveCategoryLabels([{ name: 'Skills' }])).toBe(false);
    expect(skillGroupsHaveCategoryLabels([{ name: '' }])).toBe(false);
  });

  it('is true when any real category is present', () => {
    expect(skillGroupsHaveCategoryLabels([{ name: 'Languages' }, { name: 'Frameworks' }])).toBe(
      true
    );
  });
});

describe('editorRowsToDraftSkillGroups', () => {
  it('maps editor HTML onto the preview skill-group shape', () => {
    expect(
      editorRowsToDraftSkillGroups([
        { id: 'g1', name: 'Languages', skillsHtml: skillsToHtml(['Python', 'Go']) },
      ])
    ).toEqual([
      {
        id: 'g1',
        name: 'Languages',
        sortOrder: 0,
        skillsHtml: skillsToHtml(['Python', 'Go']),
        skills: [
          { id: 'g1:0', name: 'Python', groupId: 'g1', sortOrder: 0 },
          { id: 'g1:1', name: 'Go', groupId: 'g1', sortOrder: 1 },
        ],
      },
    ]);
  });

  it('drops empty rows so cleared skills disappear from the preview', () => {
    expect(
      editorRowsToDraftSkillGroups([
        { id: 'g1', name: '', skillsHtml: '' },
        { id: 'g2', name: 'Tools', skillsHtml: skillsToHtml(['Figma']) },
      ])
    ).toEqual([
      {
        id: 'g2',
        name: 'Tools',
        sortOrder: 1,
        skillsHtml: skillsToHtml(['Figma']),
        skills: [{ id: 'g2:0', name: 'Figma', groupId: 'g2', sortOrder: 0 }],
      },
    ]);
  });
});
