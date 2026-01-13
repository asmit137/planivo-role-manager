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
import { ClinicHub } from '@/components/clinics/ClinicHub';
import { ResponsiveTabsList } from '@/components/layout/ResponsiveTabsList';
import { Stethoscope } from 'lucide-react';


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
        <ResponsiveTabsList>
          <TabsTrigger value="assignments" className="min-h-[44px] px-3 text-sm">
            <Users className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Assign Staff</span>
            <span className="sm:hidden">Staff</span>
          </TabsTrigger>
          <TabsTrigger value="calendar" className="min-h-[44px] px-3 text-sm">
            <Calendar className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Calendar</span>
            <span className="sm:hidden">Cal</span>
          </TabsTrigger>
          <TabsTrigger value="clinics" className="min-h-[44px] px-3 text-sm">
            <Stethoscope className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Clinics</span>
            <span className="sm:hidden">Clinics</span>
          </TabsTrigger>
          <TabsTrigger value="dashboard" className="min-h-[44px] px-3 text-sm">
            <LayoutDashboard className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Dashboard</span>
            <span className="sm:hidden">Dash</span>
          </TabsTrigger>
          <TabsTrigger value="display" className="min-h-[44px] px-3 text-sm">
            <Monitor className="h-4 w-4 mr-2" />
            <span className="hidden sm:inline">Display</span>
            <span className="sm:hidden">LCD</span>
          </TabsTrigger>
        </ResponsiveTabsList>


        <TabsContent value="assignments">
          <InteractiveStaffCalendar departmentId={effectiveDepartmentId} />
        </TabsContent>

        <TabsContent value="calendar">
          <ShiftCalendarView departmentId={effectiveDepartmentId} />
        </TabsContent>

        <TabsContent value="clinics">
          <ClinicHub departmentId={effectiveDepartmentId} />
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
