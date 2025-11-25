import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Calendar } from '@/components/ui/calendar';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { format } from 'date-fns';
import { CalendarIcon, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { useRealtimeSubscription } from '@/hooks/useRealtimeSubscription';

interface VacationSplit {
  start_date: Date;
  end_date: Date;
  days: number;
}

interface VacationPlannerProps {
  departmentId?: string;
  maxSplits?: number;
  staffOnly?: boolean;
}

const VacationPlanner = ({ departmentId, maxSplits = 6, staffOnly = false }: VacationPlannerProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [selectedStaff, setSelectedStaff] = useState('');
  const [selectedVacationType, setSelectedVacationType] = useState('');
  const [notes, setNotes] = useState('');
  const [splits, setSplits] = useState<VacationSplit[]>([]);

  // Fetch current user's role to auto-detect behavior
  const { data: currentUserRole } = useQuery({
    queryKey: ['current-user-role', user?.id],
    queryFn: async () => {
      if (!user?.id) return null;
      const { data } = await supabase
        .from('user_roles')
        .select('*')
        .eq('user_id', user.id)
        .in('role', ['department_head', 'staff'])
        .maybeSingle();
      return data;
    },
    enabled: !!user,
  });

  // Determine effective department ID and mode
  const effectiveDepartmentId = departmentId || currentUserRole?.department_id;
  const isStaff = currentUserRole?.role === 'staff';
  const isDepartmentHead = currentUserRole?.role === 'department_head';
  const effectiveStaffOnly = staffOnly || isStaff;

  // Auto-select staff member if in staff-only mode
  if (effectiveStaffOnly && user?.id && !selectedStaff) {
    setSelectedStaff(user.id);
  }

  // Real-time subscriptions for live updates
  useRealtimeSubscription({
    table: 'vacation_plans',
    invalidateQueries: ['vacation-plans', 'department-staff'],
  });

  useRealtimeSubscription({
    table: 'vacation_splits',
    invalidateQueries: ['vacation-plans'],
  });

  useRealtimeSubscription({
    table: 'vacation_types',
    invalidateQueries: ['vacation-types'],
  });

  const { data: vacationTypes } = useQuery({
    queryKey: ['vacation-types'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('vacation_types')
        .select('*')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
  });

  const { data: departmentStaff } = useQuery({
    queryKey: ['department-staff', effectiveDepartmentId],
    queryFn: async () => {
      if (!effectiveDepartmentId) return [];
      const { data, error } = await supabase
        .from('user_roles')
        .select('user_id, role, profiles(id, full_name, email)')
        .eq('department_id', effectiveDepartmentId)
        .in('role', ['staff', 'department_head']);
      if (error) throw error;
      return data;
    },
    enabled: !effectiveStaffOnly && !!effectiveDepartmentId,
  });

  const createPlanMutation = useMutation({
    mutationFn: async (planData: any) => {
      // Use the effective department ID
      const targetDepartmentId = effectiveDepartmentId;
      
      if (!targetDepartmentId) {
        throw new Error('No department ID available');
      }
      
      const { data: plan, error: planError } = await supabase
        .from('vacation_plans')
        .insert({
          staff_id: effectiveStaffOnly ? user?.id : planData.staff_id,
          department_id: targetDepartmentId,
          vacation_type_id: planData.vacation_type_id,
          total_days: planData.total_days,
          notes: planData.notes,
          created_by: user?.id,
          status: 'draft',
        })
        .select()
        .single();

      if (planError) throw planError;

      if (planData.splits.length > 0) {
        const { error: splitsError } = await supabase
          .from('vacation_splits')
          .insert(
            planData.splits.map((split: any) => ({
              vacation_plan_id: plan.id,
              ...split,
            }))
          );
        if (splitsError) throw splitsError;
      }

      return plan;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['vacation-plans'] });
      toast.success('Vacation plan created');
      resetForm();
    },
    onError: (error: any) => {
      console.error('Vacation plan creation error:', error);
      toast.error(error.message || 'Failed to create vacation plan');
    },
  });

  const addSplit = () => {
    if (splits.length >= maxSplits) {
      toast.error(`Maximum ${maxSplits} splits allowed`);
      return;
    }
    setSplits([
      ...splits,
      { start_date: new Date(), end_date: new Date(), days: 1 },
    ]);
  };

  const removeSplit = (index: number) => {
    setSplits(splits.filter((_, i) => i !== index));
  };

  const updateSplit = (index: number, field: keyof VacationSplit, value: any) => {
    const newSplits = [...splits];
    newSplits[index] = { ...newSplits[index], [field]: value };
    
    if (field === 'start_date' || field === 'end_date') {
      const start = new Date(newSplits[index].start_date);
      const end = new Date(newSplits[index].end_date);
      const diffTime = Math.abs(end.getTime() - start.getTime());
      const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
      newSplits[index].days = diffDays;
    }
    
    setSplits(newSplits);
  };

  const resetForm = () => {
    setSelectedStaff('');
    setSelectedVacationType('');
    setNotes('');
    setSplits([]);
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!effectiveStaffOnly && !selectedStaff) {
      toast.error('Please select staff member');
      return;
    }
    
    if (!selectedVacationType) {
      toast.error('Please select vacation type');
      return;
    }

    if (splits.length === 0) {
      toast.error('Please add at least one vacation period');
      return;
    }

    const totalDays = splits.reduce((sum, split) => sum + split.days, 0);

    createPlanMutation.mutate({
      staff_id: selectedStaff,
      vacation_type_id: selectedVacationType,
      total_days: totalDays,
      notes,
      splits: splits.map(split => ({
        start_date: format(split.start_date, 'yyyy-MM-dd'),
        end_date: format(split.end_date, 'yyyy-MM-dd'),
        days: split.days,
      })),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle>Create Vacation Plan</CardTitle>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          {!effectiveStaffOnly && (
            <div>
              <Label>Staff Member</Label>
              <Select value={selectedStaff} onValueChange={setSelectedStaff}>
                <SelectTrigger>
                  <SelectValue placeholder="Select staff" />
                </SelectTrigger>
                <SelectContent>
                  {departmentStaff?.map((staff: any) => (
                    <SelectItem key={staff.user_id} value={staff.user_id}>
                      {staff.profiles.full_name} ({staff.profiles.email})
                      {staff.role === 'department_head' && ' (Department Head)'}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <Label>Vacation Type</Label>
            <Select value={selectedVacationType} onValueChange={setSelectedVacationType}>
              <SelectTrigger>
                <SelectValue placeholder="Select type" />
              </SelectTrigger>
              <SelectContent>
                {vacationTypes?.map((type) => (
                  <SelectItem key={type.id} value={type.id}>
                    {type.name} {type.max_days && `(Max: ${type.max_days} days)`}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div>
            <div className="flex justify-between items-center mb-2">
              <Label>Vacation Splits (Up to 6)</Label>
              <Button type="button" size="sm" onClick={addSplit}>
                <Plus className="h-4 w-4 mr-1" />
                Add Split
              </Button>
            </div>
            <div className="space-y-4">
              {splits.map((split, index) => (
                <div key={index} className="border p-4 rounded-lg space-y-2">
                  <div className="flex justify-between items-center">
                    <span className="font-semibold">Split {index + 1}</span>
                    <Button
                      type="button"
                      size="sm"
                      variant="destructive"
                      onClick={() => removeSplit(index)}
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <Label>Start Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !split.start_date && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {split.start_date ? format(split.start_date, 'PPP') : 'Pick date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={split.start_date}
                            onSelect={(date) => date && updateSplit(index, 'start_date', date)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                    <div>
                      <Label>End Date</Label>
                      <Popover>
                        <PopoverTrigger asChild>
                          <Button
                            variant="outline"
                            className={cn(
                              'w-full justify-start text-left font-normal',
                              !split.end_date && 'text-muted-foreground'
                            )}
                          >
                            <CalendarIcon className="mr-2 h-4 w-4" />
                            {split.end_date ? format(split.end_date, 'PPP') : 'Pick date'}
                          </Button>
                        </PopoverTrigger>
                        <PopoverContent className="w-auto p-0">
                          <Calendar
                            mode="single"
                            selected={split.end_date}
                            onSelect={(date) => date && updateSplit(index, 'end_date', date)}
                          />
                        </PopoverContent>
                      </Popover>
                    </div>
                  </div>
                  <p className="text-sm text-muted-foreground">Days: {split.days}</p>
                </div>
              ))}
            </div>
          </div>

          <div>
            <Label>Notes</Label>
            <Textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Additional notes"
            />
          </div>

          <div className="flex gap-2">
            <Button type="submit" disabled={createPlanMutation.isPending}>
              Create Plan
            </Button>
            <Button type="button" variant="outline" onClick={resetForm}>
              Reset
            </Button>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default VacationPlanner;