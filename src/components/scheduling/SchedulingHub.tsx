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

interface SchedulingHubProps {
  departmentId?: string;
}

export const SchedulingHub: React.FC<SchedulingHubProps> = ({ departmentId }) => {
  const { data: roles } = useUserRole();
  const [activeTab, setActiveTab] = useState('assignments');

  const isDepartmentHead = roles?.some(r => r.role === 'department_head');
  const isStaff = roles?.some(r => r.role === 'staff');
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');

  const canManage = isDepartmentHead || isSuperAdmin;

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
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="assignments" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Assign Staff</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
          <TabsTrigger value="display" className="flex items-center gap-2">
            <Monitor className="h-4 w-4" />
            <span className="hidden sm:inline">Display</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="assignments">
          <InteractiveStaffCalendar departmentId={effectiveDepartmentId} />
        </TabsContent>

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
