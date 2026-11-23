import { useConsent } from "@/components/consent/consent-ui";

function Ph({ children }: { children: string }) {
  return <span className="privacy-ph">{children}</span>;
}

function Verify() {
  return <span className="privacy-verify">[verify]</span>;
}

const CONTENTS: Array<[string, string]> = [
  ["who", "Who we are"],
  ["collect", "What we collect"],
  ["bases", "Why we use it, and our legal bases"],
  ["processors", "Who helps us run Looktag"],
  ["shop", "Shop links"],
  ["cookies", "Cookies and similar storage"],
  ["retention", "How long we keep it"],
  ["rights", "Your rights"],
  ["choices", "Privacy choices"],
  ["children", "Children"],
  ["changes", "Changes"],
  ["contact", "Contact"],
];

export function PrivacyArticle({ email }: { email: string }) {
  const { openChoices } = useConsent();
  return (
    <article className="privacy-article" data-testid="legal-privacy">
      <h1>Privacy</h1>
      <p className="privacy-updated">Last updated: <Ph>[PUBLISH DATE]</Ph></p>
      <p>This page explains what Looktag collects, why, who helps us run it, and the choices you have. We keep it short and plain. If anything is unclear, write to us.</p>
      <nav className="privacy-contents" aria-label="Contents">
        <ol>
          {CONTENTS.map(([id, label]) => (
            <li key={id}><a href={`#${id}`}>{label}</a></li>
          ))}
        </ol>
      </nav>

      <h2 id="who">Who we are</h2>
      <p>
        Looktag (thelooktag.com) is run by <Ph>[LEGAL NAME]</Ph>, <Ph>[POSTAL ADDRESS]</Ph>. We decide how your data is used, so we are the controller under GDPR and the UK GDPR, and the Data Fiduciary under India's DPDP Act.
      </p>
      <p>
        Contact: <a href={`mailto:${email}`}>{email}</a>. We don't have a data protection officer because we're not required to.
      </p>

      <h2 id="collect">What we collect</h2>
      <p>Your account</p>
      <ul>
        <li>When you sign in with Google or with your email, we get your name and email address, and your profile picture if your Google account has one.</li>
        <li>We keep a session record so you stay signed in. It stores the time, your IP address and your browser's user agent.</li>
        <li>If you fill in your profile: your handle, city and bio.</li>
      </ul>
      <p>Your looks and photos</p>
      <ul>
        <li>Photos you upload, the crop, the pins you place, titles, and the piece names and shop links you add. Published looks are public. Drafts are visible only to you.</li>
        <li>We re-encode photos into web sizes.</li>
        <li>If you use Find pieces, the photo is sent to our AI provider to suggest pieces.</li>
      </ul>
      <p>Saves and follows</p>
      <ul>
        <li>Looks you save, and creators and houses you follow. Before you sign in, these stay only on your device. After you sign in, they're linked to your account so they sync.</li>
      </ul>
      <p>Analytics, only with your choice</p>
      <ul>
        <li>If analytics is on, PostHog records the pages and looks you open; taps like Save, Follow, Shop and Share; steps in Create; device type, browser, screen size and page speed; and errors the app runs into. If you're signed in, events carry your Looktag account ID, never your name or email.</li>
        <li>We don't use session recording, ad trackers or advertising profiles.</li>
      </ul>

      <h2 id="bases">Why we use it, and our legal bases</h2>
      <table>
        <thead><tr><th>Purpose</th><th>Data</th><th>EU/UK basis</th></tr></thead>
        <tbody>
          <tr><td>Run your account and keep you signed in</td><td>Account, session</td><td>Contract (Art. 6(1)(b))</td></tr>
          <tr><td>Publish and show your looks</td><td>Looks, photos, profile</td><td>Contract</td></tr>
          <tr><td>Sync saves and follows</td><td>Saves, follows</td><td>Contract</td></tr>
          <tr><td>Keep Looktag secure and working (server logs, traces)</td><td>IP, request data</td><td>Legitimate interests (Art. 6(1)(f))</td></tr>
          <tr><td>Analytics to improve Looktag</td><td>Analytics events</td><td>Consent (Art. 6(1)(a), §25 TDDDG)</td></tr>
        </tbody>
      </table>
      <p>United States: analytics starts only after you've seen our notice, and you can opt out at any time. We honour Global Privacy Control as an opt-out. We don't sell or share your personal information as the CCPA defines it.</p>
      <p>India: we process your personal data under the DPDP Act on the basis of your consent for analytics and for the account features you ask for. You can withdraw consent as easily as you gave it.</p>
      <p>Elsewhere: you'll see a notice and can opt out of analytics at any time. EU, UK and any visitor whose region we can't detect get the opt-in choice.</p>

      <h2 id="processors">Who helps us run Looktag</h2>
      <p>These providers process data for us under contract, and only on our instructions.</p>
      <table>
        <thead><tr><th>Provider</th><th>What for</th><th>Where</th></tr></thead>
        <tbody>
          <tr><td>Render</td><td>Hosting the app</td><td>Frankfurt, Germany</td></tr>
          <tr><td>Neon</td><td>Database</td><td>AWS eu-central-1, Frankfurt</td></tr>
          <tr><td>Cloudflare</td><td>DNS and network edge; R2 photo storage (img.thelooktag.com), bucket looktag-photos-eu in Western Europe (WEUR)</td><td>Global edge; R2 location WEUR</td></tr>
          <tr><td>PostHog</td><td>Product analytics, only after consent</td><td>EU Cloud (eu.posthog.com)</td></tr>
          <tr><td>Grafana Cloud</td><td>Server traces and errors for reliability</td><td>prod-eu-west-2 (Germany)</td></tr>
          <tr><td>Sign-in broker and Google</td><td>Signing you in</td><td><Verify /></td></tr>
          <tr><td>xAI</td><td>Find pieces suggestions from your photo</td><td><Verify /></td></tr>
        </tbody>
      </table>
      <p>Where data leaves the EU or UK, we rely on adequacy decisions or Standard Contractual Clauses.</p>

      <h2 id="shop">Shop links</h2>
      <p>Shop buttons take you to the retailer, for example Zalando. Some are affiliate links, so we may earn a commission if you buy, at no extra cost to you. They're labelled as ads where the law requires it.</p>
      <p>Once you leave Looktag, the retailer and the affiliate network handle your visit under their own privacy policies and may set their own cookies. We don't receive your purchase details, only an aggregate commission report.</p>

      <h2 id="cookies">Cookies and similar storage</h2>
      <table>
        <thead><tr><th>Name</th><th>Purpose</th><th>Lasts</th></tr></thead>
        <tbody>
          <tr><td>__Host-grok-auth.session_token</td><td>Keeps you signed in (essential)</td><td>Until the session expires or you sign out</td></tr>
          <tr><td>__Host-grok-auth.session_data</td><td>Short-lived signed session cache (essential)</td><td>5 minutes</td></tr>
          <tr><td>__Host-grok-auth.dont_remember / account_data</td><td>Sign-in options (essential)</td><td>Session</td></tr>
          <tr><td>__Host-grok_gate_session</td><td>Sign-in marker (essential)</td><td>Session</td></tr>
          <tr><td>lt_consent (+ lt_consent_at, lt_consent_basis, lt_consent_v)</td><td>Remembers your analytics choice (essential)</td><td>12 months</td></tr>
          <tr><td>Device storage (looktag-saved-v1, looktag-followed-*, looktag-create-draft-v1 and others)</td><td>Saves, follows, drafts and feed state on this device (essential to the features)</td><td>Until you clear them</td></tr>
          <tr><td>ph_* (PostHog)</td><td>Analytics, only after you allow it</td><td>Up to 1 year (PostHog default)</td></tr>
        </tbody>
      </table>

      <h2 id="retention">How long we keep it</h2>
      <ul>
        <li>Account and looks: until you delete them or ask us to delete your account.</li>
        <li>Sessions: until they expire or you sign out. <Ph>[RETENTION]</Ph></li>
        <li>Server traces: 14 days on the current Grafana Cloud plan. <Ph>[RETENTION]</Ph></li>
        <li>Analytics events: 1 year on the current PostHog Cloud EU plan. <Ph>[RETENTION]</Ph></li>
        <li>Backups: <Ph>[RETENTION]</Ph></li>
        <li>Emails to us: <Ph>[RETENTION]</Ph></li>
      </ul>

      <h2 id="rights">Your rights</h2>
      <p>You can ask to see, correct, export or delete your data; to restrict or object to processing; and to withdraw consent at any time without affecting what happened before.</p>
      <p>To exercise them, write to <a href={`mailto:${email}`}>{email}</a> from the email on your account. We reply within one month. We delete accounts on request by email. There is no self-serve deletion in the app.</p>
      <p>EU: you can complain to your local data protection authority. UK: the ICO. India: you can raise a grievance with us first and then with the Data Protection Board of India. US residents of states with privacy laws can use the same contact; we won't treat you differently for using your rights.</p>

      <h2 id="choices">Privacy choices</h2>
      <p>Change your analytics choice at any time: footer › Privacy choices, or on your phone: You › Privacy choices. Turning analytics off stops it straight away and clears its cookies.</p>
      <button type="button" className="consent-btn consent-btn-ghost privacy-open" onClick={openChoices}>Open Privacy choices</button>

      <h2 id="children">Children</h2>
      <p>Looktag isn't meant for children. You need to be at least <Ph>[MINIMUM AGE]</Ph> to create an account. If you think a child has given us data, write to us and we'll delete it.</p>

      <h2 id="changes">Changes</h2>
      <p>If we change this page in a way that matters, we'll update the date above and, where your choice is affected, ask again.</p>

      <h2 id="contact">Contact</h2>
      <p><Ph>[LEGAL NAME]</Ph>, <Ph>[POSTAL ADDRESS]</Ph>, <a href={`mailto:${email}`}>{email}</a>. The Impressum has our full legal details.</p>
    </article>
  );
}
