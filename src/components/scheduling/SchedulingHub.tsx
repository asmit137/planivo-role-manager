import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Users, LayoutDashboard, Monitor } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ShiftCalendarView } from './ShiftCalendarView';
import { InteractiveStaffCalendar } from './InteractiveStaffCalendar';
import { SchedulingDashboard } from './SchedulingDashboard';
import { StaffScheduleView } from './StaffScheduleView';
import { ScheduleDisplaySettings } from './ScheduleDisplaySettings';
import { EmptyState } from '@/components/layout/EmptyState';
import { ResponsiveTabsList } from '@/components/layout/ResponsiveTabsList';


interface SchedulingHubProps {
  departmentId?: string;
}

export const SchedulingHub: React.FC<SchedulingHubProps> = ({ departmentId }) => {
  const { data: roles } = useUserRole();
  const isDepartmentHead = roles?.some(r => r.role === 'department_head');
  const isStaff = roles?.some(r => r.role === 'staff');
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
  const isOrgAdmin = roles?.some(r => r.role === 'organization_admin' || r.role === 'general_admin');

  const canManage = isDepartmentHead || isSuperAdmin || isOrgAdmin;

  // Org Admin sees calendar first and can't use assignments
  const [activeTab, setActiveTab] = useState((isOrgAdmin && !isDepartmentHead) ? 'calendar' : 'assignments');

  // Get department ID from role if not provided
  const effectiveDepartmentId = departmentId || roles?.find(r => r.department_id)?.department_id;

  if (!effectiveDepartmentId) {
    return (
      <EmptyState
        icon={Calendar}
        title="No department assigned"
        description="You need to be assigned to a department to view schedules"
      />
    );
  }

  // Staff only sees their schedule view
  if (isStaff && !canManage) {
    return (
      <ErrorBoundary>
        <StaffScheduleView departmentId={effectiveDepartmentId} />
      </ErrorBoundary>
    );
  }

  // Department Head sees assignments, calendar, dashboard, display (no schedule creation)
  return (
    <ErrorBoundary>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <ResponsiveTabsList className="justify-center">
          {(!isOrgAdmin || isDepartmentHead || isSuperAdmin) && (
            <TabsTrigger value="assignments" className="min-h-[44px] px-3 text-sm" title="Assign Staff">
              <Users className="h-4 w-4 mr-2" />
              <span className="hidden sm:inline">Assign Staff</span>
            </TabsTrigger>
          )}
          <TabsTrigger value="calendar" className="min-h-[44px] px-3 text-sm" title="Calendar">
            <Calendar className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="min-h-[44px] px-3 text-sm" title="Dashboard">
            <LayoutDashboard className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="display" className="min-h-[44px] px-3 text-sm" title="Display Settings">
            <Monitor className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Display</span>
          </TabsTrigger>
        </ResponsiveTabsList>


        {(!isOrgAdmin || isDepartmentHead || isSuperAdmin) && (
          <TabsContent value="assignments">
            <InteractiveStaffCalendar departmentId={effectiveDepartmentId} />
          </TabsContent>
        )}

        <TabsContent value="calendar">
          <ShiftCalendarView departmentId={effectiveDepartmentId} />
        </TabsContent>

        <TabsContent value="dashboard">
          <SchedulingDashboard departmentId={effectiveDepartmentId} />
        </TabsContent>


        <TabsContent value="display">
          <ScheduleDisplaySettings departmentId={effectiveDepartmentId} />
        </TabsContent>
      </Tabs>
    </ErrorBoundary>
  );
};
