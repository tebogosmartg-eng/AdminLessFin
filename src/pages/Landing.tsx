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
  Layers,
  Brain,
  Wand2,
  TrendingUp,
  ScanLine,
  Bell,
  Star,
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
        <Pill><Sparkles className="h-3.5 w-3.5" /> The AI financial operating system</Pill>
        <h1 className="mt-6 text-5xl font-semibold leading-[1.05] tracking-tight text-foreground sm:text-6xl md:text-7xl">
          Less Admin.<br />
          <span className="text-primary">More Growth.</span>
        </h1>
        <p className="mt-6 max-w-xl text-lg text-muted-foreground sm:text-xl">
          {BRAND.description}
        </p>
        <div className="mt-8 flex flex-col items-center gap-3 sm:flex-row">
          <Button size="lg" className="h-12 px-7 text-base" asChild>
            <Link to="/auth">Start for free<ArrowRight className="ml-1.5 h-4 w-4" /></Link>
          </Button>
          <Button size="lg" variant="outline" className="h-12 px-7 text-base" asChild>
            <a href="#features">See how it works</a>
          </Button>
        </div>
        <p className="mt-4 text-sm text-muted-foreground">No credit card required · Set up in minutes</p>
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
    <p className="text-center text-sm text-muted-foreground">Trusted by modern teams who’d rather be building</p>
    <div className="mt-6 flex flex-wrap items-center justify-center gap-x-10 gap-y-4 opacity-60">
      {['Northwind', 'Meridian', 'Bluepeak', 'Cobalt', 'Loomly', 'Vantage'].map((n) => (
        <span key={n} className="text-lg font-semibold tracking-tight text-muted-foreground">{n}</span>
      ))}
    </div>
  </Section>
);

/* ------------------------------------------------------------------ */
/* Features                                                           */
/* ------------------------------------------------------------------ */

