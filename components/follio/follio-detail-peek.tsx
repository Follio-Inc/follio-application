'use client';

import type { FollioEducationItem, FollioExperienceItem } from '@/lib/follio-identity';

import { FollioPeek } from './follio-peek';

interface FollioRolePeekProps {
  item: FollioExperienceItem;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Role peek: two proof points, then the résumé for the rest. */
export function FollioRolePeek({
  item,
  disabled = false,
  children,
  className,
}: FollioRolePeekProps) {
  const meta = [item.arrangement, item.location, item.duration].filter(Boolean);

  return (
    <FollioPeek
      label={`${item.role} at ${item.company}`}
      disabled={disabled}
      trigger={children}
      className={className}
    >
      <div className="space-y-2.5 break-words">
        <div>
          <p className="text-[15px] font-semibold leading-snug text-foreground">{item.role}</p>
          <p className="mt-0.5 text-[13px] text-muted-foreground">{item.company}</p>
        </div>
        {item.period || meta.length > 0 ? (
          <p className="text-[12.5px] leading-snug text-muted-foreground">
            {[item.period, ...meta].filter(Boolean).join(' · ')}
          </p>
        ) : null}
        {item.highlights.length > 0 ? (
          <ul className="space-y-1.5 text-[13px] leading-relaxed text-foreground/85">
            {item.highlights.map((line) => (
              <li key={line} className="relative pl-3.5">
                <span
                  aria-hidden
                  className="absolute left-0 top-[0.55em] h-1 w-1 rounded-full bg-foreground/35"
                />
                {line}
              </li>
            ))}
          </ul>
        ) : (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Role details live on the résumé.
          </p>
        )}
      </div>
    </FollioPeek>
  );
}

interface FollioStudyPeekProps {
  item: FollioEducationItem;
  disabled?: boolean;
  children: React.ReactNode;
  className?: string;
}

/** Education peek: credential and honors. Long academic notes stay on the résumé. */
export function FollioStudyPeek({
  item,
  disabled = false,
  children,
  className,
}: FollioStudyPeekProps) {
  const extras = [...item.honors, ...item.activities];

  return (
    <FollioPeek
      label={`Studies at ${item.institution}`}
      disabled={disabled}
      trigger={children}
      className={className}
    >
      <div className="space-y-2.5 break-words">
        <div>
          <p className="text-[15px] font-semibold leading-snug text-foreground">
            {item.institution}
          </p>
          {item.credential ? (
            <p className="mt-0.5 text-[13px] text-muted-foreground">{item.credential}</p>
          ) : null}
        </div>
        {item.period || item.location || item.gpa ? (
          <p className="text-[12.5px] leading-snug text-muted-foreground">
            {[item.period, item.location, item.gpa ? `GPA ${item.gpa}` : null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        ) : null}
        {!item.credential && !item.period && extras.length === 0 && !item.description ? (
          <p className="text-[13px] leading-relaxed text-muted-foreground">
            Academic details live on the résumé.
          </p>
        ) : null}
        {item.description ? (
          <p className="text-[13px] leading-relaxed text-foreground/85">{item.description}</p>
        ) : null}
        {extras.length > 0 ? (
          <ul className="space-y-1 text-[13px] leading-relaxed text-foreground/85">
            {extras.map((line) => (
              <li key={line} className="relative pl-3.5">
                <span
                  aria-hidden
                  className="absolute left-0 top-[0.55em] h-1 w-1 rounded-full bg-foreground/35"
                />
                {line}
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </FollioPeek>
  );
}
