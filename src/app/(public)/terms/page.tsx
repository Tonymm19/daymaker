import type { Metadata } from 'next';
import LegalPage from '@/components/legal/LegalPage';
import { BRAND } from '@/lib/brand.config';

export const metadata: Metadata = {
  title: `Terms of Service · ${BRAND.name}`,
  description: `The terms that govern your use of ${BRAND.name}.`,
};

export default function TermsPage() {
  return (
    <LegalPage title="Terms of Service" effectiveDate="April 20, 2026">
      <p>
        These Terms of Service (&ldquo;Terms&rdquo;) govern your use of {BRAND.name}, a service
        operated by {BRAND.company} (&ldquo;we,&rdquo; &ldquo;us&rdquo;). By creating an account
        or using the service, you agree to these Terms. If you do not agree, do not use the
        service.
      </p>

      <h2>1. The service</h2>
      <p>
        {BRAND.name} turns your LinkedIn network data into AI-powered relationship intelligence,
        including semantic search, contact categorization, event pre-briefings, and synergy
        deep dives. Features may change as we improve the product.
      </p>

      <h2>2. Your account</h2>
      <ul>
        <li>You must be at least 16 years old and legally able to enter a contract.</li>
        <li>
          You are responsible for the activity on your account and for keeping your credentials
          secure. Notify us immediately if you suspect unauthorized access.
        </li>
        <li>
          One person or legal entity per account. Do not share login credentials with others.
        </li>
      </ul>

      <h2>3. Your content</h2>
      <p>
        You retain all rights to the data you upload — your LinkedIn CSV, North Star, preferences,
        and any notes. You grant us a limited license to process that content solely to provide
        the service to you. We do not use your content to train public AI models or sell it to
        third parties.
      </p>
      <p>
        You represent that you have the right to upload and process any contact information you
        provide, and that doing so complies with applicable laws (including LinkedIn&apos;s terms,
        where relevant) and with any commitments you have made to the people in your network.
      </p>

      <h2>4. Acceptable use</h2>
      <p>You agree not to:</p>
      <ul>
        <li>
          Use the service to send unsolicited messages, harass, stalk, or otherwise harm the
          people in your network.
        </li>
        <li>Attempt to reverse-engineer, scrape, or resell the service.</li>
        <li>
          Upload malware, attempt to gain unauthorized access, or interfere with service
          availability.
        </li>
        <li>Use the AI features to generate illegal, defamatory, or deceptive content.</li>
        <li>
          Violate any applicable law, including data-protection laws (GDPR, CCPA) when handling
          personal data of people in your network.
        </li>
      </ul>

      <h2>5. Plans and billing</h2>
      <ul>
        <li>
          The <strong>Free</strong> plan includes limited monthly AI queries and a contact cap.
        </li>
        <li>
          The <strong>Pro</strong> plan is ${BRAND.proPriceMonthly}/month, billed through
          Stripe, and includes unlimited queries and full network access.
        </li>
        <li>
          Paid subscriptions renew monthly until canceled. You can cancel any time from the
          billing portal; access continues until the end of the current billing cycle.
        </li>
        <li>
          Fees are non-refundable except where required by law. We may change pricing with at
          least 30 days&apos; notice before renewal.
        </li>
      </ul>

      <h2>6. AI output</h2>
      <p>
        {BRAND.name} uses large language models from Anthropic and OpenAI to generate
        recommendations, briefings, and conversation starters. AI output can be incorrect,
        incomplete, or outdated. Review and use judgment before acting on any AI-generated
        suggestion, especially when reaching out to real people.
      </p>

      <h2>7. Third-party integrations</h2>
      <p>
        Optional integrations (Google Calendar, Microsoft Outlook, Reflections Match, LinkedIn
        exports) are governed by the third party&apos;s own terms. You are responsible for
        complying with those terms. Disabling an integration stops new data from flowing in;
        data already stored is handled per our Privacy Policy.
      </p>

      <h2>8. Intellectual property</h2>
      <p>
        The {BRAND.name} product, brand, UI, code, and documentation are owned by{' '}
        {BRAND.company}. These Terms do not grant you any rights to our trademarks, logos, or
        trade dress.
      </p>

      <h2>9. Termination</h2>
      <p>
        You can delete your account at any time by contacting us. We may suspend or terminate
        an account that violates these Terms, threatens the safety of others, or creates legal
        risk for the service. On termination we will delete or anonymize your data per our
        Privacy Policy.
      </p>

      <h2>10. Disclaimers</h2>
      <p>
        The service is provided <strong>&ldquo;as is&rdquo;</strong> and{' '}
        <strong>&ldquo;as available&rdquo;</strong>. To the fullest extent permitted by law, we
        disclaim all warranties, express or implied, including merchantability, fitness for a
        particular purpose, and non-infringement. We do not warrant that the service will be
        uninterrupted, error-free, or that AI output will be accurate.
      </p>

      <h2>11. Limitation of liability</h2>
      <p>
        To the fullest extent permitted by law, {BRAND.company} and its affiliates will not be
        liable for any indirect, incidental, special, consequential, or punitive damages, or
        for any loss of profits, revenues, data, or goodwill. Our total liability for any claim
        arising out of or relating to the service is limited to the amount you paid us in the
        12 months preceding the event giving rise to the claim, or $100 if you have not paid
        us anything.
      </p>

      <h2>12. Changes to the Terms</h2>
      <p>
        We may update these Terms from time to time. Material changes will be announced by
        email or in-app notice at least 14 days before they take effect. Continued use of the
        service after the effective date constitutes acceptance of the updated Terms.
      </p>

      <h2>13. Governing law</h2>
      <p>
        These Terms are governed by the laws of the State of California, without regard to its
        conflict-of-laws rules. Any dispute will be resolved in the state or federal courts
        located in Santa Clara County, California, and you consent to that jurisdiction.
      </p>

      <h2>14. Contact</h2>
      <p>
        Questions about these Terms? Reach us at{' '}
        <a href="mailto:legal@daymakerconnect.com">legal@daymakerconnect.com</a>.
      </p>
    </LegalPage>
  );
}
