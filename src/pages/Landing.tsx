import { Link } from 'react-router-dom';
import { Button } from '../components/ui/button';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '../components/ui/accordion';
import {
  ArrowRight,
  Sparkles,
  BookOpen,
  FileSignature,
  Users,
  Boxes,
  BarChart3,
  Workflow,
  Check,
  ShieldCheck,
  Zap,
  Brain,
  Wand2,
  TrendingUp,
  ScanLine,
  Bell,
  Menu,
} from 'lucide-react';
import { AppHeaderLogo, AppBrand } from '../components/brand';
import { BRAND } from '../config/brand';
import { useDocumentTitle } from '../hooks/useDocumentTitle';
import { Sheet, SheetContent, SheetTitle, SheetTrigger } from '../components/ui/sheet';

/* ------------------------------------------------------------------ */
/* Small building blocks                                              */
/* ------------------------------------------------------------------ */

const Section = ({ id, className = '', children }: { id?: string; className?: string; children: React.ReactNode }) => (
  <section id={id} className={`mx-auto w-full max-w-6xl px-6 ${className}`}>{children}</section>
);

const Pill = ({ children }: { children: React.ReactNode }) => (
  <span className="inline-flex items-center gap-1.5 rounded-full border border-primary/20 bg-primary/10 px-3 py-1 text-xs font-medium text-primary">
    {children}
  </span>
);

const SectionHeading = ({ eyebrow, title, subtitle }: { eyebrow: string; title: string; subtitle?: string }) => (
  <div className="mx-auto max-w-2xl text-center">
    <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
    <h2 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h2>
    {subtitle && <p className="mt-4 text-lg text-muted-foreground">{subtitle}</p>}
  </div>
);

/* ------------------------------------------------------------------ */
/* Nav                                                                */
/* ------------------------------------------------------------------ */

const Nav = () => (
  <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
    <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
      <AppHeaderLogo />
      <nav className="hidden items-center gap-8 md:flex">
        <a href="#features" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Features</a>
        <a href="#ai" className="text-sm text-muted-foreground transition-colors hover:text-foreground">AI</a>
        <a href="#pricing" className="text-sm text-muted-foreground transition-colors hover:text-foreground">Pricing</a>
        <a href="#faq" className="text-sm text-muted-foreground transition-colors hover:text-foreground">FAQ</a>
      </nav>
      <div className="flex items-center gap-2">
        <Sheet>
          <SheetTrigger asChild>
            <Button variant="outline" size="icon" className="md:hidden" aria-label="Open site menu">
              <Menu className="h-4 w-4" />
            </Button>
          </SheetTrigger>
          <SheetContent side="right" className="w-[85vw] max-w-xs">
            <SheetTitle className="sr-only">Site navigation</SheetTitle>
            <div className="mt-8 grid gap-2">
              <Button variant="ghost" asChild><a href="#features">Features</a></Button>
              <Button variant="ghost" asChild><a href="#ai">AI</a></Button>
              <Button variant="ghost" asChild><a href="#pricing">Pricing</a></Button>
              <Button variant="ghost" asChild><a href="#faq">FAQ</a></Button>
            </div>
          </SheetContent>
        </Sheet>
        <Button variant="ghost" asChild><Link to="/auth">Sign in</Link></Button>
        <Button asChild><Link to="/auth">Get started<ArrowRight className="ml-1.5 h-4 w-4" /></Link></Button>
      </div>
    </div>
  </header>
);

/* ------------------------------------------------------------------ */
/* Hero                                                               */
/* ------------------------------------------------------------------ */

