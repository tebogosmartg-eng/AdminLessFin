import { supabase } from '../integrations/supabase/client';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useAuth } from '../contexts/AuthContext';
import { Navigate, Link } from 'react-router-dom';
import { ArrowLeft, Check, Sparkles } from 'lucide-react';
import { AppBrand } from '../components/brand';
import { BRAND } from '../config/brand';
import { useDocumentTitle } from '../hooks/useDocumentTitle';

const VALUE_PROPS = [
  'AI that categorizes and reconciles for you',
  'Invoicing, payroll and reporting in one place',
  'A live picture of your cash, always',
];

const AuthPage = () => {
  const { session } = useAuth();
  useDocumentTitle('Sign in');

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="flex min-h-screen bg-background">
      {/* Brand panel — hidden on small screens */}
      <div className="relative hidden w-1/2 flex-col justify-between overflow-hidden bg-primary p-12 text-primary-foreground lg:flex">
        <div
          className="pointer-events-none absolute inset-0 opacity-20"
          style={{ backgroundImage: 'radial-gradient(circle at 25% 15%, white, transparent 45%)' }}
        />
        <Link to="/welcome" className="relative flex items-center gap-2.5 text-xl">
          <AppBrand variant="full" size="md" badgeVariant="onPrimary" wordmarkClassName="text-primary-foreground" />
        </Link>

        <div className="relative">
          <div className="inline-flex items-center gap-1.5 rounded-full bg-primary-foreground/10 px-3 py-1 text-xs font-medium">
            <Sparkles className="h-3.5 w-3.5" /> The AI financial operating system
          </div>
          <h1 className="mt-6 text-4xl font-semibold leading-tight tracking-tight">
            {BRAND.taglineLines.map((line, i) => (
              <span key={line}>
                {line}
                {i < BRAND.taglineLines.length - 1 && <br />}
              </span>
            ))}
          </h1>
          <ul className="mt-8 space-y-3">
            {VALUE_PROPS.map((v) => (
              <li key={v} className="flex items-center gap-3 text-primary-foreground/90">
                <span className="flex h-5 w-5 items-center justify-center rounded-full bg-primary-foreground/15">
                  <Check className="h-3 w-3" />
                </span>
                {v}
              </li>
            ))}
          </ul>
        </div>

        <p className="relative text-sm text-primary-foreground/70">© {new Date().getFullYear()} {BRAND.master}</p>
      </div>

      {/* Form panel */}
      <div className="flex w-full flex-col items-center justify-center px-6 py-12 lg:w-1/2">
        <div className="w-full max-w-sm">
          <Link
            to="/welcome"
            className="mb-8 inline-flex items-center gap-1.5 text-sm text-muted-foreground transition-colors hover:text-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Back to home
          </Link>

          <AppBrand variant="full" size="lg" className="mb-1" />
          <h2 className="mt-6 text-2xl font-semibold tracking-tight text-foreground">Welcome back</h2>
          <p className="mt-1 text-sm text-muted-foreground">Sign in to your {BRAND.product} workspace.</p>

          <div className="mt-8">
            <Auth
              supabaseClient={supabase}
              appearance={{
                theme: ThemeSupa,
                variables: {
                  default: {
                    colors: {
                      brand: 'hsl(163 94% 24%)',
                      brandAccent: 'hsl(160 84% 39%)',
                      brandButtonText: 'white',
                    },
                    radii: {
                      borderRadiusButton: '8px',
                      buttonBorderRadius: '8px',
                      inputBorderRadius: '8px',
                    },
                  },
                },
              }}
              providers={[]}
              theme="light"
            />
          </div>
        </div>
      </div>
    </div>
  );
};

export default AuthPage;
