import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { Calendar } from '@/components/ui/calendar';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { LoadingState } from '@/components/layout/LoadingState';
import { ErrorState } from '@/components/layout/ErrorState';
import { format, addDays, isWithinInterval, isSameDay, parseISO } from 'date-fns';
import { CalendarDays, User } from 'lucide-react';
import { cn } from '@/lib/utils';

interface VacationCalendarViewProps {
  departmentId?: string;
}

type TimeFilter = '30' | '60' | '90' | 'all';

export default function VacationCalendarView({ departmentId }: VacationCalendarViewProps) {
  const { user } = useAuth();
  const { data: roles } = useUserRole();
  const [selectedDate, setSelectedDate] = useState<Date | undefined>(new Date());
  const [timeFilter, setTimeFilter] = useState<TimeFilter>('30');

  // Determine user's role and scope
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
  const isWorkplaceSupervisor = roles?.some(r => r.role === 'workplace_supervisor');
  const isFacilitySupervisor = roles?.some(r => r.role === 'facility_supervisor');
  const isDepartmentHead = roles?.some(r => r.role === 'department_head');
  const userDepartmentId = roles?.find(r => r.department_id)?.department_id;
  const userFacilityId = roles?.find(r => r.facility_id)?.facility_id;
  const userWorkspaceId = roles?.find(r => r.workspace_id)?.workspace_id;

  // Fetch approved vacations based on role
  const { data: vacations, isLoading, error, refetch } = useQuery({
    queryKey: ['approved-vacations', user?.id, userDepartmentId, userFacilityId, userWorkspaceId, timeFilter],
    queryFn: async () => {
      let query = supabase
        .from('vacation_plans')
        .select(`
          id,
          staff_id,
          vacation_type_id,
          status,
          total_days,
          profiles!vacation_plans_staff_id_fkey(id, full_name, email),
          departments!vacation_plans_department_id_fkey(id, name, facility_id),
          vacation_types(id, name),
          vacation_splits(id, start_date, end_date, days, status)
        `)
        .eq('status', 'approved');

      // Apply role-based filtering
      if (isSuperAdmin) {
        // Super admin sees all
      } else if (isWorkplaceSupervisor && userWorkspaceId) {
        // Workspace supervisor sees all in their workspace
        const { data: facilities } = await supabase
          .from('facilities')
          .select('id')
          .eq('workspace_id', userWorkspaceId);
        
        if (facilities && facilities.length > 0) {
          const facilityIds = facilities.map(f => f.id);
          query = query.in('departments.facility_id', facilityIds);
        }
      } else if (isFacilitySupervisor && userFacilityId) {
        // Facility supervisor sees all in their facility
        query = query.eq('departments.facility_id', userFacilityId);
      } else if (isDepartmentHead && userDepartmentId) {
        // Department head sees their department
        query = query.eq('department_id', userDepartmentId);
      } else {
        // Staff sees own + approved in department
        query = query.or(`staff_id.eq.${user?.id},department_id.eq.${userDepartmentId}`);
      }

      const { data, error } = await query;
      if (error) throw error;

      return data || [];
    },
    enabled: !!user && !!roles,
  });

  // Calculate date range based on filter
  const getDateRange = () => {
    const today = new Date();
    switch (timeFilter) {
      case '30':
        return { start: today, end: addDays(today, 30) };
      case '60':
        return { start: today, end: addDays(today, 60) };
      case '90':
        return { start: today, end: addDays(today, 90) };
      default:
        return null;
    }
  };

  // Get vacations for a specific date
  const getVacationsForDate = (date: Date) => {
    if (!vacations) return [];
    
    return vacations.filter(vacation => {
      return vacation.vacation_splits?.some(split => {
        if (split.status !== 'approved') return false;
        const start = parseISO(split.start_date);
        const end = parseISO(split.end_date);
        return isWithinInterval(date, { start, end }) || isSameDay(date, start) || isSameDay(date, end);
      });
    });
  };

  // Get upcoming vacations filtered by time range
  const getUpcomingVacations = () => {
    if (!vacations) return [];
    
    const dateRange = getDateRange();
    const today = new Date();
    
    return vacations
      .flatMap(vacation => {
        return vacation.vacation_splits
          ?.filter(split => split.status === 'approved')
          .map(split => ({
            ...vacation,
            split,
            splitStartDate: parseISO(split.start_date),
            splitEndDate: parseISO(split.end_date),
          })) || [];
      })
      .filter(item => {
        const isUpcoming = item.splitStartDate >= today;
        if (!dateRange) return isUpcoming;
        return isUpcoming && isWithinInterval(item.splitStartDate, dateRange);
      })
      .sort((a, b) => a.splitStartDate.getTime() - b.splitStartDate.getTime());
  };

  // Custom day content with vacation indicators
  const renderDay = (date: Date) => {
    const vacationsOnDay = getVacationsForDate(date);
    const count = vacationsOnDay.length;

    return (
      <div className="relative w-full h-full flex items-center justify-center">
        <span>{format(date, 'd')}</span>
        {count > 0 && (
          <div className="absolute -bottom-1 left-1/2 -translate-x-1/2">
            <div className="w-1.5 h-1.5 rounded-full bg-success" />
          </div>
        )}
      </div>
    );
  };

  if (isLoading) {
    return <LoadingState message="Loading calendar..." />;
  }

  if (error) {
    return (
      <ErrorState
        title="Failed to load calendar"
        message={error instanceof Error ? error.message : 'An error occurred'}
        onRetry={refetch}
      />
    );
  }

  const upcomingVacations = getUpcomingVacations();

  return (
    <div className="space-y-6">
      {/* Header with Time Filters */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <CalendarDays className="h-5 w-5" />
                Vacation Calendar
              </CardTitle>
              <CardDescription>
                Showing approved vacations only
              </CardDescription>
            </div>
            <div className="flex gap-2">
              <Button
                variant={timeFilter === '30' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('30')}
              >
                Next 30 Days
              </Button>
              <Button
                variant={timeFilter === '60' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('60')}
              >
                Next 60 Days
              </Button>
              <Button
                variant={timeFilter === '90' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('90')}
              >
                Next 90 Days
              </Button>
              <Button
                variant={timeFilter === 'all' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setTimeFilter('all')}
              >
                All Approved
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex justify-center">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              className="rounded-md border"
              modifiers={{
                hasVacation: (date) => getVacationsForDate(date).length > 0,
              }}
              modifiersClassNames={{
                hasVacation: 'bg-success/10 font-semibold',
              }}
              components={{
                Day: ({ date }) => {
                  const vacationsOnDay = getVacationsForDate(date);
                  const count = vacationsOnDay.length;

                  if (count === 0) {
                    return <div className="h-9 w-9 p-0 flex items-center justify-center">{format(date, 'd')}</div>;
                  }

                  return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button className="h-9 w-9 p-0 flex items-center justify-center relative hover:bg-accent rounded-md">
                          <span>{format(date, 'd')}</span>
                          {count > 0 && (
                            <Badge
                              variant="default"
                              className="absolute -top-1 -right-1 h-4 w-4 p-0 flex items-center justify-center text-[10px] bg-success"
                            >
                              {count}
                            </Badge>
                          )}
                        </button>
                      </PopoverTrigger>
                      <PopoverContent className="w-80">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-sm">
                            {format(date, 'MMMM d, yyyy')} - {count} staff on vacation
                          </h4>
                          <div className="space-y-2">
                            {vacationsOnDay.map(vacation => {
                              const split = vacation.vacation_splits?.find(s => {
                                const start = parseISO(s.start_date);
                                const end = parseISO(s.end_date);
                                return isWithinInterval(date, { start, end }) || isSameDay(date, start) || isSameDay(date, end);
                              });

                              return (
                                <div key={vacation.id} className="flex items-start gap-2 text-sm p-2 rounded-md bg-muted/50">
                                  <User className="h-4 w-4 mt-0.5 text-muted-foreground" />
                                  <div className="flex-1 min-w-0">
                                    <div className="font-medium">{vacation.profiles?.full_name}</div>
                                    <div className="text-xs text-muted-foreground truncate">
                                      {vacation.vacation_types?.name}
                                    </div>
                                    {split && (
                                      <div className="text-xs text-muted-foreground mt-1">
                                        {format(parseISO(split.start_date), 'MMM d')} - {format(parseISO(split.end_date), 'MMM d')} ({split.days} days)
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </PopoverContent>
                    </Popover>
                  );
                },
              }}
            />
          </div>

          {/* Legend */}
          <div className="flex items-center justify-center gap-4 mt-4 text-sm text-muted-foreground">
            <div className="flex items-center gap-2">
              <div className="w-3 h-3 rounded-full bg-success" />
              <span>Staff on vacation</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Vacations List */}
      <Card>
        <CardHeader>
          <CardTitle>Upcoming Vacations</CardTitle>
          <CardDescription>
            {timeFilter === 'all' 
              ? 'All upcoming approved vacations' 
              : `Approved vacations in the next ${timeFilter} days`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingVacations.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground">
              No upcoming approved vacations in this time range
            </div>
          ) : (
            <div className="space-y-3">
              {upcomingVacations.map((item, index) => (
                <div
                  key={`${item.id}-${item.split.id}-${index}`}
                  className="flex items-center justify-between p-4 rounded-lg border bg-card hover:bg-accent/50 transition-colors"
                >
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <User className="h-4 w-4 text-muted-foreground flex-shrink-0" />
                      <span className="font-semibold truncate">{item.profiles?.full_name}</span>
                    </div>
                    <div className="text-sm text-muted-foreground">
                      {item.departments?.name}
                    </div>
                    <div className="text-sm text-muted-foreground mt-1">
                      {item.vacation_types?.name}
                    </div>
                  </div>
                  <div className="text-right flex-shrink-0 ml-4">
                    <div className="font-medium text-sm">
                      {format(item.splitStartDate, 'MMM d, yyyy')}
                    </div>
                    <div className="text-sm text-muted-foreground">
                      to {format(item.splitEndDate, 'MMM d, yyyy')}
                    </div>
                    <Badge variant="secondary" className="mt-1">
                      {item.split.days} days
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
