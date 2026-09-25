// Public Privacy Policy (/privacy) and Terms of Service (/terms) — readable
// without signing in (App.jsx renders them before the auth gate), because
// Google, Meta, LinkedIn and TikTok reviewers and search engines all need them.
// Keep this in step with what the app really does: if a feature starts
// collecting or sharing something new, update the matching section and UPDATED.
import { useEffect } from 'react'

const UPDATED = '25 September 2026'
const COMPANY = 'Proseth Solutions Co., Ltd'
const CONTACT = 'opao@prosethsolutions.com'
const SITE = 'https://mkt.chlart.org'

const mail = <a href={`mailto:${CONTACT}`}>{CONTACT}</a>

const PRIVACY = [
  {
    id: 'who',
    title: 'Who we are',
    body: (
      <p>
        ContentFlow ({SITE}) is an AI marketing tool that helps businesses write, design, schedule and publish
        social media posts. It is operated by {COMPANY}, Phnom Penh, Cambodia (“we”, “us”). This policy explains
        what information ContentFlow collects, why, and the choices you have. Questions: {mail}.
      </p>
    ),
  },
  {
    id: 'collect',
    title: 'Information we collect',
    body: (
      <>
        <ul>
          <li>
            <b>Account details</b> — your name, email address and workspace name. Your password is stored only as a
            one-way hash; we can’t read it.
          </li>
          <li>
            <b>Content you create</b> — brands, products, post captions, drafts, schedules, and the images and videos
            you upload or generate.
          </li>
          <li>
            <b>Connected social accounts</b> — when you connect Facebook, Instagram, TikTok, LinkedIn or Telegram, we
            receive an access token from that platform plus basic details needed to post (such as your Page or profile
            name and id). You sign in on the platform’s own website; we never see your password there.
          </li>
          <li>
            <b>Post performance</b> — likes, comments, shares and views that the platforms make available for posts
            published through ContentFlow.
          </li>
          <li>
            <b>Sign-in history</b> — for your security, each sign-in attempt records the email typed, the IP address,
            the browser/device and whether it succeeded. Passwords are never recorded.
          </li>
          <li>
            <b>Notifications</b> — if you turn on push notifications, the push address your browser or phone gives us.
          </li>
        </ul>
        <p>
          We do <b>not</b> use advertising trackers or analytics tools, and we do not collect your contacts, messages
          or friends lists from any platform.
        </p>
      </>
    ),
  },
  {
    id: 'use',
    title: 'How we use it',
    body: (
      <ul>
        <li>To run the service: create your content, publish it at the times you choose, and show its results.</li>
        <li>To generate text, images and video with AI when you ask for them.</li>
        <li>To keep accounts secure — for example, blocking repeated failed sign-ins.</li>
        <li>To send the notifications you switched on, and to reply when you contact us.</li>
      </ul>
    ),
  },
  {
    id: 'platforms',
    title: 'Connected platforms',
    body: (
      <>
        <p>
          ContentFlow only acts on a connected account when you (or an automation you set up) publish or schedule a
          post, or to read the performance of posts it published. We request only the permissions needed for that:
        </p>
        <ul>
          <li>
            <b>Facebook &amp; Instagram (Meta)</b> — list the Pages you manage, publish to the Page / Instagram
            business account you choose, and read those posts’ engagement.
          </li>
          <li>
            <b>LinkedIn</b> — sign in with LinkedIn and publish posts on your behalf.
          </li>
          <li>
            <b>TikTok</b> — upload videos to your account and read their basic stats.
          </li>
          <li>
            <b>Telegram</b> — post to channels through a bot you add.
          </li>
        </ul>
        <p>
          Access tokens are kept on our servers, are never shown back in the app, and are used only for the actions
          above. You can disconnect a channel in ContentFlow at any time, and you can also revoke our access in each
          platform’s own settings (for example Facebook → Settings → Business integrations, or LinkedIn → Settings →
          Data privacy → Permitted services).
        </p>
      </>
    ),
  },
  {
    id: 'share',
    title: 'Who we share it with',
    body: (
      <>
        <p>We don’t sell your information. We share it only with services that run ContentFlow for you:</p>
        <ul>
          <li>
            <b>Microsoft Azure</b> — hosts our servers and database, and provides the AI (Azure OpenAI) that writes
            text and generates images and videos from your prompts.
          </li>
          <li>
            <b>Google</b> — the Gemini API, only when it is the selected video generator.
          </li>
          <li>
            <b>The social platforms you connect</b> — they receive the posts you publish.
          </li>
          <li>
            <b>Push notification services</b> (Apple, Google, Mozilla, Microsoft) — deliver the alerts you turned on.
          </li>
        </ul>
        <p>We may also disclose information if the law requires it.</p>
      </>
    ),
  },
  {
    id: 'retention',
    title: 'How long we keep it',
    body: (
      <ul>
        <li>Account and workspace content — for as long as your account exists.</li>
        <li>Sign-in history — 90 days, then deleted automatically.</li>
        <li>Access tokens — until you disconnect the channel, the token expires, or your account is deleted.</li>
      </ul>
    ),
  },
  {
    id: 'data-deletion',
    title: 'Deleting your data',
    body: (
      <>
        <p>
          To delete your account and everything in it — content, media, connected-account tokens and sign-in history —
          email {mail} from the address you signed up with, with the subject “Delete my ContentFlow account”. We
          confirm and complete the deletion within 30 days.
        </p>
        <p>
          To remove only a connected Facebook, Instagram, TikTok or LinkedIn account, disconnect it in ContentFlow
          (Channels) — its access token is deleted immediately. Revoking ContentFlow in that platform’s own settings
          also stops the token from working at once.
        </p>
      </>
    ),
  },
  {
    id: 'security',
    title: 'Security',
    body: (
      <p>
        All traffic uses HTTPS. Passwords are hashed, each workspace’s data is kept separate from every other, owners
        and admins can review sign-in activity, and accounts are locked temporarily after repeated failed sign-ins. No
        system is perfectly secure, so please use a strong, unique password.
      </p>
    ),
  },
  {
    id: 'rights',
    title: 'Your choices',
    body: (
      <p>
        You can view and edit your profile in Settings, change your password, turn notifications on or off, disconnect
        any channel, and ask us for a copy of your data or its deletion at {mail}.
      </p>
    ),
  },
  {
    id: 'children',
    title: 'Children',
    body: <p>ContentFlow is a business tool and is not intended for anyone under 16.</p>,
  },
  {
    id: 'changes',
    title: 'Changes to this policy',
    body: (
      <p>
        If we change this policy we’ll update the date above, and for significant changes we’ll tell you in the app or
        by email before they take effect.
      </p>
    ),
  },
]

