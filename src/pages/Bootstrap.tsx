import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { Loader2, Shield } from 'lucide-react';
import { z } from 'zod';

const bootstrapSchema = z.object({
  email: z.string().email('Invalid email address'),
  password: z.string().min(6, 'Password must be at least 6 characters'),
  full_name: z.string().min(2, 'Name must be at least 2 characters'),
  bootstrap_secret: z.string().min(1, 'Bootstrap secret is required'),
});

const Bootstrap = () => {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [fullName, setFullName] = useState('');
  const [bootstrapSecret, setBootstrapSecret] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  const handleBootstrap = async (e: React.FormEvent) => {
    e.preventDefault();
    
    try {
      const validated = bootstrapSchema.parse({ 
        email, 
        password, 
        full_name: fullName, 
        bootstrap_secret: bootstrapSecret 
      });
      
      setLoading(true);

      const { data, error } = await supabase.functions.invoke('bootstrap-admin', {
        body: validated,
      });

      if (error) {
        toast.error(error.message || 'Failed to create Super Admin');
        return;
      }

      if (data.error) {
        toast.error(data.error);
        return;
      }

      toast.success('Super Admin created! Please log in.');
      setTimeout(() => navigate('/auth'), 2000);
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

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-primary/10 via-accent/5 to-background p-4">
      <Card className="w-full max-w-md shadow-strong border-2">
        <CardHeader className="space-y-1 text-center">
          <div className="mb-4 flex justify-center">
            <div className="p-3 rounded-full bg-primary/10">
              <Shield className="h-8 w-8 text-primary" />
            </div>
          </div>
          <CardTitle className="text-2xl">Bootstrap Planivo</CardTitle>
          <CardDescription>
            Create the first Super Admin account
          </CardDescription>
        </CardHeader>
        <CardContent>
          <form onSubmit={handleBootstrap} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="full-name">Full Name</Label>
              <Input
                id="full-name"
                placeholder="Admin User"
                value={fullName}
                onChange={(e) => setFullName(e.target.value)}
                disabled={loading}
                required
                className="border-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                type="email"
                placeholder="admin@planivo.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                disabled={loading}
                required
                className="border-2"
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
                className="border-2"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="bootstrap-secret">Bootstrap Secret</Label>
              <Input
                id="bootstrap-secret"
                type="password"
                placeholder="planivo_bootstrap_2024"
                value={bootstrapSecret}
                onChange={(e) => setBootstrapSecret(e.target.value)}
                disabled={loading}
                required
                className="border-2"
              />
              <p className="text-xs text-muted-foreground">
                Default: planivo_bootstrap_2024 (change in production!)
              </p>
            </div>
            <Button
              type="submit"
              className="w-full bg-gradient-primary shadow-medium hover:shadow-strong transition-all"
              disabled={loading}
            >
              {loading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Creating...
                </>
              ) : (
                'Create Super Admin'
              )}
            </Button>
          </form>
          <div className="mt-4 text-center">
            <Button variant="link" onClick={() => navigate('/')} disabled={loading}>
              Already have an account? Sign in
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};

export default Bootstrap;
