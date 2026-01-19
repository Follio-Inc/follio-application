import { redirect } from 'next/navigation';

// Redirect /builder to /builder/basic-info
export default function BuilderPage() {
  redirect('/builder/basic-info');
}