const TERMS = [
  {
    id: 'agreement',
    title: 'Agreement',
    body: (
      <p>
        These terms are an agreement between you and {COMPANY} for use of ContentFlow ({SITE}). By creating an account
        or using ContentFlow you accept them. If you use it for a business, you confirm you’re allowed to accept them
        for that business.
      </p>
    ),
  },
  {
    id: 'account',
    title: 'Your account',
    body: (
      <ul>
        <li>Give accurate details and keep your password private. You’re responsible for activity in your account.</li>
        <li>Workspace owners and admins decide who else can access their workspace.</li>
        <li>Tell us straight away at {mail} if you think your account has been misused.</li>
      </ul>
    ),
  },
  {
    id: 'content',
    title: 'Your content',
    body: (
      <>
        <p>
          You own the content you create or upload. You give us permission to store, process and publish it only as
          needed to provide ContentFlow to you — for example sending it to an AI model or posting it to the channels you
          choose.
        </p>
        <p>
          You’re responsible for what you publish and for having the rights to it (text, images, music, logos, people
          shown).
        </p>
      </>
    ),
  },
  {
    id: 'ai',
    title: 'AI-generated content',
    body: (
      <p>
        ContentFlow uses AI to suggest text, images and videos. AI can be wrong, out of date or unsuitable, so review
        everything before it is published — including posts created by automations. Generated media may carry an
        invisible watermark from the AI provider identifying it as AI-made.
      </p>
    ),
  },
  {
    id: 'acceptable-use',
    title: 'Acceptable use',
    body: (
      <>
        <p>Don’t use ContentFlow to:</p>
        <ul>
          <li>publish anything illegal, hateful, harassing, sexually explicit, deceptive or infringing;</li>
          <li>send spam or break the rules of the platforms you post to;</li>
          <li>try to access other workspaces, overload or break the service, or get around its limits.</li>
        </ul>
        <p>We may remove content or suspend accounts that break these rules.</p>
      </>
    ),
  },
  {
    id: 'third-party',
    title: 'Social platforms',
    body: (
      <p>
        Posting depends on Facebook, Instagram, TikTok, LinkedIn, Telegram and other services that we don’t control.
        Their terms apply to your use of them, and they may change or limit their features, or reject a post, at any
        time.
      </p>
    ),
  },
  {
    id: 'fees',
    title: 'Plans and fees',
    body: (
      <p>
        ContentFlow is currently free to use and may include usage limits (for example on AI video). If we introduce
        paid plans we’ll tell you the prices in advance, and nothing is charged without your agreement.
      </p>
    ),
  },
  {
    id: 'availability',
    title: 'Availability',
    body: (
      <p>
        We work to keep ContentFlow running, but it is provided “as is” and may sometimes be unavailable — for example
        during updates or maintenance, or when a platform or AI provider has an outage. Scheduled posts may be delayed
        or fail in those cases.
      </p>
    ),
  },
  {
    id: 'liability',
    title: 'Liability',
    body: (
      <p>
        To the extent the law allows, {COMPANY} isn’t liable for indirect or consequential losses, lost profits or lost
        data, or for content you publish. Nothing in these terms limits liability that can’t be limited by law.
      </p>
    ),
  },
  {
    id: 'ending',
    title: 'Ending your use',
    body: (
      <p>
        You can stop using ContentFlow at any time and ask us to delete your account (see the Privacy Policy). We may
        suspend or close accounts that break these terms.
      </p>
    ),
  },
  {
    id: 'law',
    title: 'Governing law',
    body: <p>These terms are governed by the laws of the Kingdom of Cambodia.</p>,
  },
  {
    id: 'changes',
    title: 'Changes',
    body: (
      <p>
        We may update these terms. We’ll change the date above and, for significant changes, tell you in the app or by
        email before they apply. Questions: {mail}.
      </p>
    ),
  },
]

