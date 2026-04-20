import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Privacy Policy · ${BRAND.name}`,
  description: `How ${BRAND.name} collects, uses, and protects your data.`,
};

export default function PrivacyPolicyPage() {
  return (
    <LegalPage title="Privacy Policy" effectiveDate="April 20, 2026">
      <p>
        {BRAND.name} (&ldquo;we,&rdquo; &ldquo;us&rdquo;) is a product of {BRAND.company}. This
        Privacy Policy explains what we collect when you use {BRAND.domain}, how we use it, and
        the choices you have. We designed the service to keep your network data yours — we do
        not sell it, we do not use it to train public models, and we scope every record to your
        account.
      </p>

      <h2>What we collect</h2>
      <h3>Information you provide</h3>
      <ul>
        <li>
          <strong>Account details.</strong> Email address, display name, and an optional profile
          photo, created through Firebase Authentication (email/password or Google sign-in).
        </li>
        <li>
          <strong>LinkedIn connections.</strong> The CSV export you upload, including each
          contact&apos;s name, company, position, email (if present), LinkedIn URL, and the date
          you connected.
        </li>
        <li>
          <strong>North Star &amp; preferences.</strong> Goals, interests, and context you enter
          in Settings so the AI can prioritize relevant connections.
        </li>
        <li>
          <strong>Calendar data.</strong> If you connect Google Calendar or Microsoft Outlook,
          we read upcoming event titles, times, locations, and attendee emails to power event
          pre-briefings. We do not modify your calendars.
        </li>
        <li>
          <strong>Reflections Match data.</strong> If you connect your Reflections Match twin,
          we store the persona traits and themes you choose to share so AI output can reflect
          your actual expertise.
        </li>
      </ul>

      <h3>Information we generate</h3>
      <ul>
        <li>AI-generated content: conversation starters, briefings, deep-dive analyses.</li>
        <li>Vector embeddings of contact text, used to power semantic search.</li>
        <li>Usage counters (queries, imports) used to enforce plan limits.</li>
      </ul>

      <h3>Information we receive from third parties</h3>
      <ul>
        <li>Billing status and subscription events from Stripe.</li>
        <li>Authentication tokens from Google and Microsoft for calendar access.</li>
      </ul>

      <h2>How we use your data</h2>
      <ul>
        <li>To provide core features: search, categorization, briefings, and deep dives.</li>
        <li>To personalize AI output to your goals and network.</li>
        <li>To operate billing, enforce plan limits, and send service notifications.</li>
        <li>To diagnose errors and improve reliability.</li>
      </ul>
      <p>
        We do <strong>not</strong> sell your data, share it with advertisers, or use your
        contacts or private content to train foundation models.
      </p>

      <h2>Where your data lives</h2>
      <p>
        Your account, contacts, and generated content are stored in Google Cloud Firestore,
        partitioned under your user ID. Calendar OAuth refresh tokens are stored server-side and
        never returned to the browser. Reflections Match API keys are encrypted at rest when an
        encryption secret is configured.
      </p>

      <h2>Service providers</h2>
      <p>We share the minimum necessary data with the following processors:</p>
      <ul>
        <li>
          <strong>Google Firebase</strong> — authentication, Firestore database, hosting.
        </li>
        <li>
          <strong>Anthropic</strong> — AI queries, categorization, and briefings (Claude API).
          Anthropic does not train its models on API data by default.
        </li>
        <li>
          <strong>OpenAI</strong> — text embeddings for semantic search. OpenAI does not train
          its models on API data.
        </li>
        <li>
          <strong>Stripe</strong> — subscription billing. Card details are handled by Stripe
          and never touch our servers.
        </li>
        <li>
          <strong>Google &amp; Microsoft</strong> — OAuth providers for calendar integration, if
          you enable it.
        </li>
      </ul>

      <h2>Retention and deletion</h2>
      <p>
        We keep your data for as long as your account is active. You can delete your profile
        photo, disconnect calendars, or remove your Reflections Match connection at any time
        from Settings. To delete your entire account and all associated data, email us at the
        address below; we will process the request within 30 days.
      </p>

      <h2>Your rights</h2>
      <p>
        Depending on where you live, you may have the right to access, correct, export, or
        delete your personal data, and to object to or restrict certain processing. Contact us
        to exercise any of these rights.
      </p>

      <h2>Children</h2>
      <p>
        {BRAND.name} is not directed to anyone under 16, and we do not knowingly collect data
        from children.
      </p>

      <h2>Changes to this policy</h2>
      <p>
        We will update this page and change the effective date whenever we make material
        changes. If changes affect how we use data you have already shared, we will notify you
        by email before they take effect.
      </p>

      <h2>Contact</h2>
      <p>
        Questions or requests? Reach us at{' '}
        <a href="mailto:privacy@daymakerconnect.com">privacy@daymakerconnect.com</a>.
      </p>
    </LegalPage>
  );
}
