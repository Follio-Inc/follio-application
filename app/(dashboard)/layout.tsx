import { UserMenu } from '@/components/auth/user-menu';
import { DashboardTopbar } from '@/components/dashboard-sidebar';
import { ResumeSwitcher } from './builder/components/resume-switcher';

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-muted/30">
      {/* LinkedIn-style top navigation bar */}
      <DashboardTopbar>
        <div className="flex items-center gap-2">
          <ResumeSwitcher />
          <UserMenu />
        </div>
      </DashboardTopbar>

      {/* Page content */}
      <main className="flex-1 overflow-auto">{children}</main>
    </div>
  );
}
