export const metadata = {
  title: 'Admin - Follio',
  description: 'Follio platform administration',
};

/**
 * Root admin layout — no auth check here so `/admin/sign-in` can render freely.
 * Auth checks happen in the `(dashboard)` route group layout.
 */
export default function AdminLayout({ children }: { children: React.ReactNode }) {
  return <>{children}</>;
}
