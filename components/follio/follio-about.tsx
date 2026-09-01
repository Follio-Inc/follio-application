import { FollioSection } from './follio-section';

interface FollioAboutProps {
  about: string;
}

export function FollioAbout({ about }: FollioAboutProps) {
  return (
    <FollioSection title="About">
      <p className="max-w-2xl text-pretty text-[15px] leading-7 text-foreground/90">{about}</p>
    </FollioSection>
  );
}
