import { redirect } from 'next/navigation';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Developer - Admin',
  robots: { index: false, follow: false },
};

/**
 * The old Developer panel, retired (PLATFORM_TODO item 25).
 *
 * `/admin/platform` is the canonical Developer Platform. This route stays so
 * existing bookmarks and the quick links the old panel published keep
 * working; it renders nothing of its own and imports no retired module.
 */
export default async function AdminDeveloperPage() {
  redirect('/admin/platform');
}
