import { redirect } from 'next/navigation';

// All sections are now rendered inline on /builder via AllSectionsEditor.
// Redirect any old /builder/[section] URLs back to /builder for backward compatibility.
export default async function SectionPage() {
  redirect('/builder');
}
