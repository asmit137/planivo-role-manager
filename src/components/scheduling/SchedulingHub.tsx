import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Calendar, Clipboard, Users, LayoutDashboard } from 'lucide-react';
import { useUserRole } from '@/hooks/useUserRole';
import ErrorBoundary from '@/components/ErrorBoundary';
import { ScheduleManager } from './ScheduleManager';
import { ShiftCalendarView } from './ShiftCalendarView';
import { StaffAssignments } from './StaffAssignments';
import { SchedulingDashboard } from './SchedulingDashboard';
import { StaffScheduleView } from './StaffScheduleView';

interface SchedulingHubProps {
  departmentId?: string;
}

export const SchedulingHub: React.FC<SchedulingHubProps> = ({ departmentId }) => {
  const { data: roles } = useUserRole();
  const [activeTab, setActiveTab] = useState('schedules');

  const isDepartmentHead = roles?.some(r => r.role === 'department_head');
  const isStaff = roles?.some(r => r.role === 'staff');
  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');

  const canManage = isDepartmentHead || isSuperAdmin;

  // Get department ID from role if not provided
  const effectiveDepartmentId = departmentId || roles?.find(r => r.department_id)?.department_id;

  if (!effectiveDepartmentId) {
    return (
      <div className="flex items-center justify-center h-64">
        <p className="text-muted-foreground">No department assigned</p>
      </div>
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

  return (
    <ErrorBoundary>
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-4 mb-6">
          <TabsTrigger value="schedules" className="flex items-center gap-2">
            <Clipboard className="h-4 w-4" />
            <span className="hidden sm:inline">Schedules</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="flex items-center gap-2">
            <Calendar className="h-4 w-4" />
            <span className="hidden sm:inline">Calendar</span>
          </TabsTrigger>
          <TabsTrigger value="assignments" className="flex items-center gap-2">
            <Users className="h-4 w-4" />
            <span className="hidden sm:inline">Assignments</span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="flex items-center gap-2">
            <LayoutDashboard className="h-4 w-4" />
            <span className="hidden sm:inline">Dashboard</span>
          </TabsTrigger>
        </TabsList>

        <TabsContent value="schedules">
          <ScheduleManager departmentId={effectiveDepartmentId} />
        </TabsContent>

        <TabsContent value="calendar">
          <ShiftCalendarView departmentId={effectiveDepartmentId} />
        </TabsContent>

        <TabsContent value="assignments">
          <StaffAssignments departmentId={effectiveDepartmentId} />
        </TabsContent>

        <TabsContent value="dashboard">
          <SchedulingDashboard departmentId={effectiveDepartmentId} />
        </TabsContent>
      </Tabs>
    </ErrorBoundary>
  );
};
