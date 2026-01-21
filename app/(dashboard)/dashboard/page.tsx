import { redirect } from 'next/navigation';

// Redirect old dashboard URL to builder
export default function DashboardPage() {
  redirect('/builder');
}
