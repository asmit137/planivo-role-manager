import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Settings, Save, Calendar, Users, Clock } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { useState, useEffect } from 'react';
import { LoadingState } from '@/components/layout';

const VacationRulesManagement = () => {
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const [formData, setFormData] = useState({
    max_vacation_splits: 6,
    min_vacation_notice_days: 14,
    max_concurrent_vacations: 3,
    vacation_year_start_month: 1,
  });

  // Fetch all workspaces
  const { data: workspaces, isLoading } = useQuery({
    queryKey: ['workspaces-rules'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('workspaces')
        .select('*')
        .order('created_at', { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  // Use first workspace for now (Super Admin can extend this to manage all workspaces)
  const selectedWorkspace = workspaces?.[0];

  useEffect(() => {
    if (selectedWorkspace) {
      setFormData({
        max_vacation_splits: selectedWorkspace.max_vacation_splits || 6,
        min_vacation_notice_days: selectedWorkspace.min_vacation_notice_days || 14,
        max_concurrent_vacations: selectedWorkspace.max_concurrent_vacations || 3,
        vacation_year_start_month: selectedWorkspace.vacation_year_start_month || 1,
      });
    }
  }, [selectedWorkspace]);

  const updateMutation = useMutation({
    mutationFn: async (data: typeof formData) => {
      if (!selectedWorkspace) throw new Error('No workspace selected');
      
      const { error } = await supabase
        .from('workspaces')
        .update(data)
        .eq('id', selectedWorkspace.id);
      
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['workspaces-rules'] });
      toast({
        title: 'Rules Updated',
        description: 'Vacation rules have been successfully updated.',
      });
    },
    onError: (error: Error) => {
      toast({
        title: 'Update Failed',
        description: error.message,
        variant: 'destructive',
      });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate(formData);
  };

  if (isLoading) {
    return <LoadingState message="Loading vacation rules..." />;
  }

  if (!selectedWorkspace) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>No Workspace Found</CardTitle>
          <CardDescription>Create a workspace to configure vacation rules</CardDescription>
        </CardHeader>
      </Card>
    );
  }

  const months = [
    { value: 1, label: 'January' },
    { value: 2, label: 'February' },
    { value: 3, label: 'March' },
    { value: 4, label: 'April' },
    { value: 5, label: 'May' },
    { value: 6, label: 'June' },
    { value: 7, label: 'July' },
    { value: 8, label: 'August' },
    { value: 9, label: 'September' },
    { value: 10, label: 'October' },
    { value: 11, label: 'November' },
    { value: 12, label: 'December' },
  ];

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Vacation Planning Rules
          </CardTitle>
          <CardDescription>
            Configure system-wide vacation planning rules and constraints for {selectedWorkspace.name}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Max Vacation Splits */}
          <div className="space-y-2">
            <Label htmlFor="max_splits" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Maximum Vacation Splits
            </Label>
            <Input
              id="max_splits"
              type="number"
              min="1"
              max="12"
              value={formData.max_vacation_splits}
              onChange={(e) =>
                setFormData({ ...formData, max_vacation_splits: parseInt(e.target.value) })
              }
              placeholder="e.g., 6"
            />
            <p className="text-sm text-muted-foreground">
              Maximum number of date ranges a single vacation plan can be split into
            </p>
          </div>

          {/* Min Notice Days */}
          <div className="space-y-2">
            <Label htmlFor="min_notice" className="flex items-center gap-2">
              <Clock className="h-4 w-4" />
              Minimum Advance Notice (Days)
            </Label>
            <Input
              id="min_notice"
              type="number"
              min="0"
              max="90"
              value={formData.min_vacation_notice_days}
              onChange={(e) =>
                setFormData({ ...formData, min_vacation_notice_days: parseInt(e.target.value) })
              }
              placeholder="e.g., 14"
            />
            <p className="text-sm text-muted-foreground">
              Minimum days in advance that staff must submit vacation requests
            </p>
          </div>

          {/* Max Concurrent Vacations */}
          <div className="space-y-2">
            <Label htmlFor="max_concurrent" className="flex items-center gap-2">
              <Users className="h-4 w-4" />
              Maximum Concurrent Vacations per Department
            </Label>
            <Input
              id="max_concurrent"
              type="number"
              min="1"
              max="20"
              value={formData.max_concurrent_vacations}
              onChange={(e) =>
                setFormData({ ...formData, max_concurrent_vacations: parseInt(e.target.value) })
              }
              placeholder="e.g., 3"
            />
            <p className="text-sm text-muted-foreground">
              Maximum number of staff members who can be on vacation at the same time in a department
            </p>
          </div>

          {/* Vacation Year Start */}
          <div className="space-y-2">
            <Label htmlFor="year_start" className="flex items-center gap-2">
              <Calendar className="h-4 w-4" />
              Vacation Year Start Month
            </Label>
            <select
              id="year_start"
              value={formData.vacation_year_start_month}
              onChange={(e) =>
                setFormData({ ...formData, vacation_year_start_month: parseInt(e.target.value) })
              }
              className="w-full px-3 py-2 border rounded-md bg-background"
            >
              {months.map((month) => (
                <option key={month.value} value={month.value}>
                  {month.label}
                </option>
              ))}
            </select>
            <p className="text-sm text-muted-foreground">
              The month when the vacation year begins (for annual leave calculations)
            </p>
          </div>

          <Button type="submit" disabled={updateMutation.isPending} className="w-full">
            <Save className="h-4 w-4 mr-2" />
            {updateMutation.isPending ? 'Saving...' : 'Save Rules'}
          </Button>
        </CardContent>
      </Card>
    </form>
  );
};

export default VacationRulesManagement;
