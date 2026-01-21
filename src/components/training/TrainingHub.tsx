import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription
} from '@/components/ui/dialog';
import { Calendar, Plus, List, Users, CalendarDays, UserCheck, UsersRound } from 'lucide-react';
import TrainingEventList from './TrainingEventList';
import TrainingEventForm from './TrainingEventForm';
import TrainingRegistrations from './TrainingRegistrations';
import TrainingCalendarView from './TrainingCalendarView';
import AttendanceChecklistModal from './AttendanceChecklistModal';
import AttendanceEventSelector from './AttendanceEventSelector';
import GroupManagement from './GroupManagement';
import { useUserRole } from '@/hooks/useUserRole';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingState } from '@/components/layout/LoadingState';
import { ResponsiveTabsList } from '@/components/layout/ResponsiveTabsList';
import { useState } from 'react';

interface TrainingHubProps {
  departmentId?: string;
}

const TrainingHub = ({ departmentId }: TrainingHubProps) => {
  const { data: roles, isLoading } = useUserRole();
  const [selectedEventId, setSelectedEventId] = useState<string | null>(null);
  const [attendanceEventId, setAttendanceEventId] = useState<string | null>(null);

  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');
  const isAdmin = roles?.some(r =>
    ['super_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head'].includes(r.role)
  );

  const orgAdminRole = roles?.find(r => r.role === 'organization_admin');
  const userOrgId = orgAdminRole?.organization_id;

  if (isLoading) {
    return <LoadingState message="Loading training module..." />;
  }

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Meeting & Training Error"
          message="Failed to load meeting & training module"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <div className="space-y-6 px-1 sm:px-0 overflow-hidden">
        <Tabs defaultValue="calendar" className="space-y-4">
          <ResponsiveTabsList wrap={true}>
            <TabsTrigger value="calendar" className="min-h-[44px] px-3 text-sm">
              <CalendarDays className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Calendar</span>
            </TabsTrigger>
            <TabsTrigger value="events" className="min-h-[44px] px-3 text-sm">
              <Calendar className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">Upcoming</span>
            </TabsTrigger>
            <TabsTrigger value="my-registrations" className="min-h-[44px] px-3 text-sm">
              <List className="h-4 w-4 mr-1.5 sm:mr-2" />
              <span className="hidden sm:inline">My Registrations</span>
            </TabsTrigger>
            {isAdmin && (
              <>
                <TabsTrigger value="create" className="min-h-[44px] px-3 text-sm">
                  <Plus className="h-4 w-4 mr-1.5 sm:mr-2" />
                  <span className="hidden sm:inline">Create</span>
                </TabsTrigger>
                <TabsTrigger value="manage" className="min-h-[44px] px-3 text-sm">
                  <Users className="h-4 w-4 mr-1.5 sm:mr-2" />
                  <span className="hidden sm:inline">Manage</span>
                </TabsTrigger>
                <TabsTrigger value="attendance" onClick={() => setAttendanceEventId(null)} className="min-h-[44px] px-3 text-sm">
                  <UserCheck className="h-4 w-4 mr-1.5 sm:mr-2" />
                  <span className="hidden sm:inline">Attendance</span>
                </TabsTrigger>
                <TabsTrigger value="groups" className="min-h-[44px] px-3 text-sm">
                  <UsersRound className="h-4 w-4 mr-1.5 sm:mr-2" />
                  <span className="hidden sm:inline">Groups</span>
                </TabsTrigger>
              </>
            )}
          </ResponsiveTabsList>

          <TabsContent value="calendar">
            <TrainingCalendarView />
          </TabsContent>

          <TabsContent value="events">
            <TrainingEventList
              showOnlyPublished={true}
              showOnlyUpcoming={true}
              onSelectEvent={setSelectedEventId}
              departmentId={departmentId}
            />
          </TabsContent>

          <TabsContent value="my-registrations">
            <TrainingEventList
              showOnlyRegistered={true}
              showOnlyUpcoming={true}
              onSelectEvent={setSelectedEventId}
            />
          </TabsContent>

          {isAdmin && (
            <>
              <TabsContent value="create">
                <TrainingEventForm
                  organizationId={userOrgId || undefined}
                  departmentId={departmentId}
                />
              </TabsContent>

              <TabsContent value="manage">
                <TrainingEventList
                  showAll={true}
                  isAdminView={true}
                  onSelectEvent={setSelectedEventId}
                  departmentId={departmentId}
                />

                <Dialog open={!!selectedEventId} onOpenChange={(open) => !open && setSelectedEventId(null)}>
                  <DialogContent className="max-w-4xl max-h-[90vh] overflow-hidden flex flex-col p-0">
                    <DialogHeader className="p-6 pb-2">
                      <DialogTitle>Event Registrations</DialogTitle>
                      <DialogDescription>
                        View participants who have registered for this event.
                      </DialogDescription>
                    </DialogHeader>
                    <div className="flex-1 overflow-y-auto px-6 pb-6 mt-2">
                      {selectedEventId && (
                        <TrainingRegistrations eventId={selectedEventId} />
                      )}
                    </div>
                  </DialogContent>
                </Dialog>
              </TabsContent>

              <TabsContent value="attendance">
                <AttendanceEventSelector
                  onSelectEvent={setAttendanceEventId}
                  selectedEventId={attendanceEventId}
                />
                {attendanceEventId && (
                  <AttendanceChecklistModal
                    eventId={attendanceEventId}
                    isOpen={!!attendanceEventId}
                    onClose={() => setAttendanceEventId(null)}
                  />
                )}
              </TabsContent>

              <TabsContent value="groups">
                <GroupManagement />
              </TabsContent>
            </>
          )}
        </Tabs>
      </div>
    </ErrorBoundary>
  );
};

export default TrainingHub;
