import { FollioSection } from './follio-section';

interface FollioSkillsProps {
  skills: string[];
}

export function FollioSkills({ skills }: FollioSkillsProps) {
  return (
    <FollioSection title="Top skills">
      <ul className="flex flex-wrap gap-1.5">
        {skills.map((skill) => (
          <li
            key={skill}
            className="rounded-md border border-border/60 bg-muted/40 px-2.5 py-1 text-[13px] text-foreground/90"
          >
            {skill}
          </li>
        ))}
      </ul>
    </FollioSection>
  );
}
