import { supabase } from '../integrations/supabase/client';
import { Auth } from '@supabase/auth-ui-react';
import { ThemeSupa } from '@supabase/auth-ui-shared';
import { useAuth } from '../contexts/AuthContext';
import { Navigate } from 'react-router-dom';

const AuthPage = () => {
  const { session } = useAuth();

  if (session) {
    return <Navigate to="/" replace />;
  }

  return (
    <div className="grid min-h-screen w-full lg:grid-cols-2">
      <div className="hidden bg-primary lg:flex flex-col items-center justify-center p-12 text-primary-foreground">
        <div className="text-center">
          <img src="/logo.png" alt="SmaAcc Logo" className="mx-auto h-40 w-auto mb-6" />
          <h1 className="text-4xl font-bold">Welcome to SmaAcc</h1>
          <p className="mt-2 text-lg text-primary-foreground/80">
            Smart Accounting, Simplified.
          </p>
        </div>
      </div>
      <div className="flex items-center justify-center bg-background p-8">
        <div className="w-full max-w-md space-y-6">
           <img src="/logo.png" alt="SmaAcc Logo" className="mx-auto h-32 w-auto lg:hidden" />
          <Auth
            supabaseClient={supabase}
            appearance={{ theme: ThemeSupa }}
            providers={[]}
            theme="light"
          />
        </div>
      </div>
    </div>
  );
};

export default AuthPage;