const Hero = () => (
  <div className="relative overflow-hidden">
    {/* soft emerald glow + grid */}
    <div className="pointer-events-none absolute inset-0 -z-10">
      <div className="absolute left-1/2 top-[-10%] h-[500px] w-[900px] -translate-x-1/2 rounded-full bg-primary/15 blur-3xl" />
      <div
        className="absolute inset-0 opacity-[0.4] [mask-image:radial-gradient(ellipse_at_center,black,transparent_70%)]"
        style={{
          backgroundImage:
            'linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)',
          backgroundSize: '48px 48px',
        }}
      />
    </div>

    <Section className="pb-16 pt-20 text-center sm:pt-28">
      <div className="mx-auto flex max-w-3xl flex-col items-center animate-fade-in">
        <Pill><Sparkles className="h-3.5 w-3.5" /> The finance & growth platform for South African business</Pill>
        <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl">
          Less Admin.<br />
          <span className="text-primary">More Growth.</span>
        </h1>
        <p className="mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          Run your business, manage your money and stay tax compliant in one place — accounting,
          invoicing, payroll and financial statements, built for South Africa with VAT, PAYE, UIF and
          SDL handled and an AI assistant on the busywork. The professional foundation to grow with confidence.
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button size="lg" className="h-12 px-7 text-base" asChild>
            <Link to="/auth">Start for free<ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
          <Button size="lg" variant="outline" className="h-12 px-7 text-base" asChild>
            <a href="#features">See how it works</a>
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">Private beta · No credit card required · Set up in minutes</p>
      </div>

      <ProductPreview />
    </Section>
  </div>
);

