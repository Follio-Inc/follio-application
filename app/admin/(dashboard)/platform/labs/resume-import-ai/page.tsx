import { buildResumeLabView } from '@/_admin-panel/platform/labs/resume-import-ai';
import { ResumeLab } from '@/_admin-panel/platform/ui';
import { requireAdmin } from '@/lib/admin';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Resume import lab - Developer Platform - Admin',
  robots: { index: false, follow: false },
};

/**
 * Thin shim. The run lives in `_admin-panel/platform/labs/resume-import-ai`;
 * the markup lives in `_admin-panel/platform/ui`.
 */
export default async function AdminResumeImportLabPage() {
  await requireAdmin();
  return <ResumeLab view={buildResumeLabView()} />;
}
