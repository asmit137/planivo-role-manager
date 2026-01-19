import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ListTodo, CheckSquare, Users, Search, PlusCircle, XCircle, MessageSquare } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { toast } from 'sonner';
import TaskManager from './TaskManager';
import StaffTaskView from './StaffTaskView';
import AllStaffTasksView from './AllStaffTasksView';
import { useUserRole } from '@/hooks/useUserRole';
import { ErrorBoundary } from 'react-error-boundary';
import { ErrorState } from '@/components/layout/ErrorState';
import { LoadingState } from '@/components/layout/LoadingState';
import { useState, useMemo } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useOrganization } from '@/contexts/OrganizationContext';
import { cn } from '@/lib/utils';

const TaskHub = () => {
  const { data: roles, isLoading: rolesLoading } = useUserRole();
  const { organization: currentOrganization } = useOrganization();
  const { user } = useAuth();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('manage');

  const [staffSearch, setStaffSearch] = useState('');
  const [preSelectedStaff, setPreSelectedStaff] = useState<string[]>([]);
   const [viewingStaffId, setViewingStaffId] = useState<string | null>(null);

  const [isMessaging, setIsMessaging] = useState(false);

  // Determine user's scope for task management
  const managerRole = roles?.find(r =>
    ['super_admin', 'organization_admin', 'general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head'].includes(r.role)
  );

  const isSuperAdmin = roles?.some(r => r.role === 'super_admin' || r.role === 'general_admin');
  const canManageTasks = !!managerRole;

  const getScopeInfo = () => {
    if (!managerRole) return null;

    if (managerRole.role === 'super_admin' || managerRole.role === 'general_admin') {
      // For Super Admin AND General Admin, use the currently selected organization from context
      if (!currentOrganization?.id || currentOrganization.id === 'all') return null;
      return { scopeType: 'organization' as const, scopeId: currentOrganization.id };
    }

    if (['organization_admin', 'workplace_supervisor'].includes(managerRole.role)) {
      return managerRole.workspace_id ? { scopeType: 'workspace' as const, scopeId: managerRole.workspace_id } : null;
    } else if (managerRole.role === 'facility_supervisor') {
      return { scopeType: 'facility' as const, scopeId: managerRole.facility_id! };
    } else if (managerRole.role === 'department_head') {
      return { scopeType: 'department' as const, scopeId: managerRole.department_id! };
    }
    return null;
  };

  const scopeInfo = getScopeInfo();

  // Fetch all staff for the "Staff List" tab
  const { data: allStaff, isLoading: staffLoading } = useQuery({
    queryKey: ['hub-available-staff', scopeInfo?.scopeType, scopeInfo?.scopeId],
    queryFn: async () => {
      if (!scopeInfo) return [];

      let query = (supabase.from('user_roles').select('user_id, role, profiles:user_id(id, full_name, email)') as any);

      if (scopeInfo.scopeType === 'organization') {
        query = query.eq('organization_id', scopeInfo.scopeId);
      } else if (scopeInfo.scopeType === 'workspace') {
        query = query.eq('workspace_id', scopeInfo.scopeId);
      } else if (scopeInfo.scopeType === 'facility') {
        query = query.eq('facility_id', scopeInfo.scopeId);
      } else if (scopeInfo.scopeType === 'department') {
        query = query.eq('department_id', scopeInfo.scopeId);
      }

      const { data, error } = await query;
      if (error) throw error;

      // Unique by user_id
      const uniqueStaff = Array.from(new Map(data.map(item => [item.user_id, item])).values());
      return uniqueStaff;
    },
    enabled: !!scopeInfo && canManageTasks,
  });

  const filteredStaff = useMemo(() => {
    if (!allStaff) return [];
    return allStaff.filter((s: any) =>
      s.profiles?.full_name?.toLowerCase().includes(staffSearch.toLowerCase()) ||
      s.profiles?.email?.toLowerCase().includes(staffSearch.toLowerCase())
    );
  }, [allStaff, staffSearch]);

  const handleMessageUser = async (targetUserId: string) => {
    if (!user || !targetUserId) return;
    if (user.id === targetUserId) {
      toast.info("You're messaging yourself (Note to Self)");
    }

    setIsMessaging(true);
    try {
      const { data: existingParticipant, error: searchError } = await (supabase.from('conversation_participants') as any)
        .select('conversation_id')
        .eq('user_id', user.id);

      if (searchError) throw searchError;

      let existingConvoId = null;

      if (existingParticipant && existingParticipant.length > 0) {
        const convoIds = existingParticipant.map(p => p.conversation_id);
        const { data: otherParticipants, error: otherError } = await (supabase.from('conversation_participants') as any)
          .select('conversation_id')
          .in('conversation_id', convoIds)
          .eq('user_id', targetUserId);

        if (otherError) throw otherError;

        if (otherParticipants && otherParticipants.length > 0) {
          const targetConvoIds = otherParticipants.map(p => p.conversation_id);
          const { data: dms, error: dmsError } = await (supabase.from('conversations') as any)
            .select('id')
            .in('id', targetConvoIds)
            .eq('is_group', false)
            .neq('type', 'channel');

          if (dmsError) throw dmsError;
          if (dms && dms.length > 0) existingConvoId = dms[0].id;
        }
      }

      if (existingConvoId) {
        navigate(`/dashboard?tab=messaging&convo=${existingConvoId}`);
      } else {
        const { data: conversation, error: convError } = await (supabase.from('conversations') as any)
          .insert({
            title: null,
            is_group: false,
            type: 'dm',
            created_by: user.id,
          } as any)
          .select()
          .single();

        if (convError) throw convError;

        const participants = [
          { conversation_id: conversation.id, user_id: user.id },
          { conversation_id: conversation.id, user_id: targetUserId }
        ];

        const { error: partError } = await (supabase.from('conversation_participants') as any)
          .insert(participants);

        if (partError) throw partError;

        queryClient.invalidateQueries({ queryKey: ['discord-dms'] });
        navigate(`/dashboard?tab=messaging&convo=${conversation.id}`);
        toast.success('Starting new conversation');
      }
    } catch (error: any) {
      console.error('Error in handleMessageUser:', error);
      toast.error('Failed to initiate messaging');
    } finally {
      setIsMessaging(false);
    }
  };

  const handleAssignTask = (staffId: string) => {
    setPreSelectedStaff([staffId]);
    setActiveTab('manage');
  };

  if (rolesLoading) {
    return <LoadingState message="Loading task systems..." />;
  }

  return (
    <ErrorBoundary
      fallback={
        <ErrorState
          title="Task Error"
          message="Failed to load task management system"
          onRetry={() => window.location.reload()}
        />
      }
    >
      <div className="space-y-4">
        <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
          <TabsList className={cn("grid w-full", canManageTasks ? "grid-cols-3" : "grid-cols-1")}>
            {canManageTasks && (
              <>
                <TabsTrigger value="manage">
                  <ListTodo className="h-4 w-4 mr-2" />
                  Manage Tasks
                </TabsTrigger>
                <TabsTrigger value="staff">
                  <Users className="h-4 w-4 mr-2" />
                  Staff List
                </TabsTrigger>
              </>
            )}
            <TabsTrigger value="my-tasks">
              <CheckSquare className="h-4 w-4 mr-2" />
              {isSuperAdmin ? 'Global Task Progress' : 'My Tasks'}
            </TabsTrigger>
          </TabsList>

          {canManageTasks && (
            <>
              <TabsContent value="manage">
                {scopeInfo ? (
                  <TaskManager
                    key={`mgr-${preSelectedStaff.join(',')}`} // Force re-render if selection changes
                    scopeType={scopeInfo.scopeType}
                    scopeId={scopeInfo.scopeId}
                    hideTaskList={true}
                    initialSelectedStaffIds={preSelectedStaff}
                  />
                ) : (
                  <Card className="p-12 text-center text-muted-foreground border-2 border-dashed">
                    {isSuperAdmin ? "Please select an organization from the sidebar to manage tasks." : "No scope assigned for task management."}
                  </Card>
                )}
              </TabsContent>

              <TabsContent value="staff">
                <div className="space-y-4">
                  <div className="flex flex-col sm:flex-row gap-3">
                    <div className="relative flex-1">
                      <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
                      <Input
                        placeholder="Search staff by name or email..."
                        className="pl-8"
                        value={staffSearch}
                        onChange={(e) => setStaffSearch(e.target.value)}
                      />
                    </div>
                    {staffSearch && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setStaffSearch('')}
                        className="h-10 text-muted-foreground hover:bg-secondary transition-colors gap-2"
                      >
                        <XCircle className="h-4 w-4" />
                        <span className="text-xs font-semibold uppercase tracking-wider">Clear Search</span>
                      </Button>
                    )}
                  </div>

                  {staffLoading ? (
                    <LoadingState message="Fetching staff members..." />
                  ) : viewingStaffId && scopeInfo ? (
                    <AllStaffTasksView
                      scopeType={scopeInfo.scopeType}
                      scopeId={scopeInfo.scopeId}
                      assigneeId={viewingStaffId}
                      onBack={() => setViewingStaffId(null)}
                    />
                  ) : (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                      {filteredStaff.map((staff: any) => (
                        <Card key={staff.user_id} className="overflow-hidden hover:shadow-md transition-shadow">
                          <CardContent className="p-4 flex flex-col justify-between gap-4 h-full">
                            <div className="flex items-start justify-between">
                              <div className="space-y-1">
                                <p className="font-semibold text-sm leading-none">{staff.profiles?.full_name || 'Unknown User'}</p>
                                <p className="text-xs text-muted-foreground">{staff.profiles?.email}</p>
                                <Badge variant="outline" className="text-[10px] uppercase font-bold px-1.5 py-0">
                                  {staff.role?.replace('_', ' ')}
                                </Badge>
                              </div>
                              <Button
                                variant="outline"
                                size="icon"
                                className="h-8 w-8"
                                title="Message Staff"
                                onClick={() => window.location.href = `/dashboard?tab=messaging`}
                              >
                                <MessageSquare className="h-4 w-4" />
                              </Button>
                            </div>

                            <div className="flex flex-col gap-2 mt-auto">
                              <Button
                                size="sm"
                                variant="secondary"
                                className="w-full gap-1.5 text-xs h-8"
                                onClick={() => setViewingStaffId(staff.user_id)}
                              >
                                <ListTodo className="h-3.5 w-3.5" />
                                View Tasks
                              </Button>
                              <Button
                                size="sm"
                                variant="default"
                                className="w-full gap-1.5 text-xs h-8"
                                onClick={() => handleAssignTask(staff.user_id)}
                              >
                                <PlusCircle className="h-3.5 w-3.5" />
                                Assign New Task
                              </Button>
                            </div>
                            <div className="flex flex-col gap-2">
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                                onClick={() => handleAssignTask(staff.user_id)}
                              >
                                <PlusCircle className="h-4 w-4" />
                                Assign
                              </Button>
                              <Button
                                size="sm"
                                variant="ghost"
                                className="h-8 gap-1.5 text-primary hover:text-primary hover:bg-primary/10"
                                onClick={() => handleMessageUser(staff.user_id)}
                                disabled={isMessaging}
                              >
                                <MessageSquare className="h-4 w-4" />
                                Message
                              </Button>
                            </div>
                          </CardContent>
                        </Card>
                      ))}
                      {filteredStaff.length === 0 && (
                        <div className="col-span-full py-12 text-center text-muted-foreground border-2 border-dashed rounded-lg">
                          No staff members found.
                        </div>
                      )}
                    </div>
                  )}
                </div>
              </TabsContent>
            </>
          )}

          <TabsContent value="my-tasks">
            <StaffTaskView />
          </TabsContent>
        </Tabs>
      </div>
    </ErrorBoundary>
  );
};

export default TaskHub;
