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
  const [statusFilter, setStatusFilter] = useState<'approved' | 'pending' | 'all'>('all');

  // Determine user's role and scope
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
  const isWorkplaceSupervisor = roles?.some(r => r.role === 'workplace_supervisor');
  const isFacilitySupervisor = roles?.some(r => r.role === 'facility_supervisor');
  const isDepartmentHead = roles?.some(r => r.role === 'department_head');
  const userDepartmentId = roles?.find(r => r.department_id)?.department_id;
  const userFacilityId = roles?.find(r => r.facility_id)?.facility_id;
  const userWorkspaceId = roles?.find(r => r.workspace_id)?.workspace_id;

  // Fetch vacations based on role and status filter
  const { data: vacations, isLoading, error, refetch } = useQuery({
    queryKey: ['vacations', user?.id, userDepartmentId, userFacilityId, userWorkspaceId, roles, timeFilter, statusFilter],
    queryFn: async () => {
      // Find the specific role records for scope detection
      const workplaceRole = roles?.find(r => r.role === 'workplace_supervisor');
      const facilityRole = roles?.find(r => r.role === 'facility_supervisor');
      const deptHeadRole = roles?.find(r => r.role === 'department_head');

      const effectiveWorkspaceId = userWorkspaceId || workplaceRole?.workspace_id;
      const effectiveFacilityId = userFacilityId || facilityRole?.facility_id;
      const effectiveDeptId = userDepartmentId || deptHeadRole?.department_id;

      let query = supabase
        .from('vacation_plans')
        .select(`
          id,
          staff_id,
          department_id,
          vacation_type_id,
          status,
          total_days,
          profiles!vacation_plans_staff_id_fkey(id, full_name, email),
          departments!vacation_plans_department_id_fkey(
            id, 
            name, 
            facility_id,
            facilities(name)
          ),
          vacation_types(id, name),
          vacation_splits(id, start_date, end_date, days)
        `);

      // Apply status filter - ensure 'pending_approval' is included
      if (statusFilter === 'approved') {
        query = query.eq('status', 'approved');
      } else if (statusFilter === 'pending') {
        query = query.in('status', ['pending_approval', 'department_pending', 'facility_pending', 'workspace_pending']);
      } else {
        // 'all' - show all relevant statuses
        query = query.in('status', ['draft', 'pending_approval', 'approved', 'department_pending', 'facility_pending', 'workspace_pending']);
      }

      // Apply role-based filtering
      if (isSuperAdmin) {
        // Super admin sees all, no additional filters
      } else if (isWorkplaceSupervisor && effectiveWorkspaceId) {
        // Workplace supervisor sees all departments in the workspace - get facility IDs first
        const { data: facilities } = await supabase
          .from('facilities')
          .select('id')
          .eq('workspace_id', effectiveWorkspaceId);

        const facilityIds = facilities?.map(f => f.id) || [];

        const { data: depts } = await supabase
          .from('departments')
          .select('id')
          .in('facility_id', facilityIds);

        if (depts && depts.length > 0) {
          query = query.in('department_id', depts.map(d => d.id));
        } else {
          query = query.eq('staff_id', user?.id);
        }
      } else if (isFacilitySupervisor && effectiveFacilityId) {
        // Facility supervisor sees all departments in their facility
        const { data: depts } = await supabase
          .from('departments')
          .select('id')
          .eq('facility_id', effectiveFacilityId);

        if (depts && depts.length > 0) {
          query = query.in('department_id', depts.map(d => d.id));
        } else {
          query = query.eq('staff_id', user?.id);
        }
      } else if (isDepartmentHead && effectiveDeptId) {
        // Department head sees their department
        query = query.eq('department_id', effectiveDeptId);
      } else {
        // Staff sees own + approved in department
        const staffFilters = [`staff_id.eq.${user?.id}`];
        if (effectiveDeptId) staffFilters.push(`department_id.eq.${effectiveDeptId}`);
        query = query.or(staffFilters.join(','));
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
        const start = parseISO(split.start_date);
        const end = parseISO(split.end_date);
        return isWithinInterval(date, { start, end }) || isSameDay(date, start) || isSameDay(date, end);
      });
    });
  };

  // Determine color for days with vacations
  const getVacationStatusColor = (vacationsOnDay: any[]) => {
    const hasApproved = vacationsOnDay.some(v => v.status === 'approved');
    const hasPending = vacationsOnDay.some(v => ['pending_approval', 'department_pending', 'facility_pending', 'workspace_pending'].includes(v.status));

    if (hasApproved && hasPending) {
      return 'bg-purple-100 dark:bg-purple-950 border-purple-300 dark:border-purple-800 hover:bg-purple-200 dark:hover:bg-purple-900';
    }
    if (hasApproved) {
      return 'bg-emerald-100 dark:bg-emerald-950 border-emerald-300 dark:border-emerald-800 hover:bg-emerald-200 dark:hover:bg-emerald-900';
    }
    if (hasPending) {
      return 'bg-amber-100 dark:bg-amber-950 border-amber-300 dark:border-amber-800 hover:bg-amber-200 dark:hover:bg-amber-900';
    }
    return '';
  };

  // Get upcoming vacations filtered by time range
  const getUpcomingVacations = () => {
    if (!vacations) return [];

    const dateRange = getDateRange();
    const today = new Date();

    return vacations
      .flatMap(vacation => {
        return vacation.vacation_splits
          ?.map(split => ({
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
    <div className="space-y-4 sm:space-y-6">
      <Card className="border-2">
        <CardHeader className="space-y-3 sm:space-y-4 px-4 sm:px-6">
          <div className="flex items-center gap-2">
            <CalendarDays className="h-5 w-5 sm:h-6 sm:w-6 text-primary shrink-0" />
            <div className="min-w-0">
              <CardTitle className="text-xl sm:text-2xl">Vacation Calendar</CardTitle>
              <CardDescription className="mt-1 text-sm">
                {statusFilter === 'approved' ? 'Approved only' :
                  statusFilter === 'pending' ? 'Pending only' :
                    'All vacations'}
              </CardDescription>
            </div>
          </div>

          {/* Filter Controls */}
          <div className="flex flex-col gap-3 pt-2">
            {/* Status Filters Row */}
            <div className="flex flex-col xs:flex-row xs:items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground shrink-0">Status:</span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                <Button
                  variant={statusFilter === 'approved' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('approved')}
                  className="min-h-[40px] px-3 text-xs sm:text-sm"
                >
                  Approved
                </Button>
                <Button
                  variant={statusFilter === 'pending' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('pending')}
                  className="min-h-[40px] px-3 text-xs sm:text-sm"
                >
                  Pending
                </Button>
                <Button
                  variant={statusFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setStatusFilter('all')}
                  className="min-h-[40px] px-3 text-xs sm:text-sm"
                >
                  All
                </Button>
              </div>
            </div>

            {/* Time Range Filters Row */}
            <div className="flex flex-col xs:flex-row xs:items-center gap-2">
              <span className="text-sm font-medium text-muted-foreground shrink-0">Range:</span>
              <div className="flex flex-wrap gap-1.5 sm:gap-2">
                <Button
                  variant={timeFilter === '30' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeFilter('30')}
                  className="min-h-[40px] px-2 sm:px-3 text-xs sm:text-sm"
                >
                  30d
                </Button>
                <Button
                  variant={timeFilter === '60' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeFilter('60')}
                  className="min-h-[40px] px-2 sm:px-3 text-xs sm:text-sm"
                >
                  60d
                </Button>
                <Button
                  variant={timeFilter === '90' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeFilter('90')}
                  className="min-h-[40px] px-2 sm:px-3 text-xs sm:text-sm"
                >
                  90d
                </Button>
                <Button
                  variant={timeFilter === 'all' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setTimeFilter('all')}
                  className="min-h-[40px] px-2 sm:px-3 text-xs sm:text-sm"
                >
                  All
                </Button>
              </div>
            </div>
          </div>
        </CardHeader>
        <CardContent className="p-3 sm:p-6 overflow-x-auto">
          <div className="min-w-[320px]">
            <Calendar
              mode="single"
              selected={selectedDate}
              onSelect={setSelectedDate}
              numberOfMonths={1}
              className="rounded-md w-full pointer-events-auto"
              classNames={{
                months: "flex flex-col gap-4 sm:gap-8 w-full justify-center",
                month: "space-y-4 flex-1",
                caption: "flex justify-center pt-1 relative items-center mb-4 sm:mb-8",
                caption_label: "text-lg sm:text-2xl font-bold tracking-tight",
                nav: "flex items-center",
                nav_button: "h-10 w-10 bg-transparent p-0 opacity-60 hover:opacity-100 hover:bg-accent rounded-xl transition-all flex items-center justify-center z-20",
                nav_button_previous: "absolute left-0 top-1/2 -translate-y-1/2",
                nav_button_next: "absolute right-0 top-1/2 -translate-y-1/2",
                table: "w-full border-collapse",
                head_row: "flex w-full mb-4",
                head_cell: "text-muted-foreground/60 rounded-md font-bold text-[0.65rem] sm:text-xs uppercase tracking-widest flex-1 text-center",
                row: "flex w-full mt-2",
                cell: "relative p-0.5 text-center focus-within:relative focus-within:z-20 flex-1 h-10 sm:h-16",
                day: "h-full w-full p-0 font-normal hover:bg-accent/50 rounded-xl transition-all touch-manipulation",
                day_selected: "bg-primary text-primary-foreground hover:bg-primary hover:text-primary-foreground shadow-lg shadow-primary/20",
                day_today: "bg-accent/30 text-accent-foreground font-bold ring-2 ring-primary/20 ring-offset-2",
                day_outside: "text-muted-foreground opacity-20",
                day_disabled: "text-muted-foreground opacity-20",
                day_hidden: "invisible",
              }}
              components={{
                Day: ({ date, displayMonth, ...props }) => {
                  const vacationsOnDay = getVacationsForDate(date);
                  const hasVacations = vacationsOnDay.length > 0;

                  return (
                    <Popover>
                      <PopoverTrigger asChild>
                        <button
                          {...props}
                          className={cn(
                            "h-full w-full p-2 font-normal hover:bg-accent/50 rounded-xl transition-all relative group touch-manipulation flex flex-col items-center justify-center gap-1 overflow-hidden",
                            hasVacations && `font-bold border-2 ${getVacationStatusColor(vacationsOnDay)}`,
                            !hasVacations && "border border-transparent"
                          )}
                        >
                          <time
                            dateTime={format(date, "yyyy-MM-dd")}
                            className={cn(
                              "text-sm sm:text-lg font-medium transition-colors w-full text-center",
                              isSameDay(date, new Date()) ? "text-primary font-bold" : "text-foreground/70"
                            )}
                          >
                            {format(date, "d")}
                          </time>

                          {hasVacations && (
                            <div className="w-full flex items-center justify-between">
                              <div className={cn(
                                "text-white text-[9px] sm:text-[10px] font-black rounded-lg px-1.5 py-0.5 flex items-center justify-center shadow-md z-10 border border-white/10",
                                vacationsOnDay.some(v => v.status === 'approved') ? "bg-emerald-500" : "bg-amber-500"
                              )}>
                                {vacationsOnDay.length}
                              </div>

                              <div className="flex -space-x-1.5 overflow-hidden">
                                {vacationsOnDay.slice(0, 3).map((v, idx) => (
                                  <div
                                    key={idx}
                                    className={cn(
                                      "h-2 w-2 sm:h-3 sm:w-3 rounded-full border-2 border-background shadow-sm",
                                      v.status === 'approved' ? "bg-emerald-400" : "bg-amber-400"
                                    )}
                                  />
                                ))}
                              </div>
                            </div>
                          )}
                        </button>
                      </PopoverTrigger>
                      {hasVacations && (
                        <PopoverContent className="w-[calc(100vw-2rem)] sm:w-96 p-3 sm:p-4 max-h-[60vh] overflow-y-auto" side="bottom" align="center">
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
                                      <p className="text-xs font-semibold text-primary/80">
                                        {vacation.departments?.facilities?.name && `${vacation.departments.facilities.name} - `}
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
          </div>

          {/* Legend */}
          <div className="mt-8 pt-6 border-t">
            <h4 className="text-sm font-semibold mb-4">Legend</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md border-2 border-success bg-success/10 flex-shrink-0" />
                <span className="text-sm font-medium">Approved Vacation</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md border-2 border-warning bg-warning/10 flex-shrink-0" />
                <span className="text-sm font-medium">Pending Vacation</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-8 w-8 rounded-md border-2 border-accent bg-accent/10 flex-shrink-0" />
                <span className="text-sm font-medium">Mixed Status</span>
              </div>
              <div className="flex items-center gap-3">
                <div className="h-6 w-6 rounded-full bg-success text-success-foreground text-[11px] font-bold flex items-center justify-center shadow-md flex-shrink-0">
                  3
                </div>
                <span className="text-sm font-medium">Staff Count</span>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Upcoming Vacations List */}
      <Card className="border-2">
        <CardHeader>
          <CardTitle className="text-2xl">Upcoming Vacations</CardTitle>
          <CardDescription>
            {statusFilter === 'approved'
              ? (timeFilter === 'all' ? 'All upcoming approved vacations' : `Approved vacations in the next ${timeFilter} days`)
              : statusFilter === 'pending'
                ? (timeFilter === 'all' ? 'All upcoming pending vacations' : `Pending vacations in the next ${timeFilter} days`)
                : (timeFilter === 'all' ? 'All upcoming vacations' : `All vacations in the next ${timeFilter} days`)}
          </CardDescription>
        </CardHeader>
        <CardContent>
          {upcomingVacations.length === 0 ? (
            <div className="text-center py-12">
              <p className="text-muted-foreground text-lg">
                {statusFilter === 'approved'
                  ? 'No upcoming approved vacations in this time range'
                  : statusFilter === 'pending'
                    ? 'No upcoming pending vacations in this time range'
                    : 'No upcoming vacations in this time range'}
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {upcomingVacations.map((item, index) => {
                const isApproved = item.status === 'approved';
                const isPending = ['pending_approval', 'department_pending', 'facility_pending', 'workspace_pending'].includes(item.status);

                return (
                  <div
                    key={`${item.id}-${item.split.id}-${index}`}
                    className={cn(
                      "flex flex-col rounded-lg border shadow-sm hover:shadow-md transition-all p-4 space-y-3",
                      isApproved && "bg-emerald-50/50 dark:bg-emerald-950/30 border-emerald-200 dark:border-emerald-800",
                      isPending && "bg-amber-50/50 dark:bg-amber-950/30 border-amber-200 dark:border-amber-800"
                    )}
                  >
                    <div className="flex items-start gap-3">
                      <div className="h-12 w-12 rounded-full bg-primary/10 flex items-center justify-center text-primary font-bold text-lg flex-shrink-0">
                        {item.profiles?.full_name?.charAt(0) || '?'}
                      </div>
                      <div className="flex-1 min-w-0">
                        <p className="font-semibold text-base truncate">
                          {item.profiles?.full_name || 'Unknown'}
                        </p>
                        <p className="text-xs font-semibold text-primary/80 truncate">
                          {item.departments?.facilities?.name && `${item.departments.facilities.name} - `}
                          {item.departments?.name}
                        </p>
                      </div>
                    </div>

                    <div className="space-y-2">
                      <Badge className={cn(
                        isApproved && "bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-400 dark:border-emerald-800",
                        item.status === 'pending_approval' && "bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-400 dark:border-blue-800",
                        item.status === 'department_pending' && "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800",
                        item.status === 'facility_pending' && "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800",
                        item.status === 'workspace_pending' && "bg-amber-100 text-amber-700 border-amber-200 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-400 dark:border-amber-800"
                      )}>
                        {isApproved ? '✓ Approved' :
                          item.status === 'pending_approval' ? '⏳ Request Sent' :
                            item.status === 'department_pending' ? '⏳ Dept. Pending' :
                              item.status === 'facility_pending' ? '⏳ Facility Pending' :
                                item.status === 'workspace_pending' ? '⏳ Workspace Pending' :
                                  item.status}
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
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
