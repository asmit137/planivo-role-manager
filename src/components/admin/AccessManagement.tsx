import { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { UserPlus, Loader2 } from 'lucide-react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

const AccessManagement = () => {
  const [emails, setEmails] = useState('');
  const [selectedWorkspace, setSelectedWorkspace] = useState('');
  const { toast } = useToast();
  const queryClient = useQueryClient();

  const { data: workspaces } = useQuery({
    queryKey: ['workspaces'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const createStaffMutation = useMutation({
    mutationFn: async ({ emails, workspaceId }: { emails: string[]; workspaceId: string }) => {
      const { data, error } = await supabase.functions.invoke('bulk-create-staff', {
        body: { emails, workspaceId },
      });

      if (error) throw error;
      return data;
    },
    onSuccess: (data) => {
      toast({
        title: 'Success',
        description: `${data.created} staff user(s) created successfully. Default password: 1234`,
      });
      setEmails('');
      setSelectedWorkspace('');
      queryClient.invalidateQueries({ queryKey: ['totalUsers'] });
    },
    onError: (error: Error) => {
      toast({
        title: 'Error',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = () => {
    if (!emails.trim() || !selectedWorkspace) {
      toast({
        title: 'Missing Information',
        description: 'Please enter email addresses and select a workspace',
        variant: 'destructive',
      });
      return;
    }

    const emailList = emails
      .split('\n')
      .map(e => e.trim())
      .filter(e => e && e.includes('@'));

    if (emailList.length === 0) {
      toast({
        title: 'Invalid Emails',
        description: 'Please enter at least one valid email address',
        variant: 'destructive',
      });
      return;
    }

    createStaffMutation.mutate({
      emails: emailList,
      workspaceId: selectedWorkspace,
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <UserPlus className="h-5 w-5" />
          Access Management - Bulk Staff Creation
        </CardTitle>
        <CardDescription>
          Add multiple staff users to a workspace. Each user will receive default password: 1234 and must change it on first login.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="space-y-2">
          <Label htmlFor="workspace">Select Workspace</Label>
          <Select value={selectedWorkspace} onValueChange={setSelectedWorkspace}>
            <SelectTrigger>
              <SelectValue placeholder="Choose workspace..." />
            </SelectTrigger>
            <SelectContent>
              {workspaces?.map((workspace) => (
                <SelectItem key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-2">
          <Label htmlFor="emails">Email Addresses (one per line)</Label>
          <Textarea
            id="emails"
            placeholder="john@example.com&#10;jane@example.com&#10;mike@example.com"
            value={emails}
            onChange={(e) => setEmails(e.target.value)}
            rows={8}
            className="font-mono text-sm"
          />
          <p className="text-sm text-muted-foreground">
            Enter one email address per line. Invalid emails will be skipped.
          </p>
        </div>

        <Button
          onClick={handleSubmit}
          disabled={createStaffMutation.isPending}
          className="w-full"
        >
          {createStaffMutation.isPending && (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" />
          )}
          Create Staff Users
        </Button>
      </CardContent>
    </Card>
  );
};

export default AccessManagement;
