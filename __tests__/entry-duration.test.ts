import { describe, expect, it } from 'vitest';

import {
  displayEntryDuration,
  displayEntryDurationFrom,
  formatEntryDuration,
  wrapEntrySubtitleHtml,
} from '@/lib/entry-duration';

describe('formatEntryDuration', () => {
  it('formats a multi-year range with leftover months', () => {
    expect(formatEntryDuration('2019-03-01', '2021-12-01', false)).toBe('2 yrs 10 mos');
  });

  it('formats months only under a year', () => {
    expect(formatEntryDuration('2020-01-01', '2020-08-01', false)).toBe('8 mos');
  });

  it('returns null without a start date', () => {
    expect(formatEntryDuration(null, '2020-08-01', false)).toBeNull();
  });
});

describe('displayEntryDuration', () => {
  it('hides the tag unless the user opted in', () => {
    expect(displayEntryDuration('2020-01-01', '2022-01-01', false)).toBeNull();
    expect(displayEntryDuration('2020-01-01', '2022-01-01', false, false)).toBeNull();
    expect(displayEntryDuration('2020-01-01', '2022-01-01', false, true)).toBe('2 yrs 1 mo');
  });

  it('reads durationVisible from an entry', () => {
    expect(
      displayEntryDurationFrom({
        startDate: '2020-01-01',
        endDate: '2021-01-01',
        isCurrent: false,
        durationVisible: true,
      })
    ).toBe('1 yr 1 mo');
    expect(
      displayEntryDurationFrom({
        startDate: '2020-01-01',
        endDate: '2021-01-01',
        isCurrent: false,
      })
    ).toBeNull();
  });
});

describe('wrapEntrySubtitleHtml', () => {
  const escape = (value: string) => value;

  it('leaves the subtitle unchanged when duration is hidden', () => {
    expect(wrapEntrySubtitleHtml('<p class="resume-entry-subtitle">Acme</p>', null, escape)).toBe(
      '<p class="resume-entry-subtitle">Acme</p>'
    );
  });

  it('places the duration tag on the subheading row', () => {
    expect(
      wrapEntrySubtitleHtml('<p class="resume-entry-subtitle">Acme</p>', '2 yrs 1 mo', escape)
    ).toBe(
      '<div class="resume-entry-subtitle-row"><p class="resume-entry-subtitle">Acme</p><span class="resume-section-tag">2 yrs 1 mo</span></div>'
    );
  });
});