/* A faux product screenshot built from divs — crisp at any resolution, no asset needed. */
const ProductPreview = () => (
  <div className="relative mx-auto mt-16 max-w-5xl animate-scale-in">
    <div className="overflow-hidden rounded-xl border border-border bg-card shadow-lg">
      {/* window chrome */}
      <div className="flex items-center gap-1.5 border-b border-border bg-muted/40 px-4 py-3">
        <span className="h-3 w-3 rounded-full bg-destructive/60" />
        <span className="h-3 w-3 rounded-full bg-warning/60" />
        <span className="h-3 w-3 rounded-full bg-success/60" />
      </div>
      <div className="flex">
        {/* mini sidebar */}
        <div className="hidden w-48 shrink-0 flex-col gap-2 border-r border-border bg-sidebar p-4 sm:flex">
          <div className="mb-2 h-6 w-24 rounded bg-primary/20" />
          {['Dashboard', 'Invoices', 'Bills', 'Reports', 'Payroll'].map((l, i) => (
            <div key={l} className={`flex items-center gap-2 rounded-md px-2 py-1.5 text-xs ${i === 0 ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground'}`}>
              <span className={`h-2 w-2 rounded-full ${i === 0 ? 'bg-primary' : 'bg-muted-foreground/40'}`} />{l}
            </div>
          ))}
        </div>
        {/* content */}
        <div className="flex-1 space-y-4 p-5 text-left">
          <div className="grid grid-cols-3 gap-3">
            {[
              { l: 'Cash Balance', v: 'R 482,190', up: true },
              { l: 'Revenue (YTD)', v: 'R 1.24M', up: true },
              { l: 'Outstanding', v: 'R 63,400', up: false },
            ].map((c) => (
              <div key={c.l} className="rounded-lg border border-border bg-background p-3">
                <p className="text-[10px] uppercase tracking-wide text-muted-foreground">{c.l}</p>
                <p className="mt-1 text-lg font-semibold tabular-nums text-foreground">{c.v}</p>
                <p className={`text-[10px] font-medium ${c.up ? 'text-success' : 'text-destructive'}`}>{c.up ? '▲ 12.4%' : '▼ 3.1%'} vs last month</p>
              </div>
            ))}
          </div>
          {/* faux bar chart */}
          <div className="rounded-lg border border-border bg-background p-4">
            <p className="text-xs font-medium text-foreground">Income vs Expenses</p>
            <div className="mt-4 flex h-28 items-end gap-2">
              {[55, 40, 70, 48, 82, 60, 90, 66, 74, 88, 58, 95].map((h, i) => (
                <div key={i} className="flex-1 rounded-t bg-primary/80" style={{ height: `${h}%`, opacity: 0.35 + (h / 150) }} />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  </div>
);

/* ------------------------------------------------------------------ */
/* Logos / trust                                                      */
/* ------------------------------------------------------------------ */

const TrustBar = () => (
  <Section className="py-12">
    <p className="text-center text-sm text-muted-foreground">
      Now onboarding our founding cohort of South African businesses
    </p>
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-8 gap-y-3">
      {['VAT', 'PAYE', 'UIF', 'SDL', 'Financial statements', 'Audit trail'].map((n) => (
        <span key={n} className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground">
          <Check className="h-4 w-4 text-primary" />{n}
        </span>
      ))}
    </div>
  </Section>
);

/* ------------------------------------------------------------------ */
/* Features                                                           */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { icon: BookOpen, title: 'Accounting & Ledger', desc: 'Double-entry general ledger, chart of accounts and journals that stay balanced automatically, with VAT tracked on every transaction.' },
  { icon: FileSignature, title: 'Invoicing & Payments', desc: 'Send polished, VAT-ready invoices and quotes, track payments and get paid faster with reminders.' },
  { icon: Users, title: 'Payroll', desc: 'Run monthly payroll with PAYE, UIF and SDL calculated for you, plus employees and expense claims.' },
  { icon: Boxes, title: 'Inventory & Assets', desc: 'Track stock, valuations and fixed assets with depreciation handled for you.' },
  { icon: BarChart3, title: 'Reporting & Statements', desc: 'Income statements, balance sheets and financial statements — audit-ready and always current.' },
  { icon: Workflow, title: 'Automation', desc: 'Recurring invoices, bills and journals run on schedule so nothing slips.' },
];

const Features = () => (
  <Section id="features" className="py-24">
    <SectionHeading
      eyebrow="Everything, in one place"
      title="Your whole finance stack, unified"
      subtitle="Stop stitching together spreadsheets and disconnected tools. AdminLess Fin covers the full picture."
    />
    <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {FEATURES.map((f) => (
        <div key={f.title} className="group rounded-xl border border-border bg-card p-6 shadow-sm transition-all duration-base ease-smooth hover:-translate-y-1 hover:shadow-md">
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
            <f.icon className="h-5 w-5" />
          </div>
          <h3 className="mt-4 text-lg font-semibold text-foreground">{f.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{f.desc}</p>
        </div>
      ))}
    </div>
  </Section>
);

const MODULES = [
  "Accounting",
  "Sales",
  "Purchases",
  "Payroll",
  "Inventory",
  "Reporting",
  "Projects",
  "Collaboration",
];

const Modules = () => (
  <Section className="py-10">
    <SectionHeading
      eyebrow="Modules"
      title="Purpose-built modules that work as one system"
      subtitle="Every team works in its own workflow while sharing a single financial truth."
    />
    <div className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {MODULES.map((moduleName) => (
        <div
          key={moduleName}
          className="rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm"
        >
          {moduleName}
        </div>
      ))}
    </div>
  </Section>
);

/* ------------------------------------------------------------------ */
/* AI                                                                 */
/* ------------------------------------------------------------------ */

const AI_CAPS = [
  { icon: Wand2, title: 'Auto-categorization', desc: 'Transactions are classified to the right accounts the moment they land.' },
  { icon: TrendingUp, title: 'Cash-flow forecasting', desc: 'See a 30-day projected balance from your due invoices and bills.' },
  { icon: ScanLine, title: 'Smart reconciliation', desc: 'AI matches statement lines to entries so books reconcile themselves.' },
  { icon: Brain, title: 'Natural-language entries', desc: 'Type “paid R2,000 rent from FNB” and get a correct journal entry.' },
  { icon: Bell, title: 'Anomaly alerts', desc: 'Get nudged about low stock, overdue invoices and unusual spend.' },
];

const AISection = () => (
  <div className="relative overflow-hidden border-y border-border bg-muted/30">
    <Section id="ai" className="py-24">
      <div className="grid items-center gap-14 lg:grid-cols-2">
        <div>
          <Pill><Brain className="h-3.5 w-3.5" /> AI-first, by design</Pill>
          <h2 className="mt-5 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
            The assistant that actually does the admin
          </h2>
          <p className="mt-4 text-lg text-muted-foreground">
            AdminLess Fin doesn’t just store your numbers — it works them. From categorizing
            transactions to forecasting cash, the AI handles the repetitive work and surfaces
            what needs your attention.
          </p>
          <Button className="mt-8" size="lg" asChild>
            <Link to="/auth">Try the AI free<ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
        </div>
        <div className="space-y-3">
          {AI_CAPS.map((c) => (
            <div key={c.title} className="flex items-start gap-4 rounded-xl border border-border bg-card p-4 shadow-sm">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                <c.icon className="h-5 w-5" />
              </div>
              <div>
                <h3 className="font-medium text-foreground">{c.title}</h3>
                <p className="text-sm text-muted-foreground">{c.desc}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </Section>
  </div>
);

/* ------------------------------------------------------------------ */
/* Benefits                                                           */
/* ------------------------------------------------------------------ */

const WHY = [
  { icon: Zap, title: 'Save time', desc: 'Automation and AI cut manual data entry and month-end busywork.' },
  { icon: ShieldCheck, title: 'Stay compliant', desc: 'VAT, PAYE, UIF and SDL calculated as you go, with a full audit trail.' },
  { icon: BarChart3, title: 'Make better decisions', desc: 'Live dashboards and reports show where your business really stands.' },
  { icon: TrendingUp, title: 'Be funding-ready', desc: 'Produce the financial statements banks and funders expect to see.' },
  { icon: FileSignature, title: 'Impress the room', desc: 'Present clean, professional reports to your accountant, bank or investors.' },
];

const WhyChoose = () => (
  <Section className="py-24">
    <SectionHeading
      eyebrow="Why businesses choose AdminLess Fin"
      title="Outcomes, not just admin"
      subtitle="More than bookkeeping — the foundation to run, manage and grow your business with confidence."
    />
    <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-5">
      {WHY.map((b) => (
        <div key={b.title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <b.icon className="h-6 w-6 text-primary" />
          <h3 className="mt-4 font-semibold text-foreground">{b.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{b.desc}</p>
        </div>
      ))}
    </div>
  </Section>
);

const Security = () => (
  <Section className="py-16">
    <SectionHeading
      eyebrow="Security"
      title="Security and controls for commercial operations"
      subtitle="Built with role-based access, audit trails, and encryption to protect sensitive financial data."
    />
    <div className="mx-auto mt-10 grid max-w-4xl gap-4 sm:grid-cols-3">
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <ShieldCheck className="h-5 w-5 text-primary" />
        <p className="mt-3 text-sm font-semibold text-foreground">Role-based access</p>
        <p className="mt-1 text-sm text-muted-foreground">Limit who can approve, post, or manage critical workflows.</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <BookOpen className="h-5 w-5 text-primary" />
        <p className="mt-3 text-sm font-semibold text-foreground">Audit-ready history</p>
        <p className="mt-1 text-sm text-muted-foreground">Track user actions with transparent, reviewable activity context.</p>
      </div>
      <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
        <Zap className="h-5 w-5 text-primary" />
        <p className="mt-3 text-sm font-semibold text-foreground">Always-on reliability</p>
        <p className="mt-1 text-sm text-muted-foreground">Fast, stable infrastructure with premium interaction performance.</p>
      </div>
    </div>
  </Section>
);

/* ------------------------------------------------------------------ */
/* Testimonials (placeholder)                                         */
/* ------------------------------------------------------------------ */

const COHORT = [
  { icon: Workflow, title: 'Hands-on onboarding', desc: 'We help set up your chart of accounts, VAT, payroll and opening balances.' },
  { icon: Brain, title: 'Shape the roadmap', desc: 'A direct line to the team — your feedback drives what we build next.' },
  { icon: Zap, title: 'Priority support', desc: 'Fast, direct help from the people building the product.' },
];

const FoundingCohort = () => (
  <div className="border-y border-border bg-muted/30">
    <Section className="py-24">
      <SectionHeading
        eyebrow="Private beta"
        title="Join our founding cohort of South African businesses"
        subtitle="AdminLess Fin is in private beta. We’re onboarding a first group of SMEs, finance teams and accountants — no invented reviews, just early partners we build alongside."
      />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {COHORT.map((c) => (
          <div key={c.title} className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-primary/10 text-primary">
              <c.icon className="h-5 w-5" />
            </div>
            <h3 className="mt-4 font-semibold text-foreground">{c.title}</h3>
            <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{c.desc}</p>
          </div>
        ))}
      </div>
      <div className="mt-12 flex flex-col items-center justify-center gap-3 sm:flex-row">
        <Button size="lg" asChild>
          <Link to="/auth">Become a beta partner<ArrowRight className="ml-1.5 h-4 w-4" /></Link>
        </Button>
        <Button size="lg" variant="outline" asChild>
          <Link to="/contact">Talk to our team</Link>
        </Button>
      </div>
    </Section>
  </div>
);

/* ------------------------------------------------------------------ */
/* Built for South African businesses                                 */
/* ------------------------------------------------------------------ */

const INDUSTRIES = [
  'Artists & creatives',
  'Content creators',
  'Salons & beauty',
  'Day-care centres',
  'Security companies',
  'Retail & spaza shops',
  'Township entrepreneurs',
  'Construction companies',
  'Transport & logistics',
  'Growing SMEs',
];

const BuiltForSA = () => (
  <Section className="py-24">
    <SectionHeading
      eyebrow="Who it's for"
      title="Built for South African businesses"
      subtitle="From side hustles to established operations — if you invoice customers, pay people and answer to SARS, AdminLess Fin fits the way you work."
    />
    <div className="mt-14 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {INDUSTRIES.map((name) => (
        <div
          key={name}
          className="flex items-center gap-2.5 rounded-lg border border-border bg-card px-4 py-3 text-sm font-medium text-foreground shadow-sm"
        >
          <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-primary" />
          {name}
        </div>
      ))}
    </div>
  </Section>
);

/* ------------------------------------------------------------------ */
/* Roadmap — clearly labelled as not yet available                    */
/* ------------------------------------------------------------------ */

const ROADMAP = [
  { icon: TrendingUp, title: 'Funding readiness', desc: 'Get your business ready to approach lenders and funders with confidence.' },
  { icon: BarChart3, title: 'Investor packs', desc: 'Investor-ready summaries generated from your live financial data.' },
  { icon: ShieldCheck, title: 'Governance packs', desc: 'Structured governance documentation for your business.' },
  { icon: BookOpen, title: 'Compliance packs', desc: 'Bundled compliance documents, ready to review and share.' },
  { icon: FileSignature, title: 'Tender & grant packs', desc: 'Documentation to support tender and grant applications.' },
  { icon: Brain, title: 'AI business advisor', desc: 'Guidance on cash, growth and the next best action for your business.' },
  { icon: Wand2, title: 'Advanced cash-flow forecasting', desc: 'Deeper, scenario-based projections beyond today’s 30-day view.' },
];

const Roadmap = () => (
  <Section className="py-24">
    <SectionHeading
      eyebrow="Coming soon"
      title="Your growth toolkit is expanding"
      subtitle="We’re building AdminLess Fin into a full growth platform. The features below are planned for future releases and are not available yet."
    />
    <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {ROADMAP.map((r) => (
        <div key={r.title} className="relative rounded-xl border border-dashed border-border bg-card/50 p-6 shadow-sm">
          <span className="absolute right-4 top-4 rounded-full bg-muted px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Coming soon
          </span>
          <div className="flex h-11 w-11 items-center justify-center rounded-lg bg-muted text-muted-foreground">
            <r.icon className="h-5 w-5" />
          </div>
          <h3 className="mt-4 font-semibold text-foreground">{r.title}</h3>
          <p className="mt-2 text-sm leading-relaxed text-muted-foreground">{r.desc}</p>
        </div>
      ))}
    </div>
    <p className="mx-auto mt-8 max-w-2xl text-center text-sm text-muted-foreground">
      Roadmap items are indicative and may change. Nothing here is available in the current release.
    </p>
  </Section>
);

/* ------------------------------------------------------------------ */
/* Pricing                                                            */
/* ------------------------------------------------------------------ */

const PLANS = [
  { name: 'Starter', price: 'R299', cadence: '/mo', desc: 'Perfect for startups, freelancers and small businesses.', features: ['1 company', 'Unlimited users', 'Quotes & invoicing', 'Expense management', 'General ledger', 'Financial statements', 'VAT tracking', 'Basic AI assistance', 'Email support'], cta: 'Start free trial', href: '/auth', highlight: false },
  { name: 'Business', price: 'R699', cadence: '/mo', desc: 'Built for growing South African businesses.', features: ['Everything in Starter, plus:', 'Payroll', 'PAYE, UIF & SDL', 'Fixed assets', 'Advanced financial reporting', 'Cash flow insights', 'AI financial assistant', 'Priority support'], cta: 'Start free trial', href: '/auth', highlight: true },
  { name: 'Enterprise', price: 'From R1,299', cadence: '/mo', desc: 'Enterprise finance for growing organisations.', features: ['Everything in Business, plus:', 'Multi-company', 'Advanced roles & permissions', 'Audit trail', 'API access (coming soon)', 'Dedicated onboarding', 'Priority implementation support'], cta: 'Talk to sales', href: '/contact', highlight: false },
];

const Pricing = () => (
  <Section id="pricing" className="py-24">
    <SectionHeading eyebrow="Pricing" title="Simple, transparent pricing" subtitle="Straightforward monthly pricing in Rands. Start with a free trial — cancel anytime." />

    {/* Founding Customer Programme banner */}
    <div className="mx-auto mt-10 max-w-3xl rounded-2xl border border-primary/20 bg-primary/5 px-6 py-6 text-center">
      <p className="text-base font-semibold text-foreground">🎉 Founding Customer Programme</p>
      <p className="mx-auto mt-2 max-w-xl text-sm text-muted-foreground">
        We’re onboarding our first 50 South African businesses. Join today and receive{' '}
        <span className="font-semibold text-primary">50% off your subscription for life</span> while
        helping shape the future of AdminLess Fin.
      </p>
    </div>

    <div className="mt-14 grid gap-6 lg:grid-cols-3">
      {PLANS.map((p) => (
        <div
          key={p.name}
          className={`relative flex flex-col rounded-2xl border bg-card p-7 shadow-sm ${p.highlight ? 'border-primary ring-1 ring-primary shadow-md' : 'border-border'}`}
        >
          {p.highlight && (
            <span className="absolute -top-3 left-1/2 -translate-x-1/2 rounded-full bg-primary px-3 py-1 text-xs font-semibold text-primary-foreground">Most popular</span>
          )}
          <h3 className="text-lg font-semibold text-foreground">{p.name}</h3>
          <p className="mt-1 text-sm text-muted-foreground">{p.desc}</p>
          <div className="mt-5 flex items-baseline gap-1">
            <span className="text-4xl font-semibold tracking-tight tabular-nums text-foreground">{p.price}</span>
            <span className="text-sm text-muted-foreground">{p.cadence}</span>
          </div>
          <ul className="mt-6 flex-1 space-y-3">
            {p.features.map((f) => (
              <li key={f} className="flex items-center gap-2 text-sm text-foreground">
                <Check className="h-4 w-4 shrink-0 text-primary" />{f}
              </li>
            ))}
          </ul>
          <Button className="mt-8 w-full" variant={p.highlight ? 'default' : 'outline'} asChild>
            <Link to={p.href}>{p.cta}</Link>
          </Button>
        </div>
      ))}
    </div>
  </Section>
);

/* ------------------------------------------------------------------ */
/* FAQ                                                                */
/* ------------------------------------------------------------------ */

const FAQS = [
  { q: `Can I try ${BRAND.product} before paying?`, a: 'Yes — every plan starts with a free trial, no credit card required. Through our Founding Customer Programme, our first 50 South African businesses also lock in 50% off their subscription for life.' },
  { q: 'Can I import my existing data?', a: 'Absolutely. You can import your chart of accounts, customers, vendors and opening balances via CSV during onboarding.' },
  { q: 'How does the AI keep my books accurate?', a: 'The AI proposes categorizations and reconciliations, but every posting follows double-entry rules and is fully auditable — you always stay in control.' },
  { q: 'Is my financial data secure?', a: 'Data is encrypted in transit and at rest, access is role-based per company, and every change is recorded in an audit trail.' },
  { q: 'Do you support multiple companies?', a: 'Yes — switch between companies from a single login. Growth and Scale plans raise or remove the company limit.' },
  { q: `Can ${BRAND.product} help prepare my business for funding?`, a: 'Today you can produce the financial statements, reports and audit trail that banks and funders typically ask for. Dedicated funding-readiness and investor packs are on our roadmap and are not available yet.' },
  { q: 'Can I generate reports for investors or banks?', a: 'Yes. You can generate income statements, balance sheets and other financial reports to share with your accountant, bank or investors. Purpose-built investor packs are planned for a future release.' },
  { q: 'Will the platform help me stay compliant with my business obligations?', a: 'AdminLess Fin calculates VAT, PAYE, UIF and SDL as you work and keeps a full audit trail, which supports your compliance. It does not replace your accountant or a registered tax practitioner — always review figures before filing with SARS.' },
  { q: 'What new features are coming next?', a: 'Our roadmap includes funding readiness, investor, governance, compliance and tender/grant packs, an AI business advisor and advanced cash-flow forecasting. These are planned for future releases and are clearly marked “Coming soon” on this page.' },
];

const FAQ = () => (
  <Section id="faq" className="py-24">
    <SectionHeading eyebrow="FAQ" title="Questions, answered" />
    <div className="mx-auto mt-10 max-w-3xl">
      <Accordion type="single" collapsible className="w-full">
        {FAQS.map((f, i) => (
          <AccordionItem key={i} value={`item-${i}`}>
            <AccordionTrigger className="text-left text-base">{f.q}</AccordionTrigger>
            <AccordionContent className="text-muted-foreground">{f.a}</AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  </Section>
);

/* ------------------------------------------------------------------ */
/* CTA band + footer                                                  */
/* ------------------------------------------------------------------ */

const CTABand = () => (
  <Section className="py-16">
    <div className="relative overflow-hidden rounded-3xl bg-primary px-8 py-16 text-center text-primary-foreground">
      <div className="pointer-events-none absolute inset-0 opacity-20" style={{ backgroundImage: 'radial-gradient(circle at 20% 20%, white, transparent 40%)' }} />
      <h2 className="relative text-3xl font-semibold tracking-tight sm:text-4xl">Ready to spend less time on admin?</h2>
      <p className="relative mx-auto mt-3 max-w-xl text-primary-foreground/80">Join the teams running their finances the effortless way. Set up in minutes.</p>
      <Button size="lg" variant="secondary" className="relative mt-8 h-12 px-8 text-base" asChild>
        <Link to="/auth">Get started free<ArrowRight className="ml-1.5 h-4 w-4" /></Link>
      </Button>
    </div>
  </Section>
);

const ECOSYSTEM = [
  { name: BRAND.product, tag: 'Live' },
  { name: `${BRAND.master} Edu`, tag: 'Soon' },
  { name: `${BRAND.master} HR`, tag: 'Soon' },
  { name: `${BRAND.master} Pay`, tag: 'Soon' },
  { name: `${BRAND.master} Stock`, tag: 'Soon' },
];

const Footer = () => (
  <footer className="border-t border-border bg-background">
    <Section className="py-14">
      <div className="grid gap-10 md:grid-cols-4">
        <div>
          <AppBrand variant="lockup" size="sm" />
          <p className="mt-4 max-w-xs text-sm text-muted-foreground">{BRAND.tagline} The simplest financial operating system for modern businesses.</p>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">The ecosystem</h4>
          <ul className="mt-4 space-y-2.5">
            {ECOSYSTEM.map((p) => (
              <li key={p.name} className="flex items-center gap-2 text-sm text-muted-foreground">
                {p.name}
                <span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${p.tag === 'Live' ? 'bg-primary/10 text-primary' : 'bg-muted text-muted-foreground'}`}>{p.tag}</span>
              </li>
            ))}
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">Product</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            <li><a href="#features" className="transition-colors hover:text-foreground">Features</a></li>
            <li><a href="#ai" className="transition-colors hover:text-foreground">AI</a></li>
            <li><a href="#pricing" className="transition-colors hover:text-foreground">Pricing</a></li>
            <li><Link to="/auth" className="transition-colors hover:text-foreground">Sign in</Link></li>
          </ul>
        </div>
        <div>
          <h4 className="text-sm font-semibold text-foreground">Company</h4>
          <ul className="mt-4 space-y-2.5 text-sm text-muted-foreground">
            <li><Link to="/security" className="transition-colors hover:text-foreground">Security</Link></li>
            <li><Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link></li>
            <li><Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link></li>
            <li><Link to="/contact" className="transition-colors hover:text-foreground">Contact sales</Link></li>
          </ul>
        </div>
      </div>
      <div className="mt-12 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
        <p>© {new Date().getFullYear()} {BRAND.master}. All rights reserved.</p>
        <p className="font-medium text-foreground">{BRAND.tagline}</p>
      </div>
    </Section>
  </footer>
);

/* ------------------------------------------------------------------ */
/* Page                                                               */
/* ------------------------------------------------------------------ */

const Landing = () => {
  useDocumentTitle();
  return (
  <div className="min-h-screen scroll-smooth bg-background text-foreground">
    <a href="#main-content" className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2">
      Skip to content
    </a>
    <Nav />
    <main id="main-content">
      <Hero />
      <TrustBar />
      <Features />
      <Modules />
      <AISection />
      <WhyChoose />
      <BuiltForSA />
      <Security />
      <FoundingCohort />
      <Roadmap />
      <Pricing />
      <FAQ />
      <CTABand />
    </main>
    <Footer />
  </div>
  );
};

export default Landing;
