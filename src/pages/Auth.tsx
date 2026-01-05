import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { toast } from 'sonner';
import { Loader2 } from 'lucide-react';
import { z } from 'zod';

const loginSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
});

const Auth = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [loading, setLoading] = useState(false);
  const [mode, setMode] = useState<'login' | 'signup' | 'forgot'>('login');
  const [resetSent, setResetSent] = useState(false);
  const navigate = useNavigate();
  const { user } = useAuth();

  useEffect(() => {
    if (user) {
      navigate('/dashboard');
    }
  }, [user, navigate]);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      const validated = loginSchema.parse({ email, password });
      setLoading(true);

      const { data, error } = await supabase.auth.signInWithPassword({
        email: validated.email,
        password: validated.password,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data.user) {
        toast.success('Welcome back!');
        navigate('/dashboard');
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error('An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleSignUp = async (e: React.FormEvent) => {
    e.preventDefault();

    try {
      if (!fullName.trim()) {
        toast.error('Please enter your full name');
        return;
      }

      const validated = loginSchema.parse({ email, password });
      setLoading(true);

      const { data, error } = await supabase.auth.signUp({
        email: validated.email,
        password: validated.password,
        options: {
          data: {
            full_name: fullName,
          },
        },
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      if (data.user) {
        toast.success('Registration successful! Please check your email for verification.');
        setMode('login');
      }
    } catch (error) {
      if (error instanceof z.ZodError) {
        toast.error(error.errors[0].message);
      } else {
        toast.error('An error occurred. Please try again.');
      }
    } finally {
      setLoading(false);
    }
  };

  const handleGoogleLogin = async () => {
    try {
      setLoading(true);
      const { error } = await supabase.auth.signInWithOAuth({
        provider: 'google',
        options: {
          redirectTo: window.location.origin + '/dashboard',
        },
      });
      if (error) throw error;
    } catch (error: any) {
      toast.error(error.message || 'Error connecting to Google');
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!email.trim()) {
      toast.error('Please enter your email address');
      return;
    }

    try {
      setLoading(true);
      const redirectUrl = `${window.location.origin}/reset-password`;

      const { error } = await supabase.auth.resetPasswordForEmail(email, {
        redirectTo: redirectUrl,
      });

      if (error) {
        toast.error(error.message);
        return;
      }

      setResetSent(true);
      toast.success('Password reset link sent to your email!');
    } catch (error) {
      toast.error('An error occurred. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center p-4 relative overflow-hidden bg-background">
      {/* Enhanced Background Pattern */}
      <div className="absolute inset-0 bg-gradient-to-br from-primary/20 via-background to-accent/20" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,hsl(var(--primary)/0.15),transparent_50%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,hsl(var(--accent)/0.15),transparent_50%)]" />

      {/* Animated Grid Pattern */}
      <div className="absolute inset-0 bg-grid-white/[0.03] bg-[size:50px_50px]" />

      <div className="absolute top-1/4 left-1/4 w-64 h-64 bg-primary/20 rounded-full blur-3xl animate-pulse" />
      <div className="absolute bottom-1/4 right-1/4 w-80 h-80 bg-accent/20 rounded-full blur-3xl animate-pulse" style={{ animationDelay: '1s' }} />

      <Card className="w-full max-w-md shadow-2xl border-2 backdrop-blur-xl bg-card/90 relative z-10 hover:shadow-primary/10 transition-all duration-300">
        <CardHeader className="space-y-1 text-center pb-8 pt-8">
          <div className="mb-8 flex justify-center">
            <div className="relative group">
              <div className="absolute inset-0 bg-gradient-primary blur-2xl opacity-60 group-hover:opacity-80 transition-opacity" />
              <h1 className="text-6xl font-display font-bold bg-gradient-primary bg-clip-text text-transparent relative tracking-tight">
                Planivo
              </h1>
            </div>
          </div>
          <CardTitle className="text-3xl font-display font-semibold">
            {mode === 'login' ? 'Welcome Back' : mode === 'signup' ? 'Create Account' : 'Reset Password'}
          </CardTitle>
          <CardDescription className="text-base pt-2">
            {mode === 'login'
              ? 'Enterprise Workforce Management System'
              : mode === 'signup'
                ? 'Join our workforce management platform'
                : resetSent
                  ? 'Check your email for the reset link'
                  : 'Enter your email to receive a reset link'
            }
          </CardDescription>
        </CardHeader>
        <CardContent className="px-8 pb-8">
          {mode !== 'forgot' ? (
            <div className="space-y-6">
              <form onSubmit={mode === 'login' ? handleLogin : handleSignUp} className="space-y-4">
                {mode === 'signup' && (
                  <div className="space-y-2">
                    <Label htmlFor="fullName">Full Name</Label>
                    <Input
                      id="fullName"
                      placeholder="John Doe"
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      disabled={loading}
                      required
                      className="border-2 h-11"
                    />
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email">Email Address</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="name@company.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    disabled={loading}
                    required
                    className="border-2 h-11"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="password">Password</Label>
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    disabled={loading}
                    required
                    className="border-2 h-11"
                  />
                </div>

                {mode === 'login' && (
                  <div className="text-right">
                    <Button
                      type="button"
                      variant="link"
                      onClick={() => setMode('forgot')}
                      className="h-auto p-0 text-sm text-primary"
                    >
                      Forgot Password?
                    </Button>
                  </div>
                )}

                <Button
                  type="submit"
                  className="w-full h-11 bg-gradient-primary shadow-lg hover:scale-[1.01] transition-all"
                  disabled={loading}
                >
                  {loading ? (
                    <Loader2 className="mr-2 h-5 w-5 animate-spin" />
                  ) : mode === 'login' ? (
                    'Sign In'
                  ) : (
                    'Create Account'
                  )}
                </Button>
              </form>

              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <span className="w-full border-t" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-card px-2 text-muted-foreground">Or continue with</span>
                </div>
              </div>

              <Button
                type="button"
                variant="outline"
                className="w-full h-11 border-2 hover:bg-accent/50 transition-all font-medium"
                onClick={handleGoogleLogin}
                disabled={loading}
              >
                <svg className="mr-2 h-5 w-5" viewBox="0 0 24 24">
                  <path
                    d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.14 2.53-2.3 3.31v2.77h3.72c2.17-2 3.42-4.94 3.42-8.09z"
                    fill="#4285F4"
                  />
                  <path
                    d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.72-2.77c-1.02.69-2.33 1.1-3.56 1.1-2.73 0-5.04-1.84-5.87-4.31H2.46v2.87C4.27 20.21 7.82 23 12 23z"
                    fill="#34A853"
                  />
                  <path
                    d="M6.13 14.36c-.21-.64-.33-1.33-.33-2.04s.12-1.4.33-2.04V7.41H2.46C1.53 9.24 1 11.28 1 12s.53 2.76 1.46 4.59l3.67-2.87z"
                    fill="#FBBC05"
                  />
                  <path
                    d="M12 5.38c1.62 0 3.06.56 4.21 1.66l3.15-3.15C17.45 2.09 14.97 1 12 1 7.82 1 4.27 3.79 2.46 7.41l3.67 2.87c.83-2.47 3.14-4.31 5.87-4.31z"
                    fill="#EA4335"
                  />
                </svg>
                Sign in with Google
              </Button>

              <div className="text-center text-sm text-muted-foreground">
                {mode === 'login' ? (
                  <>
                    Don't have an account?{' '}
                    <button
                      onClick={() => setMode('signup')}
                      className="font-medium text-primary hover:underline"
                    >
                      Sign Up
                    </button>
                  </>
                ) : (
                  <>
                    Already have an account?{' '}
                    <button
                      onClick={() => setMode('login')}
                      className="font-medium text-primary hover:underline"
                    >
                      Sign In
                    </button>
                  </>
                )}
              </div>
            </div>
          ) : (
            <form onSubmit={handleForgotPassword} className="space-y-5">
              <div className="space-y-2">
                <Label htmlFor="reset-email">Email Address</Label>
                <Input
                  id="reset-email"
                  type="email"
                  placeholder="name@company.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  disabled={loading || resetSent}
                  required
                  className="border-2 h-11"
                />
              </div>
              {!resetSent ? (
                <Button
                  type="submit"
                  className="w-full h-11 bg-gradient-primary shadow-lg"
                  disabled={loading}
                >
                  {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : 'Send Reset Link'}
                </Button>
              ) : (
                <p className="text-center text-sm text-muted-foreground">
                  A password reset link has been sent to your email.
                </p>
              )}
              <div className="text-center">
                <Button
                  type="button"
                  variant="link"
                  onClick={() => {
                    setMode('login');
                    setResetSent(false);
                  }}
                  className="h-auto p-0 text-sm text-primary"
                >
                  Back to Sign In
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>


    </div>
  );
};

export default Auth;