const FEATURES = [
  { icon: BookOpen, title: 'Accounting & Ledger', desc: 'Double-entry general ledger, chart of accounts and journals that stay balanced automatically.' },
  { icon: FileSignature, title: 'Invoicing & Payments', desc: 'Send polished invoices and quotes, track payments and get paid faster with reminders.' },
  { icon: Users, title: 'Payroll', desc: 'Run payroll, manage employees and expense claims, and stay compliant every cycle.' },
  { icon: Boxes, title: 'Inventory & Assets', desc: 'Track stock, valuations and fixed assets with depreciation handled for you.' },
  { icon: BarChart3, title: 'Reporting & Statements', desc: 'Income statements, balance sheets and comparatives — accurate and always current.' },
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

const BENEFITS = [
  { icon: Zap, title: 'Hours back every week', desc: 'Automation and AI cut manual data entry and month-end drudgery.' },
  { icon: Layers, title: 'One source of truth', desc: 'Sales, purchases, payroll and assets all reconcile to the same ledger.' },
  { icon: ShieldCheck, title: 'Bank-grade security', desc: 'Encryption, role-based access and audit trails on every action.' },
  { icon: TrendingUp, title: 'Scales with you', desc: 'From sole trader to multi-entity — add companies without switching tools.' },
];

const Benefits = () => (
  <Section className="py-24">
    <SectionHeading eyebrow="Why AdminLess" title="Built to get out of your way" />
    <div className="mt-14 grid gap-5 sm:grid-cols-2 lg:grid-cols-4">
      {BENEFITS.map((b) => (
        <div key={b.title} className="rounded-xl border border-border bg-card p-6 shadow-sm">
          <b.icon className="h-6 w-6 text-primary" />
          <h3 className="mt-4 font-semibold text-foreground">{b.title}</h3>
          <p className="mt-2 text-sm text-muted-foreground">{b.desc}</p>
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

const TESTIMONIALS = [
  { quote: 'We closed our first month in a day instead of a week. The AI reconciliation is genuinely magic.', name: 'Aisha M.', role: 'Founder, Meridian Studio' },
  { quote: 'Finally a finance tool my whole team understands. Invoices out, bills tracked, zero training.', name: 'Thabo K.', role: 'Ops Lead, Bluepeak' },
  { quote: 'The cash-flow forecast changed how we plan. It feels years ahead of what we used before.', name: 'Lena R.', role: 'CEO, Loomly' },
];

const Testimonials = () => (
  <div className="border-y border-border bg-muted/30">
    <Section className="py-24">
      <SectionHeading eyebrow="Loved by operators" title="Less time in the books, more time on the business" />
      <div className="mt-14 grid gap-5 md:grid-cols-3">
        {TESTIMONIALS.map((t) => (
          <figure key={t.name} className="flex flex-col rounded-xl border border-border bg-card p-6 shadow-sm">
            <div className="flex gap-0.5 text-primary">
              {Array.from({ length: 5 }).map((_, i) => <Star key={i} className="h-4 w-4 fill-current" />)}
            </div>
            <blockquote className="mt-4 flex-1 text-sm leading-relaxed text-foreground">“{t.quote}”</blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <div className="flex h-9 w-9 items-center justify-center rounded-full bg-primary/10 text-sm font-semibold text-primary">
                {t.name.split(' ').map((n) => n[0]).join('')}
              </div>
              <div>
                <p className="text-sm font-medium text-foreground">{t.name}</p>
                <p className="text-xs text-muted-foreground">{t.role}</p>
              </div>
            </figcaption>
          </figure>
        ))}
      </div>
    </Section>
  </div>
);

/* ------------------------------------------------------------------ */
/* Pricing                                                            */
/* ------------------------------------------------------------------ */

const PLANS = [
  { name: 'Starter', price: 'R0', cadence: '/mo', desc: 'For solo founders getting organised.', features: ['1 company', 'Invoicing & bills', 'Basic reports', 'AI auto-categorization'], cta: 'Start free', highlight: false },
  { name: 'Growth', price: 'R499', cadence: '/mo', desc: 'For growing teams that want it all.', features: ['Up to 3 companies', 'Payroll & assets', 'Full reporting suite', 'Cash-flow forecasting', 'Priority support'], cta: 'Start free trial', highlight: true },
  { name: 'Scale', price: 'Custom', cadence: '', desc: 'For multi-entity operations.', features: ['Unlimited companies', 'Advanced roles & audit', 'API access', 'Dedicated onboarding'], cta: 'Talk to sales', highlight: false },
];

const Pricing = () => (
  <Section id="pricing" className="py-24">
    <SectionHeading eyebrow="Pricing" title="Simple, transparent pricing" subtitle="Start free. Upgrade when you grow. Cancel anytime." />
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
            <Link to="/auth">{p.cta}</Link>
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
  { q: `Is ${BRAND.product} really free to start?`, a: 'Yes. The Starter plan is free forever for a single company, with no credit card required. Upgrade only when you need more.' },
  { q: 'Can I import my existing data?', a: 'Absolutely. You can import your chart of accounts, customers, vendors and opening balances via CSV during onboarding.' },
  { q: 'How does the AI keep my books accurate?', a: 'The AI proposes categorizations and reconciliations, but every posting follows double-entry rules and is fully auditable — you always stay in control.' },
  { q: 'Is my financial data secure?', a: 'Data is encrypted in transit and at rest, access is role-based per company, and every change is recorded in an audit trail.' },
  { q: 'Do you support multiple companies?', a: 'Yes — switch between companies from a single login. Growth and Scale plans raise or remove the company limit.' },
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
            <li><span className="transition-colors hover:text-foreground">About</span></li>
            <li><span className="transition-colors hover:text-foreground">Security</span></li>
            <li><span className="transition-colors hover:text-foreground">Privacy</span></li>
            <li><span className="transition-colors hover:text-foreground">Terms</span></li>
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
      <Benefits />
      <Security />
      <Testimonials />
      <Pricing />
      <FAQ />
      <CTABand />
    </main>
    <Footer />
  </div>
  );
};

export default Landing;
