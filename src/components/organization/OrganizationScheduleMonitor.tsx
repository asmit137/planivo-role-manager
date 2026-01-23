import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { StatsCard } from '@/components/shared';
import { format } from 'date-fns';
import { ScheduleManager } from '@/components/scheduling/ScheduleManager';
import { Button } from '@/components/ui/button';
import {
  Calendar, Clock, Users, FileText, ArrowLeft, Plus,
  Eye, Activity, ListTodo, Search, Filter
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { SchedulingHub } from '@/components/scheduling/SchedulingHub';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogTrigger, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue, SelectGroup, SelectLabel } from '@/components/ui/select';
import { SearchableSelect } from '@/components/ui/searchable-select';

interface OrganizationScheduleMonitorProps {
  organizationId: string;
}

const OrganizationScheduleMonitor = ({ organizationId }: OrganizationScheduleMonitorProps) => {
  const [selectedDepartmentId, setSelectedDepartmentId] = useState<string | null>(null);
  const [viewMode, setViewMode] = useState<'manage' | 'view' | null>(null);
  const [departmentSelectOpen, setDepartmentSelectOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterDept, setFilterDept] = useState('all');

  // Get all workspace IDs for this organization
  const { data: workspaceIds } = useQuery({
    queryKey: ['org-workspace-ids', organizationId],
    queryFn: async () => {
      let query = supabase
        .from('workspaces')
        .select('id');

      if (organizationId && organizationId !== 'all') {
        query = query.eq('organization_id', organizationId);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data?.map(w => w.id) || [];
    },
    enabled: !!organizationId,
  });

  // Fetch all departments for selection
  const { data: allDepartments } = useQuery({
    queryKey: ['org-all-departments', workspaceIds],
    queryFn: async () => {
      if (!workspaceIds || workspaceIds.length === 0) return [];

      // First, get all departments linked via facilities
      const { data: viaFacilities } = await (supabase
        .from('departments') as any)
        .select('id, name, facility_id, facilities!inner(id, name, workspace_id)')
        .in('facilities.workspace_id', workspaceIds);

      // Second, get all departments linked via workspace_departments
      const { data: viaWorkspaceDepts } = await (supabase
        .from('workspace_departments') as any)
        .select('workspace_id, departments!inner(id, name, facility_id, facilities(id, name))')
        .in('workspace_id', workspaceIds);

      // Fetch schedule counts to show in dropdown
      const { data: scheduleCounts } = await supabase
        .from('schedules')
        .select('department_id')
        .in('workspace_id', workspaceIds || []);

      const countMap = (scheduleCounts || []).reduce((acc: any, s: any) => {
        acc[s.department_id] = (acc[s.department_id] || 0) + 1;
        return acc;
      }, {});

      // Merge results
      const deptMap = new Map();

      viaFacilities?.forEach((d: any) => {
        deptMap.set(d.id, {
          id: d.id,
          name: d.name,
          facilityName: d.facilities?.name || 'No Facility',
          scheduleCount: countMap[d.id] || 0
        });
      });

      viaWorkspaceDepts?.forEach((wd: any) => {
        const d = wd.departments;
        if (d && !deptMap.has(d.id)) {
          deptMap.set(d.id, {
            id: d.id,
            name: d.name,
            facilityName: d.facilities?.name || 'No Facility',
            scheduleCount: countMap[d.id] || 0
          });
        }
      });

      return Array.from(deptMap.values()).sort((a: any, b: any) => a.name.localeCompare(b.name));
    },
    enabled: !!workspaceIds && workspaceIds.length > 0
  });

  // Get schedule stats
  const { data: scheduleStats, isLoading: statsLoading } = useQuery({
    queryKey: ['org-schedule-stats', workspaceIds],
    queryFn: async () => {
      if (!workspaceIds || workspaceIds.length === 0) return null;

      const { count: published } = await supabase
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .in('workspace_id', workspaceIds)
        .eq('status', 'published');

      const { count: draft } = await supabase
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .in('workspace_id', workspaceIds)
        .eq('status', 'draft');

      const { count: total } = await supabase
        .from('schedules')
        .select('*', { count: 'exact', head: true })
        .in('workspace_id', workspaceIds);

      return {
        published: published || 0,
        draft: draft || 0,
        total: total || 0,
      };
    },
    enabled: !!workspaceIds && workspaceIds.length > 0,
  });

  // Get recent schedules
  const { data: recentSchedules, isLoading: schedulesLoading } = useQuery({
    queryKey: ['org-recent-schedules', workspaceIds],
    queryFn: async () => {
      if (!workspaceIds || workspaceIds.length === 0) return [];

      const { data: schedules, error } = await (supabase
        .from('schedules') as any)
        .select(`
          id,
          name,
          status,
          start_date,
          end_date,
          shift_count,
          department_id,
          workspace_id,
          departments (
            name, 
            facility_id, 
            facilities (
              name,
              workspace_id
            )
          )
        `)
        .in('workspace_id', workspaceIds)
        .order('created_at', { ascending: false })
        .limit(50);

      if (error) throw error;

      return schedules?.map((s: any) => ({
        ...s,
        departmentName: s.departments?.name || 'No Department',
        facilityName: s.departments?.facilities?.name || 'No Facility',
      })) || [];
    },
    enabled: !!workspaceIds && workspaceIds.length > 0,
  });

  const isLoading = statsLoading || schedulesLoading;

  if (isLoading) {
    return <LoadingState message="Loading schedule data..." />;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'published':
        return <Badge className="bg-emerald-500 text-white">Published</Badge>;
      case 'draft':
        return <Badge className="bg-amber-500 text-white">Draft</Badge>;
      case 'archived':
        return <Badge variant="outline" className="bg-muted text-muted-foreground border-muted-foreground/20">Archived</Badge>;
      default:
        return <Badge variant="secondary">{status}</Badge>;
    }
  };

  if (selectedDepartmentId && viewMode) {
    return (
      <div className="space-y-4">
        <Button
          variant="outline"
          size="sm"
          onClick={() => {
            setSelectedDepartmentId(null);
            setViewMode(null);
          }}
          className="gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Overview
        </Button>
        {viewMode === 'manage' ? (
          <ScheduleManager departmentId={selectedDepartmentId} />
        ) : (
          <SchedulingHub departmentId={selectedDepartmentId} />
        )}
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-medium">Schedule Overview</h3>
        <Dialog open={departmentSelectOpen} onOpenChange={setDepartmentSelectOpen}>
          <DialogTrigger asChild>
            <Button>
              <Plus className="h-4 w-4 mr-2" />
              Manage Schedules
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Select Department</DialogTitle>
            </DialogHeader>
            <div className="py-4 space-y-4">
              <div className="space-y-2">
                <Label>Department to manage</Label>
                <SearchableSelect
                  value={selectedDepartmentId || ''}
                  onValueChange={setSelectedDepartmentId}
                  placeholder="Select a department..."
                  options={allDepartments?.map((dept: any) => ({
                    value: dept.id,
                    label: `${dept.name} (${dept.facilityName})`,
                    render: (
                      <div className="flex items-center justify-between w-full gap-4">
                        <div className="flex flex-col">
                          <span className="font-medium">{dept.name}</span>
                          <span className="text-[10px] text-muted-foreground">{dept.facilityName}</span>
                        </div>
                        {dept.scheduleCount > 0 && (
                          <Badge variant="secondary" className="text-[10px] h-4 px-1 bg-primary/10 text-primary">
                            {dept.scheduleCount} {dept.scheduleCount === 1 ? 'sch' : 'schs'}
                          </Badge>
                        )}
                      </div>
                    )
                  })) || []}
                />
              </div>
              <div className="flex gap-2 justify-end pt-2">
                <Button
                  variant="outline"
                  disabled={!selectedDepartmentId}
                  onClick={() => {
                    setViewMode('view');
                    setDepartmentSelectOpen(false);
                  }}
                >
                  <Eye className="h-4 w-4 mr-2" />
                  View Calendar
                </Button>
                <Button
                  disabled={!selectedDepartmentId}
                  onClick={() => {
                    setViewMode('manage');
                    setDepartmentSelectOpen(false);
                  }}
                >
                  <Plus className="h-4 w-4 mr-2" />
                  Manage Schedules
                </Button>
              </div>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Stats Overview */}
      <div className="grid gap-2 sm:gap-4 grid-cols-2 md:grid-cols-3">
        <StatsCard
          title="Published"
          value={scheduleStats?.published || 0}
          icon={Calendar}
          description="Active"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Draft"
          value={scheduleStats?.draft || 0}
          icon={FileText}
          description="Pending"
          className="p-3 sm:p-6"
        />
        <StatsCard
          title="Total"
          value={scheduleStats?.total || 0}
          icon={Clock}
          description="All"
          className="p-3 sm:p-6 col-span-2 sm:col-span-1"
        />
      </div>

      <Tabs defaultValue="active" className="w-full">
        <TabsList className="grid w-full grid-cols-3 mb-6 bg-muted/30">
          <TabsTrigger value="active" className="flex items-center gap-2">
            <Activity className="h-4 w-4" />
            <span className="hidden sm:inline">Active Schedules</span>
            <span className="sm:hidden">Active</span>
          </TabsTrigger>
          <TabsTrigger value="all" className="flex items-center gap-2">
            <ListTodo className="h-4 w-4" />
            <span className="hidden sm:inline">Global Browser</span>
            <span className="sm:hidden">Global</span>
          </TabsTrigger>
          <TabsTrigger value="recent" className="flex items-center gap-2">
            <Clock className="h-4 w-4" />
            <span className="hidden sm:inline">Recent Activity</span>
            <span className="sm:hidden">Recent</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="active">
          <Card className="border-2 shadow-sm">
            <CardHeader className="px-3 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Activity className="h-5 w-5 text-emerald-500" />
                Currently Running
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">Schedules active today in your organization</CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              {(() => {
                const now = new Date();
                const activeSchedules = recentSchedules?.filter((s: any) => {
                  const start = new Date(s.start_date);
                  const end = new Date(s.end_date);
                  return s.status === 'published' && now >= start && now <= end;
                }) || [];

                if (activeSchedules.length === 0) {
                  return (
                    <EmptyState
                      icon={Calendar}
                      title="No Active Schedules"
                      description="There are no schedules currently running today."
                    />
                  );
                }

                return (
                  <div className="space-y-3">
                    {activeSchedules.map((schedule: any) => (
                      <ScheduleItem key={schedule.id} schedule={schedule} getStatusBadge={getStatusBadge} setViewMode={setViewMode} setSelectedDepartmentId={setSelectedDepartmentId} />
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="all">
          <Card className="border-2 shadow-sm">
            <CardHeader className="px-3 sm:px-6">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                    <ListTodo className="h-5 w-5 text-primary" />
                    All Organization Schedules
                  </CardTitle>
                  <CardDescription className="text-xs sm:text-sm">Exhaustive list of all schedules across all facilities</CardDescription>
                </div>
                <div className="flex items-center gap-2">
                  <div className="relative flex-1 sm:w-64">
                    <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                    <Input
                      placeholder="Search schedules..."
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      className="pl-9 h-9"
                    />
                  </div>
                  <SearchableSelect
                    value={filterDept}
                    onValueChange={setFilterDept}
                    className="h-9 w-[180px]"
                    placeholder="Filter Dept"
                    options={[
                      { value: 'all', label: 'All Departments' },
                      ...(allDepartments?.map((dept: any) => ({
                        value: dept.id,
                        label: `${dept.name} (${dept.facilityName})`,
                        render: (
                          <div className="flex flex-col items-start gap-0.5">
                            <div className="flex items-center gap-2">
                              <span className="font-medium text-sm">{dept.name}</span>
                              {dept.scheduleCount > 0 && (
                                <Badge variant="secondary" className="text-[9px] h-3.5 px-1 bg-primary/10 text-primary">
                                  {dept.scheduleCount} {dept.scheduleCount === 1 ? 'sch' : 'schs'}
                                </Badge>
                              )}
                            </div>
                            <span className="text-[10px] text-muted-foreground">{dept.facilityName}</span>
                          </div>
                        )
                      })) || [])
                    ]}
                  />
                </div>
              </div>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              {(() => {
                const filtered = recentSchedules?.filter((s: any) => {
                  const matchesSearch = s.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    s.facilityName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
                    s.departmentName?.toLowerCase().includes(searchQuery.toLowerCase());
                  const matchesDept = filterDept === 'all' || s.department_id === filterDept;
                  return matchesSearch && matchesDept;
                }) || [];

                if (filtered.length === 0) {
                  return (
                    <EmptyState
                      icon={Calendar}
                      title="No matching schedules"
                      description="Try adjusting your search or filters."
                    />
                  );
                }

                return (
                  <div className="space-y-3">
                    {filtered.map((schedule: any) => (
                      <ScheduleItem key={schedule.id} schedule={schedule} getStatusBadge={getStatusBadge} setViewMode={setViewMode} setSelectedDepartmentId={setSelectedDepartmentId} />
                    ))}
                  </div>
                );
              })()}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="recent">
          <Card className="border-2 shadow-sm">
            <CardHeader className="px-3 sm:px-6">
              <CardTitle className="flex items-center gap-2 text-lg sm:text-xl">
                <Clock className="h-5 w-5 text-primary" />
                Recent Activity
              </CardTitle>
              <CardDescription className="text-xs sm:text-sm">The 10 most recently updated schedules</CardDescription>
            </CardHeader>
            <CardContent className="px-3 sm:px-6">
              {!recentSchedules || recentSchedules.length === 0 ? (
                <EmptyState
                  icon={Calendar}
                  title="No Recent Activity"
                  description="No schedule activity recorded yet."
                />
              ) : (
                <div className="space-y-3">
                  {recentSchedules.slice(0, 10).map((schedule: any) => (
                    <ScheduleItem key={schedule.id} schedule={schedule} getStatusBadge={getStatusBadge} setViewMode={setViewMode} setSelectedDepartmentId={setSelectedDepartmentId} />
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};

const ScheduleItem = ({ schedule, getStatusBadge, setViewMode, setSelectedDepartmentId }: any) => (
  <div className="flex flex-col sm:flex-row sm:items-center justify-between p-3 rounded-lg border bg-muted/30 gap-3">
    <div className="space-y-1">
      <div className="flex items-center justify-between sm:justify-start gap-2">
        <p className="font-medium text-sm sm:text-base">{schedule.name}</p>
        <div className="sm:hidden">
          {getStatusBadge(schedule.status)}
        </div>
      </div>
      <p className="text-xs sm:text-sm text-muted-foreground line-clamp-1">
        {schedule.facilityName} · {schedule.departmentName}
      </p>
      <p className="text-[10px] sm:text-xs text-muted-foreground">
        {format(new Date(schedule.start_date), 'MMM d')} - {format(new Date(schedule.end_date), 'MMM d, yyyy')} · {schedule.shift_count} shifts
      </p>
    </div>
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        className="h-8 w-8 p-0"
        onClick={() => {
          setSelectedDepartmentId(schedule.department_id);
          setViewMode('view');
        }}
      >
        <Eye className="h-4 w-4" />
      </Button>
      <div className="hidden sm:block">
        {getStatusBadge(schedule.status)}
      </div>
    </div>
  </div>
);

export default OrganizationScheduleMonitor;
