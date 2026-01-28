import { redirect } from 'next/navigation';

export const metadata = {
  title: 'Settings - Follio',
  description: 'Manage your Follio account settings',
};

export default function SettingsPage() {
  // Redirect to builder settings section
  redirect('/builder?section=settings');
}
