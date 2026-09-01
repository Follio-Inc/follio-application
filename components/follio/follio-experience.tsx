import type { FollioExperienceItem } from '@/lib/follio-identity';

import { BrandMark } from './brand-mark';
import { FollioBrandPeek } from './follio-brand-peek';
import { FollioRolePeek } from './follio-detail-peek';
import { FollioSection } from './follio-section';
import { FollioTimeline, FollioTimelineItem } from './follio-timeline';

interface FollioExperienceProps {
  experience: FollioExperienceItem[];
  interactive?: boolean;
}

const NAME_HINT =
  'font-medium text-foreground/80 decoration-border/70 underline-offset-4 transition-colors hover:text-foreground hover:underline';
const ROLE_HINT = 'decoration-border/70 underline-offset-4 transition-colors hover:underline';

/** Career history as a connected timeline: role, employer, tenure, dates. */
export function FollioExperience({ experience, interactive = true }: FollioExperienceProps) {
  return (
    <FollioSection title="Experience">
      <FollioTimeline>
        {experience.map((item) => (
          <FollioTimelineItem
            key={item.id}
            current={item.isCurrent}
            node={
              <FollioBrandPeek
                name={item.company}
                url={item.companyUrl}
                kind="company"
                disabled={!interactive}
                className="block rounded-xl"
              >
                <BrandMark
                  name={item.company}
                  url={item.companyUrl}
                  kind="company"
                  className="h-11 w-11 rounded-xl"
                />
              </FollioBrandPeek>
            }
            title={
              <FollioRolePeek item={item} disabled={!interactive} className={ROLE_HINT}>
                {item.role}
              </FollioRolePeek>
            }
            trailing={item.period}
            subtitle={
              <span className="flex flex-wrap items-center gap-x-1.5">
                <FollioBrandPeek
                  name={item.company}
                  url={item.companyUrl}
                  kind="company"
                  disabled={!interactive}
                  className={NAME_HINT}
                >
                  {item.company}
                </FollioBrandPeek>
                {item.duration ? (
                  <>
                    <span aria-hidden className="text-muted-foreground/40">
                      ·
                    </span>
                    <span className="tabular-nums">{item.duration}</span>
                  </>
                ) : null}
              </span>
            }
          />
        ))}
      </FollioTimeline>
    </FollioSection>
  );
}
