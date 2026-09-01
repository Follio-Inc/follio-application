import type { FollioEducationItem } from '@/lib/follio-identity';

import { BrandMark } from './brand-mark';
import { FollioBrandPeek } from './follio-brand-peek';
import { FollioStudyPeek } from './follio-detail-peek';
import { FollioSection } from './follio-section';
import { FollioTimeline, FollioTimelineItem } from './follio-timeline';

interface FollioEducationProps {
  education: FollioEducationItem[];
  interactive?: boolean;
}

const NAME_HINT = 'decoration-border/70 underline-offset-4 transition-colors hover:underline';
const CREDENTIAL_HINT = 'decoration-border/70 underline-offset-4 transition-colors hover:underline';

/** Schooling on the same timeline treatment as experience, kept to one line each. */
export function FollioEducation({ education, interactive = true }: FollioEducationProps) {
  return (
    <FollioSection title="Education">
      <FollioTimeline>
        {education.map((item) => (
          <FollioTimelineItem
            key={item.id}
            node={
              <FollioBrandPeek
                name={item.institution}
                url={item.institutionUrl}
                kind="school"
                disabled={!interactive}
                className="block rounded-xl"
              >
                <BrandMark
                  name={item.institution}
                  url={item.institutionUrl}
                  kind="school"
                  className="h-11 w-11 rounded-xl"
                />
              </FollioBrandPeek>
            }
            title={
              item.credential ? (
                <FollioBrandPeek
                  name={item.institution}
                  url={item.institutionUrl}
                  kind="school"
                  disabled={!interactive}
                  className={NAME_HINT}
                >
                  {item.institution}
                </FollioBrandPeek>
              ) : (
                <FollioStudyPeek item={item} disabled={!interactive} className={NAME_HINT}>
                  {item.institution}
                </FollioStudyPeek>
              )
            }
            trailing={item.period}
            subtitle={
              item.credential ? (
                <FollioStudyPeek item={item} disabled={!interactive} className={CREDENTIAL_HINT}>
                  {item.credential}
                </FollioStudyPeek>
              ) : null
            }
          />
        ))}
      </FollioTimeline>
    </FollioSection>
  );
}
