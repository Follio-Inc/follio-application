import { redirect } from 'next/navigation';

// Redirect old dashboard URL to user's Follio
export default function DashboardPage() {
  redirect('/me');
}
