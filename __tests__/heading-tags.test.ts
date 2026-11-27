import { describe, expect, it } from 'vitest';

import {
  EXPERIENCE_HEADING_TAG_GROUPS,
  canonicalHeadingTagLabel,
  employmentTypeFromTags,
  mergeHeadingTags,
  parseHeadingTags,
  resolveExperienceHeadingTags,
  tagFromEmploymentType,
  toggleHeadingTag,
} from '@/lib/heading-tags';

describe('heading tags', () => {
  it('parses string arrays from older custom sections', () => {
    expect(parseHeadingTags(['Full-time', 'Remote'])).toEqual([
      { label: 'Full Time', color: 'slate' },
      { label: 'Remote', color: 'slate' },
    ]);
  });

  it('parses JSON objects and drops empty or duplicate labels', () => {
    expect(
      parseHeadingTags([
        { label: 'Internship', color: 'teal' },
        { label: 'internship', color: 'blue' },
        { label: '  ' },
        { label: 'Pursuing', color: 'nope' },
      ])
    ).toEqual([
      { label: 'Internship', color: 'teal' },
      { label: 'Pursuing', color: 'slate' },
    ]);
  });

  it('canonicalizes common aliases', () => {
    expect(canonicalHeadingTagLabel('full-time')).toBe('Full Time');
    expect(canonicalHeadingTagLabel('in-person')).toBe('In Person');
    expect(canonicalHeadingTagLabel('open source')).toBe('Open Source');
  });

  it('merges employment type into experience heading tags without duplicating', () => {
    const tags = resolveExperienceHeadingTags({
      employmentType: 'FULL_TIME',
      headingTags: [{ label: 'Full Time', color: 'blue' }, { label: 'Remote' }],
    });
    expect(tags.map((tag) => tag.label)).toEqual(['Full Time', 'Remote']);
    expect(tags[0]?.color).toBe('blue');
  });

  it('keeps a stored employment-type chip when headingTags is empty', () => {
    expect(tagFromEmploymentType('INTERNSHIP')).toEqual({
      label: 'Internship',
      color: 'teal',
    });
    expect(resolveExperienceHeadingTags({ employmentType: 'INTERNSHIP' })).toEqual([
      { label: 'Internship', color: 'teal' },
    ]);
  });

  it('maps selected employment tags back to the enum', () => {
    expect(employmentTypeFromTags([{ label: 'Contract', color: 'blue' }])).toBe('CONTRACT');
    expect(employmentTypeFromTags([{ label: 'Remote' }])).toBeNull();
  });

  it('replaces other tags in an exclusive group', () => {
    const next = toggleHeadingTag(
      [{ label: 'Full Time', color: 'slate' }],
      { label: 'Internship', color: 'teal' },
      EXPERIENCE_HEADING_TAG_GROUPS
    );
    expect(next.map((tag) => tag.label)).toEqual(['Internship']);
  });

  it('toggles a tag off when it is already selected', () => {
    expect(toggleHeadingTag([{ label: 'Online', color: 'blue' }], 'Online')).toEqual([]);
  });

  it('merges tag lists in order without duplicates', () => {
    expect(
      mergeHeadingTags({ label: 'Pursuing', color: 'teal' }, [
        { label: 'pursuing' },
        { label: 'Online', color: 'blue' },
      ]).map((tag) => tag.label)
    ).toEqual(['Pursuing', 'Online']);
  });
});
