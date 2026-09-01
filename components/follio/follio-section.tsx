import { cn } from '@/lib/utils';

interface FollioSectionProps {
  title: string;
  children: React.ReactNode;
  className?: string;
}

/** Shared shell for the depth sections below the hero and connect blocks. */
export function FollioSection({ title, children, className }: FollioSectionProps) {
  return (
    <section className={cn('scroll-mt-24', className)}>
      <h2 className="text-eyebrow">{title}</h2>
      <div className="mt-4">{children}</div>
    </section>
  );
}
