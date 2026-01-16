import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { useUserRole } from "@/hooks/useUserRole";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, PieChart, Pie, Cell, LineChart, Line, Legend, AreaChart, Area } from "recharts";
import { TrendingUp, Users, Building2, Calendar as CalendarIcon, Clock, Activity, Briefcase, GraduationCap, Filter } from "lucide-react";
import { format, subDays, eachDayOfInterval, startOfDay, endOfDay, subWeeks, subMonths } from "date-fns";
import { DateRange } from "react-day-picker";
import { cn } from "@/lib/utils";
import { motion, AnimatePresence } from "framer-motion";

type DateFilterType = '1day' | '1week' | '1month' | 'custom';

// Animation Variants
const containerVariants = {
  hidden: { opacity: 0 },
  visible: {
    opacity: 1,
    transition: {
      staggerChildren: 0.1
    }
  }
};

const itemVariants = {
  hidden: { y: 20, opacity: 0 },
  visible: {
    y: 0,
    opacity: 1,
    transition: {
      type: "spring" as const,
      stiffness: 100,
      damping: 15
    }
  }
};

interface AnalyticsDashboardProps {
  organizationId?: string;
}

export function AnalyticsDashboard({ organizationId }: AnalyticsDashboardProps = {}) {
  const { data: roles } = useUserRole();
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');

  // Filter State
  const [dateFilter, setDateFilter] = useState<DateFilterType>('1month');
  const [dateRange, setDateRange] = useState<DateRange | undefined>({
    from: subDays(new Date(), 30),
    to: new Date(),
  });
  const [selectedFacilityId, setSelectedFacilityId] = useState<string>('all');

  // Handle Date Filter Change
  const handleDateFilterChange = (val: DateFilterType) => {
    setDateFilter(val);
    const today = new Date();
    if (val === '1day') {
      setDateRange({ from: subDays(today, 1), to: today });
    } else if (val === '1week') {
      setDateRange({ from: subDays(today, 7), to: today });
    } else if (val === '1month') {
      setDateRange({ from: subDays(today, 30), to: today });
    }
  };

  // Fetch Facilities (Super Admin or Org Admin)
  const { data: facilities } = useQuery({
    queryKey: ['admin-facilities-list', organizationId],
    queryFn: async () => {
      let query = supabase.from('facilities').select('id, name');

      if (organizationId) {
        // Facilities don't have organization_id directly, need to join with workspaces
        const { data: workspaces } = await supabase
          .from('workspaces')
          .select('id')
          .eq('organization_id', organizationId);

        const workspaceIds = workspaces?.map(w => w.id) || [];
        if (workspaceIds.length === 0) return [];

        query = query.in('workspace_id', workspaceIds);
      }

      const { data, error } = await query.order('name');
      if (error) throw error;
      return data;
    },
    enabled: isSuperAdmin || !!organizationId,
  });

  // User growth data
  const { data: userGrowth } = useQuery({
    queryKey: ['user-growth', dateRange?.from, dateRange?.to, selectedFacilityId, organizationId],
    queryFn: async () => {
      let query: any;

      if (selectedFacilityId !== 'all') {
        query = supabase.from('user_roles').select('created_at').eq('facility_id', selectedFacilityId);
      } else if (organizationId) {
        query = (supabase.from('user_roles') as any).select('created_at').eq('organization_id', organizationId);
      } else {
        query = supabase.from('profiles').select('created_at');
      }

      query = (query as any).order('created_at', { ascending: true });

      if (dateRange?.from) {
        query = query.gte('created_at', startOfDay(dateRange.from).toISOString());
      }
      if (dateRange?.to) {
        query = query.lte('created_at', endOfDay(dateRange.to).toISOString());
      }

      const { data, error } = await query;
      if (error) throw error;

      // Group by date
      if (!dateRange?.from || !dateRange?.to) return [];

      const interval = eachDayOfInterval({
        start: dateRange.from,
        end: dateRange.to,
      });

      const dailyCounts = interval.map(date => {
        const dayStart = startOfDay(date);
        const count = data.filter((u: any) => {
          const userDate = startOfDay(new Date(u.created_at));
          return userDate <= dayStart;
        }).length;

        return {
          date: format(date, 'MMM d'),
          users: count,
        };
      });

      return dailyCounts;
    },
    enabled: !!dateRange?.from && !!dateRange?.to,
  });

  // Role distribution
  const { data: roleDistribution } = useQuery({
    queryKey: ['role-distribution-chart', selectedFacilityId],
    queryFn: async () => {
      let query: any = supabase
        .from('user_roles')
        .select('role');

      if (selectedFacilityId !== 'all') {
        query = (query as any).eq('facility_id', selectedFacilityId);
      } else if (organizationId) {
        query = (query as any).eq('organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;

      const counts: Record<string, number> = {};
      data.forEach(r => {
        counts[r.role] = (counts[r.role] || 0) + 1;
      });

      const roleLabels: Record<string, string> = {
        super_admin: 'Super Admin',
        organization_admin: 'Org Admin',
        general_admin: 'General Admin',
        workplace_supervisor: 'Workplace Supervisor',
        facility_supervisor: 'Facility Supervisor',
        department_head: 'Dept Head',
        staff: 'Staff',
      };

      return Object.entries(counts).map(([role, count]) => ({
        name: roleLabels[role] || role,
        value: count,
        role,
      }));
    },
  });

  // Module usage stats
  const { data: moduleUsage } = useQuery({
    queryKey: ['module-usage'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('module_definitions')
        .select(`
          id,
          name,
          key,
          role_module_access (
            role,
            can_view
          )
        `);
      if (error) throw error;

      return data.map(m => ({
        name: m.name,
        roles: m.role_module_access?.filter(r => r.can_view).length || 0,
      })).sort((a, b) => b.roles - a.roles);
    },
  });

  // Entity counts
  const { data: entityCounts } = useQuery({
    queryKey: ['entity-counts'],
    queryFn: async () => {
      let workspaceIds: string[] = [];
      if (organizationId) {
        const { data: ws } = await supabase.from('workspaces').select('id').eq('organization_id', organizationId);
        workspaceIds = ws?.map(w => w.id) || [];
      }

      const counts = await Promise.all([
        organizationId
          ? Promise.resolve({ count: 1, error: null })
          : supabase.from('organizations').select('id', { count: 'exact', head: true }),
        organizationId
          ? (supabase.from('workspaces') as any).select('id', { count: 'exact', head: true }).eq('organization_id', organizationId)
          : supabase.from('workspaces').select('id', { count: 'exact', head: true }),
        organizationId
          ? (supabase.from('facilities') as any).select('id', { count: 'exact', head: true }).in('workspace_id', workspaceIds)
          : supabase.from('facilities').select('id', { count: 'exact', head: true }),
        organizationId
          ? (supabase.from('departments') as any).select('id', { count: 'exact', head: true }).in('workspace_id', workspaceIds)
          : supabase.from('departments').select('id', { count: 'exact', head: true }),
        organizationId
          ? (supabase.from('tasks') as any).select('id', { count: 'exact', head: true }).in('workspace_id', workspaceIds)
          : supabase.from('tasks').select('id', { count: 'exact', head: true }),
        organizationId
          ? (supabase.from('schedules') as any).select('id', { count: 'exact', head: true }).in('workspace_id', workspaceIds)
          : supabase.from('schedules').select('id', { count: 'exact', head: true }),
        organizationId
          ? (supabase.from('vacation_plans') as any).select('id', { count: 'exact', head: true }).in('workspace_id', workspaceIds)
          : supabase.from('vacation_plans').select('id', { count: 'exact', head: true }),
        organizationId
          ? (supabase.from('training_events') as any).select('id', { count: 'exact', head: true }).in('workspace_id', workspaceIds)
          : supabase.from('training_events').select('id', { count: 'exact', head: true }),
      ]) as any[];

      const [orgs, workspaces, facilities, departments, tasks, schedules, vacations, trainings] = counts;

      return [
        { name: 'Organizations', count: orgs.count || 0, icon: Building2, color: 'hsl(var(--primary))' },
        { name: 'Workspaces', count: workspaces.count || 0, icon: Briefcase, color: 'hsl(262, 83%, 58%)' },
        { name: 'Facilities', count: facilities.count || 0, icon: Building2, color: 'hsl(199, 89%, 48%)' },
        { name: 'Departments', count: departments.count || 0, icon: Users, color: 'hsl(142, 71%, 45%)' },
        { name: 'Tasks', count: tasks.count || 0, icon: Activity, color: 'hsl(38, 92%, 50%)' },
        { name: 'Schedules', count: schedules.count || 0, icon: CalendarIcon, color: 'hsl(326, 100%, 74%)' },
        { name: 'Vacation Plans', count: vacations.count || 0, icon: Clock, color: 'hsl(280, 67%, 51%)' },
        { name: 'Training Events', count: trainings.count || 0, icon: GraduationCap, color: 'hsl(173, 58%, 39%)' },
      ];
    },
  });

  // Activity by day of week
  const { data: activityByDay } = useQuery({
    queryKey: ['activity-by-day', dateRange?.from, dateRange?.to, organizationId],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('performed_at');

      if (dateRange?.from) {
        query = (query as any).gte('performed_at', startOfDay(dateRange.from).toISOString());
      }
      if (dateRange?.to) {
        query = (query as any).lte('performed_at', endOfDay(dateRange.to).toISOString());
      } else {
        query = (query as any).gte('performed_at', subDays(new Date(), 30).toISOString());
      }

      // Filter by organization if provided (via performed_by user or explicit column if exists)
      // Audit logs might not have organization_id. Skipping strict org filter for audit logs for now or checking if table has it.
      // Assuming for now we show all or basic.
      // If we want to filter by org, we'd need to join with profiles/users.
      // Simplified: if organizationId is present, try to filter if column exists, else leave as is (Global/System logs might be visible to Org Admin? Probably not ideal but safer than breaking).
      // Actually, let's leave audit logs scoping for a separate task if schema verification is needed.
      // BUT, user asked for "analytics tab show only for that organization".
      // Let's try to filter by joining with profiles if possible.
      // Supabase join syntax: select('performed_at, profiles!inner(organization_id)') ...
      // But query is on audit_logs.

      if (organizationId) {
        // This assumes audit_logs has organization_id or using performed_by lookup which is expensive here. 
        // Let's skip deep filtering here to avoid breaking it without schema knowledge, 
        // but we can limit to current user's actions if we wanted, but Org Admin wants to see org actions.
        // Let's try adding an empty check if we can't filter, or just proceed.
        // Better to leave it as "Global" for this specific chart if schema is unknown, 
        // OR query users first.

        // Let's fetching org users first
        const { data: orgUsers } = await (supabase.from('user_roles') as any).select('user_id').eq('organization_id', organizationId);
        const userIds = orgUsers?.map(u => u.user_id) || [];
        if (userIds.length > 0) {
          query = (query as any).in('performed_by', userIds);
        } else {
          return [];
        }
      }

      const { data, error } = await query;
      if (error) throw error;

      const days = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
      const counts = new Array(7).fill(0);

      data.forEach(log => {
        if (log.performed_at) {
          const dayIndex = new Date(log.performed_at).getDay();
          counts[dayIndex]++;
        }
      });

      return days.map((day, i) => ({
        day,
        events: counts[i],
      }));
    },
    enabled: !!dateRange?.from,
  });

  const COLORS = ['hsl(262, 83%, 58%)', 'hsl(199, 89%, 48%)', 'hsl(142, 71%, 45%)', 'hsl(38, 92%, 50%)', 'hsl(326, 100%, 74%)', 'hsl(280, 67%, 51%)', 'hsl(173, 58%, 39%)'];

  return (
    <motion.div
      initial="hidden"
      animate="visible"
      variants={containerVariants}
      className="space-y-6"
    >
      {/* Controls */}
      <motion.div variants={itemVariants} className="flex flex-col sm:flex-row gap-4 items-start sm:items-center justify-between p-4 bg-card rounded-lg border border-border">
        <div className="flex items-center gap-2">
          <Filter className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-medium">Analytics Filters</h3>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {/* Facility Filter - Super Admin Only */}
          {isSuperAdmin && (
            <div className="min-w-[200px]">
              <Select value={selectedFacilityId} onValueChange={setSelectedFacilityId}>
                <SelectTrigger>
                  <SelectValue placeholder="Select Facility" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Facilities</SelectItem>
                  {facilities?.map((f: any) => (
                    <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div className="flex items-center gap-2">
            <Select value={dateFilter} onValueChange={handleDateFilterChange}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="Period" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="1day">Last 24 Hours</SelectItem>
                <SelectItem value="1week">Last 7 Days</SelectItem>
                <SelectItem value="1month">Last 30 Days</SelectItem>
                <SelectItem value="custom">Custom Range</SelectItem>
              </SelectContent>
            </Select>

            <AnimatePresence mode="wait">
              {dateFilter === 'custom' && (
                <motion.div
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  exit={{ opacity: 0, x: -10 }}
                  className="flex items-center gap-2"
                >
                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="date-from"
                        variant={"outline"}
                        className={cn(
                          "w-[160px] justify-start text-left font-normal",
                          !dateRange?.from && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.from ? (
                          format(dateRange.from, "LLL dd, y")
                        ) : (
                          <span>From Date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={dateRange?.from}
                        onSelect={(date) => setDateRange(prev => ({ ...prev, from: date, to: prev?.to }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>

                  <span className="text-muted-foreground">-</span>

                  <Popover>
                    <PopoverTrigger asChild>
                      <Button
                        id="date-to"
                        variant={"outline"}
                        className={cn(
                          "w-[160px] justify-start text-left font-normal",
                          !dateRange?.to && "text-muted-foreground"
                        )}
                      >
                        <CalendarIcon className="mr-2 h-4 w-4" />
                        {dateRange?.to ? (
                          format(dateRange.to, "LLL dd, y")
                        ) : (
                          <span>To Date</span>
                        )}
                      </Button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end">
                      <Calendar
                        mode="single"
                        selected={dateRange?.to}
                        onSelect={(date) => setDateRange(prev => ({ ...prev, from: prev?.from, to: date }))}
                        initialFocus
                      />
                    </PopoverContent>
                  </Popover>
                </motion.div>
              )}
            </AnimatePresence>
          </div>
        </div>
      </motion.div>

      {/* Entity Stats Grid */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {entityCounts?.map((entity, index) => (
          <motion.div key={entity.name} variants={itemVariants}>
            <Card className="bg-card border-border hover:shadow-md transition-shadow">
              <CardContent className="pt-6">
                <div className="flex items-center gap-3">
                  <motion.div
                    initial={{ scale: 0.8 }}
                    animate={{ scale: 1 }}
                    transition={{ delay: index * 0.1 }}
                    className="p-2 rounded-lg"
                    style={{ backgroundColor: `${entity.color}20` }}
                  >
                    <entity.icon className="h-5 w-5" style={{ color: entity.color }} />
                  </motion.div>
                  <div>
                    <p className="text-xs text-muted-foreground">{entity.name}</p>
                    <p className="text-xl font-bold">{entity.count}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* User Growth Chart */}
        <motion.div variants={itemVariants}>
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5" />
                User Growth (Last 30 Days)
              </CardTitle>
              <CardDescription>Total registered users over time</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={userGrowth || []}>
                    <defs>
                      <linearGradient id="userGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.3} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Area
                      type="monotone"
                      dataKey="users"
                      stroke="hsl(var(--primary))"
                      fill="url(#userGradient)"
                      strokeWidth={2}
                      isAnimationActive={true}
                      animationDuration={1500}
                      animationEasing="ease-out"
                    />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Role Distribution Pie Chart */}
        <motion.div variants={itemVariants}>
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Users className="h-5 w-5" />
                Role Distribution
              </CardTitle>
              <CardDescription>Users by role type</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <PieChart>
                    <Pie
                      data={roleDistribution || []}
                      cx="50%"
                      cy="50%"
                      innerRadius={60}
                      outerRadius={100}
                      paddingAngle={2}
                      dataKey="value"
                      label={({ name, value }) => `${name}: ${value}`}
                      isAnimationActive={true}
                      animationDuration={1500}
                      animationEasing="ease-out"
                    >
                      {roleDistribution?.map((entry, index) => (
                        <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                  </PieChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Module Usage */}
        <motion.div variants={itemVariants}>
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Activity className="h-5 w-5" />
                Module Access by Roles
              </CardTitle>
              <CardDescription>Number of roles with access to each module</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={moduleUsage || []} layout="vertical">
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis dataKey="name" type="category" stroke="hsl(var(--muted-foreground))" fontSize={11} width={100} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar
                      dataKey="roles"
                      fill="hsl(var(--primary))"
                      radius={[0, 4, 4, 0]}
                      isAnimationActive={true}
                      animationDuration={1500}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>

        {/* Activity by Day */}
        <motion.div variants={itemVariants}>
          <Card className="bg-card border-border overflow-hidden">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <CalendarIcon className="h-5 w-5" />
                Activity by Day of Week
              </CardTitle>
              <CardDescription>System events in the last 30 days</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-[300px]">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={activityByDay || []}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="day" stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <YAxis stroke="hsl(var(--muted-foreground))" fontSize={12} />
                    <Tooltip
                      contentStyle={{
                        backgroundColor: 'hsl(var(--card))',
                        border: '1px solid hsl(var(--border))',
                        borderRadius: '8px',
                      }}
                    />
                    <Bar
                      dataKey="events"
                      fill="hsl(142, 71%, 45%)"
                      radius={[4, 4, 0, 0]}
                      isAnimationActive={true}
                      animationDuration={1500}
                      animationEasing="ease-out"
                    />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </motion.div>
      </div>
    </motion.div>
  );
}
