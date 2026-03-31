import { ExternalLink } from 'lucide-react'

export default function GtmDocsPage() {
  return (
    <div className="flex flex-col gap-8 max-w-2xl">
      <div>
        <h1 className="text-xl font-semibold">GTM Setup Docs</h1>
        <p className="text-sm text-muted-foreground mt-1">
          Reference guide for connecting Google Tag Manager Automation Engine to your GTM container.
        </p>
      </div>

      {/* Additional Instructions guide */}
      <DocSection title="Using Additional Instructions">
        <p>
          Every pipeline step has an <strong>Additional Instructions</strong> field at the top of the page.
          Text entered here is appended to Claude's prompt every time that step runs — giving you precise control over how the AI behaves without editing any config files.
        </p>
        <p className="mt-2">Instructions persist between runs. Set them once and they apply to every subsequent run of that step until you clear them.</p>

        <div className="mt-3 flex flex-col gap-3">
          <InstructionExample
            step="Audit"
            examples={[
              'Focus only on the checkout and signup flows',
              'Ignore legacy /blog pages — they will be deprecated',
              'Flag any elements missing aria-label attributes as well',
            ]}
          />
          <InstructionExample
            step="Prepare Elements"
            examples={[
              'Prefix all data-gtm-id values with shop_ for the e-commerce section',
              'Skip any elements inside .legacy-widget containers',
              'Use kebab-case for all IDs, not snake_case',
            ]}
          />
          <InstructionExample
            step="Strategy"
            examples={[
              'Prioritise lead gen events over engagement metrics',
              'We use Segment as middleware — do not add direct GA4 calls',
              'Include scroll depth tracking on all long-form content pages',
            ]}
          />
          <InstructionExample
            step="Implementation"
            examples={[
              'Do not modify any files under /vendor or /legacy',
              'Use TypeScript-compatible imports throughout',
              'Add a JSDoc comment above every dataLayer.push() call',
            ]}
          />
          <InstructionExample
            step="Testing"
            examples={[
              'Skip form validation events — we test those manually',
              'Also verify the GA4 measurement ID matches the production value G-XXXXXXXX',
              'Focus only on P0 priority events from the tracking plan',
            ]}
          />
          <InstructionExample
            step="Reporting"
            examples={[
              'Include a section on what was intentionally skipped and why',
              'Keep the report under 800 words',
              'Add a next steps section with 3 recommended follow-up actions',
            ]}
          />
        </div>

        <div className="mt-4 border border-border bg-muted/20 px-4 py-3">
          <p className="text-[12px] font-semibold mb-1">Tips</p>
          <ul className="flex flex-col gap-1">
            {[
              'Be specific. "Focus on checkout" works better than "be thorough".',
              'One instruction per line keeps prompts readable and easier to edit.',
              'Instructions add context — they do not override the skill\'s core purpose.',
              'Hover the ? icon next to "Additional Instructions" on any step page for examples specific to that step.',
            ].map(tip => (
              <li key={tip} className="flex items-start gap-1.5 text-[12px] text-muted-foreground">
                <span className="mt-0.5 shrink-0 opacity-40">·</span>
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </div>
      </DocSection>

      {/* Section 1: Account ID and Container ID */}
      <DocSection title="Finding your GTM Account ID and Container ID">
        <p>You need two values from your Google Tag Manager account:</p>
        <ol className="list-decimal list-inside flex flex-col gap-2 mt-3">
          <li>
            <strong>GTM Account ID</strong> (numeric, e.g. <code>1234567890</code>)
            <ul className="list-disc list-inside ml-4 mt-1 flex flex-col gap-1">
              <li>Open <ExternalHref href="https://tagmanager.google.com">tagmanager.google.com</ExternalHref></li>
              <li>Click <strong>Admin</strong> in the top navigation</li>
              <li>Under <em>Account</em>, the Account ID appears at the top of the Account Settings panel</li>
            </ul>
          </li>
          <li>
            <strong>Container ID</strong> (public ID, e.g. <code>GTM-ABC1234</code>)
            <ul className="list-disc list-inside ml-4 mt-1 flex flex-col gap-1">
              <li>In GTM, select your container from the home screen</li>
              <li>The Container ID is shown in the top-right corner next to your container name</li>
              <li>It always starts with <code>GTM-</code></li>
            </ul>
          </li>
        </ol>
        <p className="mt-3 text-muted-foreground text-[12px]">
          Enter these values in the <strong>Setup</strong> page before running the GTM Setup step.
        </p>
      </DocSection>

      {/* Section 2: Installing the CLI */}
      <DocSection title="Installing the GTM CLI">
        <p>
          Google Tag Manager Automation Engine uses <strong>@owntag/gtm-cli</strong> to interact with your GTM container.
          The CLI is installed automatically the first time you run the GTM Setup step.
        </p>
        <p className="mt-2">To install manually:</p>
        <CodeBlock>npm install -g @owntag/gtm-cli</CodeBlock>
        <p className="mt-2">Verify the installation:</p>
        <CodeBlock>gtm --version</CodeBlock>
        <p className="mt-3 text-muted-foreground text-[12px]">
          Requires Node.js 16 or later. The CLI is installed globally and is not added to your project dependencies.
        </p>
      </DocSection>

      {/* Section 3: Authenticating */}
      <DocSection title="Authenticating with Google OAuth">
        <p>
          The GTM CLI uses Google OAuth 2.0 to authenticate your account. No API keys or service account files are needed for basic use.
        </p>
        <Steps>
          <Step n={1}>
            Click <strong>Get OAuth Login URL</strong> on the GTM Setup page.
            The backend runs <code>gtm auth login --no-browser</code> and captures the Google OAuth URL.
          </Step>
          <Step n={2}>
            Click the <strong>Authenticate with Google</strong> button to open the URL in a new tab.
          </Step>
          <Step n={3}>
            Sign in to your Google account and grant GTM access when prompted.
            You will see a confirmation message when authentication is complete.
          </Step>
          <Step n={4}>
            Return to the GTM Setup page and click <strong>Re-check status</strong>.
            The CLI Status card will update to show <em>Authenticated: Yes</em>.
          </Step>
        </Steps>
        <p className="mt-3 text-muted-foreground text-[12px]">
          Credentials are stored by the CLI in your home directory (<code>~/.config/gtm-cli/</code> on Linux/Mac, <code>%APPDATA%\gtm-cli\</code> on Windows).
          Nothing is stored in your project directory.
        </p>
      </DocSection>

      {/* Section 4: OAuth scopes */}
      <DocSection title="What OAuth scopes are requested">
        <p>The GTM CLI requests these Google OAuth scopes:</p>
        <ul className="list-disc list-inside mt-2 flex flex-col gap-1">
          <li><code>https://www.googleapis.com/auth/tagmanager.edit.containers</code> - Read and write access to GTM containers (create/update variables, triggers, tags)</li>
          <li><code>https://www.googleapis.com/auth/tagmanager.publish</code> - Permission to publish container versions</li>
          <li><code>https://www.googleapis.com/auth/tagmanager.readonly</code> - Read-only access to list accounts and containers</li>
        </ul>
        <p className="mt-3 text-muted-foreground text-[12px]">
          You can revoke access at any time at{' '}
          <ExternalHref href="https://myaccount.google.com/permissions">myaccount.google.com/permissions</ExternalHref>.
        </p>
      </DocSection>

      {/* Section 5: Service account (advanced) */}
      <DocSection title="Service Account (Advanced / CI-CD)">
        <p>
          For automated environments where interactive OAuth is not possible (CI/CD pipelines, servers), the GTM CLI supports service account authentication.
        </p>
        <Steps>
          <Step n={1}>
            Create a service account in{' '}
            <ExternalHref href="https://console.cloud.google.com/iam-admin/serviceaccounts">Google Cloud Console</ExternalHref>.
          </Step>
          <Step n={2}>
            Grant the service account <em>Tag Manager Editor</em> and <em>Tag Manager Publisher</em> roles in the GTM account settings under <strong>Admin &gt; User Management</strong>.
          </Step>
          <Step n={3}>
            Download the service account JSON key file.
          </Step>
          <Step n={4}>
            Authenticate using:
            <CodeBlock>gtm auth login --service-account /path/to/key.json</CodeBlock>
          </Step>
        </Steps>
        <p className="mt-3 text-muted-foreground text-[12px]">
          Keep the service account key file secure and never commit it to version control.
        </p>
      </DocSection>

      {/* Section 6: Troubleshooting */}
      <DocSection title="Troubleshooting">
        <div className="flex flex-col gap-4">
          <TroubleshootItem
            issue="CLI not found after install"
            fix="Ensure your global npm bin directory is in your PATH. Run: npm config get prefix — the bin folder inside that path should be in PATH."
          />
          <TroubleshootItem
            issue="403 Forbidden when accessing container"
            fix="Your Google account does not have access to this GTM container. Ask the container owner to add you under Admin > User Management in GTM."
          />
          <TroubleshootItem
            issue="Container ID not found"
            fix="Verify the Container ID starts with GTM- and matches exactly what is shown in GTM. The Account ID must be the numeric ID, not the account name."
          />
          <TroubleshootItem
            issue="Token expired or authentication lost"
            fix="Run gtm auth logout then re-authenticate. Tokens typically expire after 1 hour but are refreshed automatically during active sessions."
          />
          <TroubleshootItem
            issue="OAuth URL not appearing"
            fix="The --no-browser flag may behave differently on some CLI versions. Try running gtm auth login directly in a terminal to authenticate, then re-check status."
          />
          <TroubleshootItem
            issue="Wrong account listed after auth"
            fix="Run gtm auth logout and re-authenticate with the correct Google account that has access to your GTM container."
          />
        </div>
      </DocSection>
    </div>
  )
}

function DocSection({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border border-border">
      <div className="px-4 py-3 border-b border-border bg-muted/30">
        <h2 className="text-[13px] font-semibold">{title}</h2>
      </div>
      <div className="px-4 py-4 text-[13px] text-foreground leading-relaxed flex flex-col gap-2">
        {children}
      </div>
    </div>
  )
}

function CodeBlock({ children }: { children: React.ReactNode }) {
  return (
    <pre className="mt-1 text-[12px] font-mono bg-muted px-3 py-2 text-foreground select-all overflow-x-auto">
      {children}
    </pre>
  )
}

function Steps({ children }: { children: React.ReactNode }) {
  return <ol className="flex flex-col gap-3 mt-2">{children}</ol>
}

function Step({ n, children }: { n: number; children: React.ReactNode }) {
  return (
    <li className="flex gap-3">
      <span className="flex-shrink-0 w-5 h-5 rounded-full border border-border text-[10px] font-bold flex items-center justify-center text-muted-foreground mt-0.5">
        {n}
      </span>
      <span>{children}</span>
    </li>
  )
}

function InstructionExample({ step, examples }: { step: string; examples: string[] }) {
  return (
    <div className="border border-border/60">
      <div className="px-3 py-1.5 border-b border-border/60 bg-muted/20">
        <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">{step}</span>
      </div>
      <ul className="px-3 py-2 flex flex-col gap-1">
        {examples.map(ex => (
          <li key={ex} className="flex items-start gap-2 text-[12px]">
            <span className="font-mono text-muted-foreground shrink-0 mt-px">"</span>
            <span className="text-muted-foreground italic">{ex}</span>
            <span className="font-mono text-muted-foreground shrink-0 mt-px">"</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

function TroubleshootItem({ issue, fix }: { issue: string; fix: string }) {
  return (
    <div>
      <p className="font-medium">{issue}</p>
      <p className="text-[12px] text-muted-foreground mt-0.5">{fix}</p>
    </div>
  )
}

function ExternalHref({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="underline underline-offset-2 inline-flex items-center gap-0.5"
    >
      {children}
      <ExternalLink size={10} className="inline-block" />
    </a>
  )
}
