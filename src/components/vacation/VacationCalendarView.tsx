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
import { CalendarDays } from 'lucide-react';
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
          <Calendar
            mode="single"
            selected={selectedDate}
            onSelect={setSelectedDate}
            numberOfMonths={2}
            className="rounded-md border-0 w-full"
            classNames={{
              months: "flex flex-col sm:flex-row space-y-4 sm:space-x-4 sm:space-y-0 w-full",
              month: "space-y-4 w-full",
              caption: "flex justify-center pt-1 relative items-center mb-4",
              caption_label: "text-lg font-semibold",
              nav: "space-x-1 flex items-center",
              nav_button: "h-9 w-9 bg-transparent p-0 opacity-50 hover:opacity-100 hover:bg-accent rounded-md",
              nav_button_previous: "absolute left-1",
              nav_button_next: "absolute right-1",
              table: "w-full border-collapse space-y-1",
              head_row: "flex w-full",
              head_cell: "text-muted-foreground rounded-md w-full font-medium text-sm flex-1 text-center",
              row: "flex w-full mt-2",
              cell: "relative p-0 text-center focus-within:relative focus-within:z-20 flex-1",
              day: "h-12 w-full p-0 font-normal text-base hover:bg-accent hover:text-accent-foreground rounded-md transition-colors",
              day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground",
              day_today: "bg-accent text-accent-foreground font-semibold",
              day_outside: "text-muted-foreground opacity-50",
              day_disabled: "text-muted-foreground opacity-50",
              day_hidden: "invisible",
            }}
            components={{
              Day: ({ date, ...props }) => {
                const vacationsOnDay = getVacationsForDate(date);
                const hasVacations = vacationsOnDay.length > 0;

                return (
                  <Popover>
                    <PopoverTrigger asChild>
                      <button
                        {...props}
                        className={cn(
                          "h-12 w-full p-0 font-normal hover:bg-accent rounded-md transition-all relative",
                          hasVacations && "bg-emerald-100 dark:bg-emerald-950 font-semibold border-2 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-900"
                        )}
                      >
                        <time dateTime={format(date, "yyyy-MM-dd")} className="text-base">
                          {format(date, "d")}
                        </time>
                        {hasVacations && (
                          <div className="absolute bottom-1 right-1 bg-emerald-600 dark:bg-emerald-500 text-white text-[10px] font-bold rounded-full h-5 w-5 flex items-center justify-center">
                            {vacationsOnDay.length}
                          </div>
                        )}
                      </button>
                    </PopoverTrigger>
                    {hasVacations && (
                      <PopoverContent className="w-96 p-4">
                        <div className="space-y-3">
                          <h4 className="font-semibold text-lg border-b pb-2">
                            {format(date, "MMMM d, yyyy")}
                          </h4>
                          <p className="text-sm text-muted-foreground">
                            {vacationsOnDay.length} staff member{vacationsOnDay.length > 1 ? 's' : ''} on vacation
                          </p>
                          <div className="space-y-2 max-h-96 overflow-y-auto">
                            {vacationsOnDay.map((vacation) => {
                              const split = vacation.vacation_splits?.find(s => {
                                const start = parseISO(s.start_date);
                                const end = parseISO(s.end_date);
                                return isWithinInterval(date, { start, end }) || isSameDay(date, start) || isSameDay(date, end);
                              });

                              return (
                                <div
                                  key={vacation.id}
                                  className="flex items-start gap-3 rounded-lg border bg-card p-3 hover:bg-accent/50 transition-colors"
                                >
                                  <div className="h-10 w-10 rounded-full bg-primary/10 flex items-center justify-center text-primary font-semibold flex-shrink-0">
                                    {vacation.profiles?.full_name?.charAt(0) || '?'}
                                  </div>
                                  <div className="flex-1 min-w-0">
                                    <p className="font-medium truncate">
                                      {vacation.profiles?.full_name || 'Unknown'}
                                    </p>
                                    <p className="text-sm text-muted-foreground">
                                      {vacation.departments?.name}
                                    </p>
                                    <div className="mt-1 flex items-center gap-1">
                                      <Badge variant="secondary" className="text-xs">
                                        {vacation.vacation_types?.name}
                                      </Badge>
                                    </div>
                                    {split && (
                                      <p className="text-xs text-muted-foreground mt-1">
                                        {format(parseISO(split.start_date), "MMM d")} - {format(parseISO(split.end_date), "MMM d")} ({split.days} days)
                                      </p>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>
                      </PopoverContent>
                    )}
                  </Popover>
                );
              },
            }}
          />
          <div className="mt-6 flex items-center gap-4 text-sm">
            <div className="flex items-center gap-2">
              <div className="h-6 w-6 rounded border-2 border-emerald-300 bg-emerald-100 dark:border-emerald-800 dark:bg-emerald-950" />
              <span className="text-muted-foreground">Days with approved vacations</span>
            </div>
            <div className="flex items-center gap-2">
              <div className="h-5 w-5 rounded-full bg-emerald-600 dark:bg-emerald-500 text-white text-[10px] font-bold flex items-center justify-center">
                #
              </div>
              <span className="text-muted-foreground">Number of staff</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Vacations List */}
      <Card>
        <CardHeader>
          <CardTitle className="text-2xl">Upcoming Vacations</CardTitle>
          <CardDescription>
            {timeFilter === 'all' 
              ? 'All upcoming approved vacations' 
              : `Approved vacations in the next ${timeFilter} days`}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingVacations.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">
                No upcoming approved vacations in this time range
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingVacations.map((item, index) => (
                <div
                  key={`${item.id}-${item.split.id}-${index}`}
                  className="flex flex-col rounded-lg border bg-card shadow-sm hover:shadow-md transition-all p-4 space-y-3"
                >
                  <div className="flex items-start gap-3">
                    <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
                      {item.profiles?.full_name?.charAt(0) || '?'}
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="font-semibold text-base truncate">
                        {item.profiles?.full_name || 'Unknown'}
                      </p>
                      <p className="text-sm text-muted-foreground truncate">
                        {item.departments?.name}
                      </p>
                    </div>
                  </div>
                  
                  <div className="space-y-2">
                    <Badge className="bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800">
                      ✓ Approved
                    </Badge>
                    <div className="flex items-center gap-2 text-sm">
                      <Badge variant="secondary">
                        {item.vacation_types?.name}
                      </Badge>
                    </div>
                  </div>

                  <div className="space-y-1 pt-2 border-t">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium">
                        {format(item.splitStartDate, "MMM d")} - {format(item.splitEndDate, "MMM d, yyyy")}
                      </p>
                      <Badge variant="outline" className="text-xs">
                        {item.split.days} day{item.split.days > 1 ? 's' : ''}
                      </Badge>
                    </div>
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