const DOCS = {
  privacy: { title: 'Privacy Policy', sections: PRIVACY },
  terms: { title: 'Terms of Service', sections: TERMS },
}

export default function LegalPage({ kind }) {
  const doc = DOCS[kind] || DOCS.privacy

  useEffect(() => {
    document.title = `${doc.title} · ContentFlow`
    document.getElementById('splash')?.remove()
    // Arrived with #data-deletion etc.: scroll to it once rendered.
    if (window.location.hash) document.querySelector(window.location.hash)?.scrollIntoView()
  }, [doc.title])

  return (
    <div className="min-h-screen bg-ink-50">
      <header className="sticky top-0 z-10 border-b border-ink-200/70 bg-white/85 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <a href="/" className="flex items-center gap-2">
            <img src="/brand/logo-mark.png" alt="" className="h-7 w-7 object-contain" />
            <span className="text-[15px] font-bold tracking-tight text-ink-900">
              Content<span className="text-brand">Flow</span>
            </span>
          </a>
          <nav className="ml-auto flex gap-1 text-[12.5px] font-medium">
            {Object.entries(DOCS).map(([k, d]) => (
              <a
                key={k}
                href={`/${k}`}
                className={`rounded-lg px-2.5 py-1.5 ${k === kind ? 'bg-brand-soft text-brand' : 'text-ink-600 hover:bg-ink-100'}`}
              >
                {d.title.split(' ')[0]}
              </a>
            ))}
          </nav>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-10">
        <h1 className="text-[28px] font-bold tracking-tight text-ink-900">{doc.title}</h1>
        <p className="mt-1 text-[12.5px] text-ink-500">Last updated {UPDATED}</p>

        <ol className="mt-6 grid gap-x-6 gap-y-1 rounded-2xl border border-ink-200 bg-white p-4 text-[12.5px] sm:grid-cols-2">
          {doc.sections.map((s, i) => (
            <li key={s.id}>
              <a href={`#${s.id}`} className="text-ink-600 hover:text-brand">
                {i + 1}. {s.title}
              </a>
            </li>
          ))}
        </ol>

        <div className="legal mt-8 space-y-8 text-[14px] leading-relaxed text-ink-700">
          {doc.sections.map((s, i) => (
            <section key={s.id} id={s.id} className="scroll-mt-20">
              <h2 className="mb-2 text-[17px] font-semibold text-ink-900">
                {i + 1}. {s.title}
              </h2>
              {s.body}
            </section>
          ))}
        </div>

        <footer className="mt-14 border-t border-ink-200 pt-6 text-[12px] text-ink-500">
          © {new Date().getFullYear()} {COMPANY} · ContentFlow · <a href={`mailto:${CONTACT}`}>{CONTACT}</a>
        </footer>
      </main>
    </div>
  )
}
