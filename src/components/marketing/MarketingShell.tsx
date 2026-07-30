import { Link } from 'react-router-dom';
import { ArrowLeft } from 'lucide-react';
import { AppHeaderLogo, AppBrand } from '../brand';
import { BRAND } from '../../config/brand';
import { Button } from '../ui/button';
import { useDocumentTitle } from '../../hooks/useDocumentTitle';

/**
 * Shared marketing/legal page frame. Reuses the landing page's design tokens
 * (sticky blurred header, max-w container, muted footer) so legal, security and
 * contact pages feel like the same premium product — without modifying the
 * landing page's own component hierarchy.
 */
export const MarketingShell = ({
  title,
  children,
}: {
  title?: string;
  children: React.ReactNode;
}) => {
  useDocumentTitle(title);
  return (
    <div className="min-h-screen scroll-smooth bg-background text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-50 focus:rounded-md focus:bg-card focus:px-3 focus:py-2"
      >
        Skip to content
      </a>

      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/80 backdrop-blur-md">
        <div className="mx-auto flex h-16 w-full max-w-6xl items-center justify-between px-6">
          <Link to="/" aria-label={`${BRAND.product} home`}>
            <AppHeaderLogo />
          </Link>
          <div className="flex items-center gap-2">
            <Button variant="ghost" asChild>
              <Link to="/">
                <ArrowLeft className="mr-1.5 h-4 w-4" />
                Back to home
              </Link>
            </Button>
            <Button asChild>
              <Link to="/auth">Get started</Link>
            </Button>
          </div>
        </div>
      </header>

      <main id="main-content">{children}</main>

      <footer className="border-t border-border bg-background">
        <div className="mx-auto w-full max-w-6xl px-6 py-10">
          <div className="flex flex-col items-center justify-between gap-4 sm:flex-row">
            <AppBrand variant="lockup" size="sm" />
            <nav className="flex flex-wrap items-center justify-center gap-x-6 gap-y-2 text-sm text-muted-foreground">
              <Link to="/security" className="transition-colors hover:text-foreground">Security</Link>
              <Link to="/privacy" className="transition-colors hover:text-foreground">Privacy</Link>
              <Link to="/terms" className="transition-colors hover:text-foreground">Terms</Link>
              <Link to="/contact" className="transition-colors hover:text-foreground">Contact sales</Link>
              <Link to="/auth" className="transition-colors hover:text-foreground">Sign in</Link>
            </nav>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-3 border-t border-border pt-6 text-sm text-muted-foreground sm:flex-row">
            <p>© {new Date().getFullYear()} {BRAND.master}. All rights reserved.</p>
            <p className="font-medium text-foreground">{BRAND.tagline}</p>
          </div>
        </div>
      </footer>
    </div>
  );
};

/** Prose container for legal/policy copy — consistent measure + rhythm. */
export const LegalBody = ({
  eyebrow,
  title,
  updated,
  children,
}: {
  eyebrow: string;
  title: string;
  updated?: string;
  children: React.ReactNode;
}) => (
  <div className="mx-auto w-full max-w-3xl px-6 py-16 sm:py-20">
    <p className="text-sm font-semibold uppercase tracking-wider text-primary">{eyebrow}</p>
    <h1 className="mt-3 text-3xl font-semibold tracking-tight text-foreground sm:text-4xl">{title}</h1>
    {updated && <p className="mt-3 text-sm text-muted-foreground">{updated}</p>}
    <div className="mt-10 space-y-8 text-[15px] leading-relaxed text-muted-foreground">{children}</div>
  </div>
);

/** A titled policy section with consistent heading treatment. */
export const LegalSection = ({ heading, children }: { heading: string; children: React.ReactNode }) => (
  <section>
    <h2 className="text-lg font-semibold text-foreground">{heading}</h2>
    <div className="mt-3 space-y-3">{children}</div>
  </section>
);
