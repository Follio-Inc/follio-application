/**
 * Webmail compose helpers for share surfaces.
 * Domain → provider detection + compose URL builders only.
 * Message / subject copy lives in `./messages`.
 */

export interface WebmailProvider {
  name: string;
  logo: React.ReactNode;
  buildComposeUrl: (subject: string, body: string) => string;
}

const GMAIL_LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 shrink-0">
    <path fill="#4caf50" d="M45 16.2l-5 2.75-8 4.5V40h11c1.1 0 2-.9 2-2V16.2z" />
    <path fill="#1e88e5" d="M3 16.2l3.04 1.67L14 22.45V40H3c-1.1 0-2-.9-2-2V16.2z" />
    <path fill="#e53935" d="M35 11.2L24 19.45 13 11.2 12 17 24 25.45 36 17z" />
    <path fill="#c62828" d="M3 12.298V16.2l11 6.25V11.2L9.876 8.859z" />
    <path fill="#fbc02d" d="M45 12.298V16.2l-10 5.65V11.2l3.34-2.155z" />
  </svg>
);

const OUTLOOK_LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 shrink-0">
    <path
      fill="#1976d2"
      d="M33 10H15c-2.2 0-4 1.8-4 4v20c0 2.2 1.8 4 4 4h18c2.2 0 4-1.8 4-4V14c0-2.2-1.8-4-4-4z"
    />
    <path
      fill="#fff"
      d="M24 28.5c-3.6 0-6.5-2.9-6.5-6.5s2.9-6.5 6.5-6.5 6.5 2.9 6.5 6.5-2.9 6.5-6.5 6.5z"
    />
    <path fill="#1976d2" d="M24 17c-2.8 0-5 2.2-5 5s2.2 5 5 5 5-2.2 5-5-2.2-5-5-5z" />
  </svg>
);

const YAHOO_LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 shrink-0">
    <path
      fill="#7B0099"
      d="M24.1 6.5L15 28.2h4.2l1.7-4.3h6.4l1.7 4.3H33L24.1 6.5zm-.1 7.1l2.3 5.8h-4.6l2.3-5.8zM21.5 31.5h5v5.5h-5z"
    />
  </svg>
);

const AOL_LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 shrink-0">
    <circle cx="24" cy="24" r="18" fill="#3399FF" />
    <text
      x="24"
      y="29"
      textAnchor="middle"
      fill="#fff"
      fontSize="14"
      fontWeight="700"
      fontFamily="sans-serif"
    >
      AoL
    </text>
  </svg>
);

const ZOHO_LOGO = (
  <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 48 48" className="h-3.5 w-3.5 shrink-0">
    <rect width="48" height="48" rx="8" fill="#E42527" />
    <text
      x="24"
      y="30"
      textAnchor="middle"
      fill="#fff"
      fontSize="16"
      fontWeight="700"
      fontFamily="sans-serif"
    >
      Z
    </text>
  </svg>
);

function gmailCompose(subject: string, body: string): string {
  return `https://mail.google.com/mail/?view=cm&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function outlookCompose(subject: string, body: string): string {
  return `https://outlook.live.com/mail/0/deeplink/compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function yahooCompose(subject: string, body: string): string {
  return `https://compose.mail.yahoo.com/?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function aolCompose(subject: string, body: string): string {
  return `https://mail.aol.com/webmail-std/en-us/suite#/compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

function zohoCompose(subject: string, body: string): string {
  return `https://mail.zoho.com/zm/#compose?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
}

export const WEBMAIL_PROVIDERS: Record<string, WebmailProvider> = {
  'gmail.com': { name: 'Gmail', logo: GMAIL_LOGO, buildComposeUrl: gmailCompose },
  'googlemail.com': { name: 'Gmail', logo: GMAIL_LOGO, buildComposeUrl: gmailCompose },
  'outlook.com': { name: 'Outlook', logo: OUTLOOK_LOGO, buildComposeUrl: outlookCompose },
  'hotmail.com': { name: 'Outlook', logo: OUTLOOK_LOGO, buildComposeUrl: outlookCompose },
  'live.com': { name: 'Outlook', logo: OUTLOOK_LOGO, buildComposeUrl: outlookCompose },
  'msn.com': { name: 'Outlook', logo: OUTLOOK_LOGO, buildComposeUrl: outlookCompose },
  'yahoo.com': { name: 'Yahoo Mail', logo: YAHOO_LOGO, buildComposeUrl: yahooCompose },
  'yahoo.co.in': { name: 'Yahoo Mail', logo: YAHOO_LOGO, buildComposeUrl: yahooCompose },
  'yahoo.co.uk': { name: 'Yahoo Mail', logo: YAHOO_LOGO, buildComposeUrl: yahooCompose },
  'ymail.com': { name: 'Yahoo Mail', logo: YAHOO_LOGO, buildComposeUrl: yahooCompose },
  'aol.com': { name: 'AOL Mail', logo: AOL_LOGO, buildComposeUrl: aolCompose },
  'zoho.com': { name: 'Zoho Mail', logo: ZOHO_LOGO, buildComposeUrl: zohoCompose },
  'zohomail.com': { name: 'Zoho Mail', logo: ZOHO_LOGO, buildComposeUrl: zohoCompose },
};

export function detectWebmailProvider(email: string | null | undefined): WebmailProvider | null {
  if (!email) return null;
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  return WEBMAIL_PROVIDERS[domain] ?? null;
}

/** Open the provider compose window; no-op when provider is missing. */
export function openWebmailCompose(
  provider: WebmailProvider | null | undefined,
  subject: string,
  body: string
): void {
  if (!provider) return;
  window.open(provider.buildComposeUrl(subject, body), '_blank', 'noopener,noreferrer');
}
