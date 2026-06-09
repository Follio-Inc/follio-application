# Google OAuth Verification Checklist (Clerk + Follio)

Use this checklist before submitting for verification in Google Auth Platform.

## 1) Branding and app identity

- App name in Google Auth Platform matches the product name shown on homepage.
- Homepage URL is publicly accessible without login and clearly explains what the app does.
- Privacy Policy URL is publicly accessible and specifically explains Google Sign-In data usage.
- Terms of Service URL is publicly accessible.
- Support email and developer contact are active and monitored.

## 2) Domain and link consistency

- Domains used in Homepage, Privacy Policy, Terms, and contact details are consistent.
- All links configured in Google Auth Platform resolve successfully and return HTTP 200.
- App logo and company name are consistent across consent screen and website.

## 3) OAuth consent screen scope hygiene

For Google Sign-In through Clerk, keep scopes minimal unless strictly required.

- Required for basic Google identity:
  - openid
  - email
  - profile
- Do not request Gmail, Drive, Contacts, Calendar, or other sensitive/restricted scopes unless your product truly needs them.

If you add sensitive/restricted scopes later:

- Update privacy policy with exact data use and retention details.
- Prepare demo video and full justification for each scope.

## 4) Clerk-specific configuration checks

- In Clerk Dashboard, Google social connection uses your production Google OAuth client.
- Authorized redirect URIs in Google Cloud include Clerk callback URIs exactly as shown by Clerk.
- Allowed origins, authorized domains, and redirect URIs match production environment values.
- Sign-in and sign-up callback routes in app are working:
  - /sign-in/sso-callback
  - /sign-up/sso-callback

## 5) Verification reviewer readiness

- Homepage has a plain-language statement of product purpose above the fold.
- Privacy page has a dedicated section for Google Sign-In data handling.
- Terms and privacy links are visible from sign-in/sign-up and homepage.
- Contact page is live and includes legal/privacy support route.

## 6) Final pre-submit smoke tests

- Anonymous browser session:
  - Open homepage, privacy, terms, contact links.
  - Confirm no auth wall appears.
- Start Google Sign-In and confirm consent screen branding and links are correct.
- Complete sign-in and verify account creation flow works end-to-end.
- Confirm no unexpected permission prompt appears beyond identity scopes.

## 7) Common rejection reasons and fixes

- "Home page does not explain app purpose":
  - Add explicit one-paragraph purpose statement near hero.
- "Privacy policy insufficient":
  - Add a section naming Google data collected and what is not collected.
- "Link/domain mismatch":
  - Align domain references and support emails across pages and console settings.
- "Unnecessary scopes":
  - Remove extra scopes and re-submit with only identity scopes.

## 8) Notes

This checklist improves your readiness but Google can still request additional evidence depending on scope category, app risk signals, and policy updates.

## 9) Copy-paste consent screen text (recommended)

Use this language in Google Auth Platform so it matches the live website.

- App name:
  - Follio
- User support email:
  - Use the monitored support inbox in your Google Auth settings.
- App logo:
  - Use the same logo shown on the homepage.
- Application home page:
  - https://follio.app/
- Privacy policy link:
  - https://follio.app/privacy
- Terms of service link:
  - https://follio.app/terms

Suggested app description:

"Follio helps job seekers and professionals build one living profile and share it as a resume, portfolio, or quick snapshot through a single link."

If your production domain is currently different, replace all links above with the exact production domain used by your live app and Clerk redirects.

## 10) Clerk + Google exact setup flow

1. In Clerk Dashboard:
   - Enable Google social connection.
   - Copy the exact redirect URI shown by Clerk for your instance.
2. In Google Cloud Console (OAuth client):
   - Add Clerk redirect URI exactly (character-for-character).
   - Add authorized JavaScript origins for your production app.
3. In Google Auth Platform (consent screen):
   - Add authorized domains used by homepage/privacy/terms and Clerk redirect host.
   - Set homepage/privacy/terms URLs to public, working pages.
4. In app config:
   - Ensure NEXT_PUBLIC_APP_URL points to your production app URL.
   - Ensure sign-in/up callbacks are reachable:
     - /sign-in/sso-callback
     - /sign-up/sso-callback

## 11) Final reviewer simulation (do this before submit)

Run these checks in an incognito window while signed out:

1. Open homepage and confirm app purpose is clear above the fold.
2. Open privacy page and confirm Google Sign-In data section is visible.
3. Open terms page and confirm legal contact details are present.
4. Start "Sign in with Google" and verify:
   - App name and logo are correct.
   - Homepage/privacy/terms links open correctly.
   - Requested scopes are only openid, email, and profile.
5. Complete sign-in successfully and land in app.
