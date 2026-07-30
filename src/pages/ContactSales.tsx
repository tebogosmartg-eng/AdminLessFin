import { useState } from 'react';
import { ArrowRight, Building2, CalendarClock, Mail, Check } from 'lucide-react';
import { MarketingShell } from '../components/marketing/MarketingShell';
import { Button } from '../components/ui/button';
import { Input } from '../components/ui/input';
import { Label } from '../components/ui/label';
import { Textarea } from '../components/ui/textarea';
import { BRAND } from '../config/brand';

const SALES_EMAIL = 'sales@adminless.co.za';

const SIZES = ['1–5 employees', '6–20 employees', '21–50 employees', '51–200 employees', '200+ employees'];

const HIGHLIGHTS = [
  { icon: Building2, title: 'Multi-entity & group', desc: 'Multiple companies under one login, with consolidated oversight.' },
  { icon: CalendarClock, title: 'Guided onboarding', desc: 'Hands-on setup of your chart of accounts, VAT, payroll and opening balances.' },
  { icon: Check, title: 'Founding-partner support', desc: 'A direct line to the team and influence over the roadmap during beta.' },
];

const ContactSales = () => {
  const [form, setForm] = useState({ name: '', email: '', company: '', size: SIZES[1], message: '' });
  const [sent, setSent] = useState(false);

  const set = (k: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement>) =>
    setForm((f) => ({ ...f, [k]: e.target.value }));

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const subject = encodeURIComponent(`Enterprise enquiry — ${form.company || form.name}`);
    const body = encodeURIComponent(
      [
        `Name: ${form.name}`,
        `Work email: ${form.email}`,
        `Company: ${form.company}`,
        `Company size: ${form.size}`,
        '',
        form.message,
      ].join('\n'),
    );
    window.location.href = `mailto:${SALES_EMAIL}?subject=${subject}&body=${body}`;
    setSent(true);
  };

  return (
    <MarketingShell title="Contact Sales">
      <section className="mx-auto w-full max-w-6xl px-6 py-16 sm:py-20">
        <div className="grid gap-12 lg:grid-cols-2 lg:gap-16">
          {/* Pitch */}
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-primary">Talk to our team</p>
            <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">
              Book a demo or plan your rollout
            </h1>
            <p className="mt-4 text-lg text-muted-foreground">
              For multi-entity groups, finance teams and accounting practices, we’ll walk you through
              {' '}{BRAND.product}, help you plan a migration, and set up onboarding for your business.
            </p>

            <div className="mt-10 space-y-4">
              {HIGHLIGHTS.map((h) => (
                <div key={h.title} className="flex items-start gap-4">
                  <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary">
                    <h.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="font-medium text-foreground">{h.title}</p>
                    <p className="text-sm text-muted-foreground">{h.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-10 flex items-center gap-2 text-sm text-muted-foreground">
              <Mail className="h-4 w-4 text-primary" />
              <span>Prefer email? </span>
              <a href={`mailto:${SALES_EMAIL}`} className="font-medium text-primary hover:underline">{SALES_EMAIL}</a>
            </div>
          </div>

          {/* Form */}
          <div className="rounded-2xl border border-border bg-card p-6 shadow-sm sm:p-8">
            {sent ? (
              <div className="flex h-full flex-col items-center justify-center py-10 text-center">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/10 text-primary">
                  <Check className="h-6 w-6" />
                </div>
                <h2 className="mt-4 text-xl font-semibold text-foreground">Almost there</h2>
                <p className="mt-2 max-w-sm text-sm text-muted-foreground">
                  Your email client should have opened with your enquiry ready to send. If it didn’t, email us
                  directly at{' '}
                  <a href={`mailto:${SALES_EMAIL}`} className="font-medium text-primary hover:underline">{SALES_EMAIL}</a>.
                </p>
                <Button variant="outline" className="mt-6" onClick={() => setSent(false)}>Edit my enquiry</Button>
              </div>
            ) : (
              <form className="space-y-5" onSubmit={handleSubmit}>
                <div className="grid gap-5 sm:grid-cols-2">
                  <div className="space-y-2">
                    <Label htmlFor="name">Full name</Label>
                    <Input id="name" required value={form.name} onChange={set('name')} placeholder="Your name" />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="email">Work email</Label>
                    <Input id="email" type="email" required value={form.email} onChange={set('email')} placeholder="you@company.co.za" />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="company">Company</Label>
                  <Input id="company" required value={form.company} onChange={set('company')} placeholder="Company name" />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="size">Company size</Label>
                  <select
                    id="size"
                    value={form.size}
                    onChange={set('size')}
                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                  >
                    {SIZES.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="message">How can we help?</Label>
                  <Textarea id="message" rows={4} value={form.message} onChange={set('message')} placeholder="Tell us about your business and what you'd like to see." />
                </div>
                <Button type="submit" size="lg" className="w-full">
                  Send enquiry<ArrowRight className="ml-1.5 h-4 w-4" />
                </Button>
                <p className="text-center text-xs text-muted-foreground">
                  We’ll only use your details to respond to your enquiry.
                </p>
              </form>
            )}
          </div>
        </div>
      </section>
    </MarketingShell>
  );
};

export default ContactSales;
