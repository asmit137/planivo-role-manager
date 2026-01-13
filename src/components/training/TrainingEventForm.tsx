import { useState, useEffect } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { useOrganization } from '@/contexts/OrganizationContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage, FormDescription } from '@/components/ui/form';
import { Switch } from '@/components/ui/switch';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import { toast } from 'sonner';
import { Loader2, Calendar, MapPin, Link as LinkIcon, Users, Video, UserCheck, Target, X, AlertCircle, Building } from 'lucide-react';
import UserSelectionDialog from './UserSelectionDialog';

const eventSchema = z.object({
  title: z.string().min(3, 'Title must be at least 3 characters').max(200),
  description: z.string().optional(),
  event_type: z.enum(['training', 'workshop', 'seminar', 'webinar', 'meeting', 'conference', 'other']),
  location_type: z.enum(['online', 'physical', 'hybrid']),
  location_address: z.string().optional(),
  online_link: z.string().url('Must be a valid URL').optional().or(z.literal('')),
  start_datetime: z.string().min(1, 'Start date/time is required'),
  end_datetime: z.string().min(1, 'End date/time is required'),
  organization_id: z.string().uuid('Please select an organization'),
  max_participants: z.number().min(1).optional().nullable(),
  status: z.enum(['draft', 'published']),
  // Registration & targeting fields
  registration_type: z.enum(['open', 'mandatory', 'invite_only']),
  responsible_user_id: z.string().uuid().optional().nullable(),
  // Video conferencing fields
  enable_video_conference: z.boolean().optional(),
  allow_recording: z.boolean().optional(),
  require_lobby: z.boolean().optional(),
  max_video_participants: z.number().min(2).max(500).optional(),
}).refine((data) => {
  // Ensure end_datetime is after start_datetime
  const start = new Date(data.start_datetime);
  const end = new Date(data.end_datetime);
  return end > start;
}, {
  message: 'End date/time must be after start date/time',
  path: ['end_datetime'],
});

type EventFormData = z.infer<typeof eventSchema>;

interface TrainingEventFormProps {
  eventId?: string;
  onSuccess?: () => void;
}

const TrainingEventForm = ({ eventId, onSuccess }: TrainingEventFormProps) => {
  const { user } = useAuth();
  const { data: roles } = useUserRole();
  const { selectedOrganizationId } = useOrganization();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [selectedUsers, setSelectedUsers] = useState<string[]>([]);
  const [selectedDepartments, setSelectedDepartments] = useState<string[]>([]);
  const [showUserSelector, setShowUserSelector] = useState(false);

  const isSuperAdmin = roles?.some(r => r.role === 'super_admin');

  // Fetch organizations for super admin
  const { data: organizations } = useQuery({
    queryKey: ['organizations'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('organizations')
        .select('id, name')
        .eq('is_active', true)
        .order('name');
      if (error) throw error;
      return data;
    },
    enabled: isSuperAdmin,
  });

  // Get user's organization from their workspace
  const { data: userOrganization } = useQuery({
    queryKey: ['user-organization', user?.id],
    queryFn: async () => {
      if (!user) return null;
      const { data, error } = await supabase
        .from('user_roles')
        .select('workspace_id, workspaces(organization_id, organizations(id, name))')
        .eq('user_id', user.id)
        .not('workspace_id', 'is', null)
        .limit(1)
        .maybeSingle();

      if (error) throw error;
      return data?.workspaces?.organizations;
    },
    enabled: !isSuperAdmin && !!user,
  });

  // Fetch existing event for editing
  const { data: existingEvent } = useQuery({
    queryKey: ['training-event', eventId],
    queryFn: async () => {
      if (!eventId) return null;
      const { data, error } = await supabase
        .from('training_events')
        .select('*')
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return data;
    },
    enabled: !!eventId,
  });

  // Fetch existing targets for editing
  const { data: existingTargets } = useQuery({
    queryKey: ['training-event-targets', eventId],
    queryFn: async () => {
      if (!eventId) return { users: [], departments: [] };
      const { data, error } = await supabase
        .from('training_event_targets')
        .select('*')
        .eq('event_id', eventId);
      if (error) throw error;

      const userResults = data?.filter(t => t.target_type === 'user').map(t => t.user_id!) || [];
      const deptResults = data?.filter(t => t.target_type === 'department').map(t => t.department_id!) || [];

      return { users: userResults, departments: deptResults };
    },
    enabled: !!eventId,
  });

  // Fetch selected department profiles for display
  const { data: selectedDepartmentProfiles } = useQuery({
    queryKey: ['selected-dept-profiles', selectedDepartments],
    queryFn: async () => {
      if (!selectedDepartments.length) return [];
      const { data, error } = await supabase
        .from('departments')
        .select('id, name')
        .in('id', selectedDepartments);
      if (error) throw error;
      return data || [];
    },
    enabled: selectedDepartments.length > 0,
  });

  // Fetch selected user profiles for display
  const { data: selectedUserProfiles } = useQuery({
    queryKey: ['selected-user-profiles', selectedUsers],
    queryFn: async () => {
      if (!selectedUsers.length) return [];
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', selectedUsers);
      if (error) throw error;
      return data || [];
    },
    enabled: selectedUsers.length > 0,
  });

  // Fetch potential coordinators (admins in org)
  const { data: potentialCoordinators } = useQuery({
    queryKey: ['potential-coordinators', userOrganization?.id, organizations],
    queryFn: async () => {
      const orgId = userOrganization?.id || organizations?.[0]?.id;
      if (!orgId) return [];

      // Get workspaces for this org
      const { data: workspaces } = await supabase
        .from('workspaces')
        .select('id')
        .eq('organization_id', orgId);

      if (!workspaces?.length) return [];
      const workspaceIds = workspaces.map(w => w.id);

      // Get admin roles in those workspaces
      const { data: adminRoles } = await supabase
        .from('user_roles')
        .select('user_id')
        .in('workspace_id', workspaceIds)
        .in('role', ['general_admin', 'workplace_supervisor', 'facility_supervisor', 'department_head']);

      if (!adminRoles?.length) return [];
      const userIds = [...new Set(adminRoles.map(r => r.user_id))];

      // Get profiles
      const { data: profiles } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', userIds)
        .eq('is_active', true);

      return profiles || [];
    },
    enabled: !!userOrganization?.id || !!organizations?.length,
  });

  const form = useForm<EventFormData>({
    resolver: zodResolver(eventSchema),
    defaultValues: {
      title: existingEvent?.title || '',
      description: existingEvent?.description || '',
      event_type: (existingEvent?.event_type as EventFormData['event_type']) || 'training',
      location_type: (existingEvent?.location_type as EventFormData['location_type']) || 'physical',
      location_address: existingEvent?.location_address || '',
      online_link: existingEvent?.online_link || '',
      start_datetime: existingEvent?.start_datetime ? new Date(existingEvent.start_datetime).toISOString().slice(0, 16) : '',
      end_datetime: existingEvent?.end_datetime ? new Date(existingEvent.end_datetime).toISOString().slice(0, 16) : '',
      organization_id: existingEvent?.organization_id || userOrganization?.id || '',
      max_participants: existingEvent?.max_participants || null,
      status: (existingEvent?.status as EventFormData['status']) || 'published',
      // Registration defaults
      registration_type: (existingEvent?.registration_type as EventFormData['registration_type']) || 'open',
      responsible_user_id: existingEvent?.responsible_user_id || null,
      // Video conferencing defaults
      enable_video_conference: existingEvent?.enable_video_conference || false,
      allow_recording: existingEvent?.allow_recording || false,
      require_lobby: existingEvent?.require_lobby ?? true,
      max_video_participants: existingEvent?.max_video_participants || 100,
    },
  });

  // Load existing targets when editing
  useEffect(() => {
    if (existingTargets) {
      if (Array.isArray(existingTargets.users)) {
        setSelectedUsers(existingTargets.users);
      }
      if (Array.isArray(existingTargets.departments)) {
        setSelectedDepartments(existingTargets.departments);
      }
    }
  }, [existingTargets]);

  const locationType = form.watch('location_type');
  const enableVideoConference = form.watch('enable_video_conference');
  const registrationType = form.watch('registration_type');
  const organizationId = form.watch('organization_id');

  const createEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
      // Generate unique room name for video conferences
      const jitsiRoomName = data.enable_video_conference
        ? `planivo-${Date.now()}-${Math.random().toString(36).substring(7)}`
        : null;

      // Check availability for selected users
      if (selectedUsers.length > 0) {
        const { data: conflicts, error: conflictError } = await supabase
          .from('vacation_splits')
          .select('vacation_plans!inner(staff_id, status), start_date, end_date')
          .in('vacation_plans.staff_id', selectedUsers)
          .in('vacation_plans.status', ['approved', 'pending_approval'])
          .lte('start_date', data.end_datetime)
          .gte('end_date', data.start_datetime);

        if (conflictError) throw conflictError;

        if (conflicts && conflicts.length > 0) {
          // Get names of conflicted users
          const conflictedIds = [...new Set(conflicts.map((c: any) => c.vacation_plans.staff_id))];
          const { data: profiles } = await supabase
            .from('profiles')
            .select('full_name')
            .in('id', conflictedIds);

          const names = profiles?.map(p => p.full_name).join(', ') || 'Selected users';
          throw new Error(`The following users are on vacation during this time: ${names}`);
        }
      }

      const eventData = {
        title: data.title,
        description: data.description || null,
        event_type: data.event_type,
        location_type: data.location_type,
        location_address: data.location_address || null,
        online_link: data.online_link || null,
        start_datetime: data.start_datetime,
        end_datetime: data.end_datetime,
        organization_id: data.organization_id,
        max_participants: data.max_participants || null,
        status: data.status,
        created_by: user?.id!,
        // Registration fields
        registration_type: data.registration_type,
        responsible_user_id: data.responsible_user_id || null,
        // Video conferencing fields
        enable_video_conference: data.enable_video_conference || false,
        allow_recording: data.allow_recording || false,
        require_lobby: data.require_lobby ?? true,
        max_video_participants: data.max_video_participants || 100,
        jitsi_room_name: jitsiRoomName,
      };

      let createdEventId = eventId;

      if (eventId) {
        const { error } = await supabase
          .from('training_events')
          .update(eventData)
          .eq('id', eventId);
        if (error) throw error;
      } else {
        const { data: newEvent, error } = await supabase
          .from('training_events')
          .insert([eventData])
          .select('id')
          .single();
        if (error) throw error;
        createdEventId = newEvent.id;
      }

      // Handle targets for mandatory/invite_only events
      // Handle targets for mandatory/invite_only events
      if (data.registration_type !== 'open' && createdEventId && (selectedUsers.length > 0 || selectedDepartments.length > 0)) {
        // Delete existing targets first (for updates)
        if (eventId) {
          await supabase
            .from('training_event_targets')
            .delete()
            .eq('event_id', eventId);
        }

        const targets = [];

        // Add user targets
        if (selectedUsers.length > 0) {
          targets.push(...selectedUsers.map(userId => ({
            event_id: createdEventId!,
            target_type: 'user' as const,
            user_id: userId,
            department_id: null,
            is_mandatory: data.registration_type === 'mandatory',
          })));
        }

        // Add department targets
        if (selectedDepartments.length > 0) {
          targets.push(...selectedDepartments.map(deptId => ({
            event_id: createdEventId!,
            target_type: 'department' as const,
            user_id: null,
            department_id: deptId,
            is_mandatory: data.registration_type === 'mandatory',
          })));
        }

        if (targets.length > 0) {
          const { error: targetError } = await supabase
            .from('training_event_targets')
            .insert(targets);
          if (targetError) throw targetError;
        }
      }

      // Create notifications
      if (data.status === 'published' && !eventId) {
        let targetUserIds: string[] = [];

        if (data.registration_type === 'open') {
          // Notify all org users
          const { data: orgUsers } = await supabase
            .from('user_roles')
            .select('user_id, workspaces!inner(organization_id)')
            .eq('workspaces.organization_id', data.organization_id);

          targetUserIds = [...new Set(orgUsers?.map(u => u.user_id) || [])];
        } else {
          // Use directly selected users
          targetUserIds = [...selectedUsers];
        }

        if (targetUserIds.length > 0) {
          const isMandatory = data.registration_type === 'mandatory';
          const notifications = targetUserIds.map(userId => ({
            user_id: userId,
            title: isMandatory ? '🔴 Mandatory Training Event' : 'New Training Event',
            message: isMandatory
              ? `You are required to attend "${data.title}". Please register immediately.`
              : `A new training event "${data.title}" has been scheduled`,
            type: isMandatory ? 'urgent' : 'system',
            related_id: createdEventId,
          }));

          await supabase.from('notifications').insert(notifications);
        }
      }
    },
    onSuccess: () => {
      toast.success(eventId ? 'Event updated successfully' : 'Event created successfully');
      queryClient.invalidateQueries({ queryKey: ['training-events'] });
      queryClient.invalidateQueries({ queryKey: ['training-events-calendar'] });
      form.reset();
      setSelectedUsers([]);
      setSelectedDepartments([]);
      onSuccess?.();
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to save event');
    },
  });

  const onSubmit = async (data: EventFormData) => {
    setIsSubmitting(true);
    try {
      await createEventMutation.mutateAsync(data);
    } finally {
      setIsSubmitting(false);
    }
  };

  const availableOrganizations = isSuperAdmin ? organizations : (userOrganization ? [userOrganization] : []);

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Calendar className="h-5 w-5" />
          {eventId ? 'Edit Training Event' : 'Create Training Event'}
        </CardTitle>
        <CardDescription>
          {eventId ? 'Update the training event details' : 'Schedule a new training session or event for your organization'}
        </CardDescription>
      </CardHeader>
      <CardContent>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="title"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Event Title *</FormLabel>
                    <FormControl>
                      <Input placeholder="Enter event title" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="description"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Description</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Describe the event..."
                        className="min-h-[100px]"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="event_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Event Type *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select event type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="training">Training</SelectItem>
                        <SelectItem value="workshop">Workshop</SelectItem>
                        <SelectItem value="seminar">Seminar</SelectItem>
                        <SelectItem value="webinar">Webinar</SelectItem>
                        <SelectItem value="meeting">Meeting</SelectItem>
                        <SelectItem value="conference">Conference</SelectItem>
                        <SelectItem value="other">Other</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="organization_id"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Organization *</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                      disabled={!isSuperAdmin && !!userOrganization}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select organization" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {availableOrganizations?.map((org) => (
                          <SelectItem key={org.id} value={org.id}>
                            {org.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="location_type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Location Type *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select location type" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="online">Online</SelectItem>
                        <SelectItem value="physical">Physical</SelectItem>
                        <SelectItem value="hybrid">Hybrid</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="max_participants"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel className="flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      Max Participants
                    </FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        placeholder="Leave empty for unlimited"
                        {...field}
                        onChange={e => field.onChange(e.target.value ? parseInt(e.target.value) : null)}
                        value={field.value || ''}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              {(locationType === 'physical' || locationType === 'hybrid') && (
                <FormField
                  control={form.control}
                  name="location_address"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel className="flex items-center gap-1">
                        <MapPin className="h-4 w-4" />
                        Physical Address
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="Enter venue address" {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              {(locationType === 'online' || locationType === 'hybrid') && (
                <FormField
                  control={form.control}
                  name="online_link"
                  render={({ field }) => (
                    <FormItem className="md:col-span-2">
                      <FormLabel className="flex items-center gap-1">
                        <LinkIcon className="h-4 w-4" />
                        Online Meeting Link
                      </FormLabel>
                      <FormControl>
                        <Input placeholder="https://..." {...field} />
                      </FormControl>
                      <FormMessage />
                    </FormItem>
                  )}
                />
              )}

              <FormField
                control={form.control}
                name="start_datetime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Start Date & Time *</FormLabel>
                    <FormControl>
                      <DateTimePicker
                        value={field.value}
                        onChange={field.onChange}
                        placeholder="Select start date and time"
                        minDate={new Date()}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_datetime"
                render={({ field }) => {
                  const startDatetime = form.watch('start_datetime');
                  const minEndDate = startDatetime ? new Date(startDatetime) : new Date();

                  return (
                    <FormItem>
                      <FormLabel>End Date & Time *</FormLabel>
                      <FormControl>
                        <DateTimePicker
                          value={field.value}
                          onChange={field.onChange}
                          placeholder="Select end date and time"
                          minDate={minEndDate}
                        />
                      </FormControl>
                      <FormDescription className="text-xs">
                        Must be after start date/time
                      </FormDescription>
                      <FormMessage />
                    </FormItem>
                  );
                }}
              />

              <FormField
                control={form.control}
                name="status"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Status *</FormLabel>
                    <Select onValueChange={field.onChange} defaultValue={field.value}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select status" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="draft">Draft (Not visible to users)</SelectItem>
                        <SelectItem value="published">Published (Visible & Open for registration)</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {/* Registration & Targeting Section */}
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Target className="h-4 w-4" />
                  Registration & Targeting
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <FormField
                    control={form.control}
                    name="registration_type"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Registration Type *</FormLabel>
                        <Select onValueChange={field.onChange} defaultValue={field.value}>
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select registration type" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="open">Open Registration</SelectItem>
                            <SelectItem value="mandatory">Mandatory Attendance</SelectItem>
                            <SelectItem value="invite_only">Invite Only</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          {field.value === 'open' && 'Anyone in the organization can register'}
                          {field.value === 'mandatory' && 'Selected departments/users must attend'}
                          {field.value === 'invite_only' && 'Only selected departments/users can register'}
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="responsible_user_id"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel className="flex items-center gap-1">
                          <UserCheck className="h-4 w-4" />
                          Event Coordinator
                        </FormLabel>
                        <Select
                          onValueChange={field.onChange}
                          value={field.value || undefined}
                        >
                          <FormControl>
                            <SelectTrigger>
                              <SelectValue placeholder="Select coordinator (optional)" />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            {potentialCoordinators?.map((coord) => (
                              <SelectItem key={coord.id} value={coord.id}>
                                {coord.full_name} ({coord.email})
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <FormDescription>
                          Coordinator can manage attendance and registrations
                        </FormDescription>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                {/* Target selector for mandatory/invite_only */}
                {registrationType !== 'open' && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <div>
                        <p className="text-sm font-medium">
                          {registrationType === 'mandatory' ? 'Mandatory Attendees' : 'Invited Users'}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          Select specific users who {registrationType === 'mandatory' ? 'must attend' : 'can register'}
                        </p>
                      </div>
                      <Button
                        type="button"
                        variant="outline"
                        onClick={() => setShowUserSelector(true)}
                      >
                        <Users className="h-4 w-4 mr-2" />
                        Select Attendees ({selectedUsers.length + selectedDepartments.length})
                      </Button>
                    </div>

                    {registrationType === 'mandatory' && selectedUsers.length === 0 && selectedDepartments.length === 0 && (
                      <div className="flex items-start gap-2 p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg">
                        <AlertCircle className="h-4 w-4 text-amber-500 mt-0.5 shrink-0" />
                        <p className="text-sm text-amber-700 dark:text-amber-400">
                          Select users or departments who are required to attend this mandatory event
                        </p>
                      </div>
                    )}

                    {/* Selected targets display */}
                    {(selectedUserProfiles?.length || 0) + (selectedDepartmentProfiles?.length || 0) > 0 && (
                      <div className="flex flex-wrap gap-2 p-3 bg-muted/50 rounded-lg max-h-32 overflow-y-auto">
                        {/* Selected Departments */}
                        {selectedDepartmentProfiles?.map(dept => (
                          <Badge key={dept.id} variant="secondary" className="bg-primary/20 gap-1 border-primary/20">
                            <Building className="h-3 w-3" />
                            {dept.name}
                            <button
                              type="button"
                              onClick={() => setSelectedDepartments(prev => prev.filter(id => id !== dept.id))}
                              className="hover:bg-destructive/20 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}

                        {/* Selected Users */}
                        {selectedUserProfiles?.map(profile => (
                          <Badge key={profile.id} variant="secondary" className="gap-1">
                            {profile.full_name}
                            <button
                              type="button"
                              onClick={() => setSelectedUsers(prev => prev.filter(id => id !== profile.id))}
                              className="hover:bg-destructive/20 rounded-full p-0.5"
                            >
                              <X className="h-3 w-3" />
                            </button>
                          </Badge>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </CardContent>
            </Card>

            {/* User Selection Dialog */}
            <UserSelectionDialog
              open={showUserSelector}
              onOpenChange={setShowUserSelector}
              selectedUserIds={selectedUsers}
              onSelectionChange={setSelectedUsers}
              selectedDepartmentIds={selectedDepartments}
              onDepartmentSelectionChange={setSelectedDepartments}
              organizationId={organizationId}
              title={registrationType === 'mandatory' ? 'Select Mandatory Attendees' : 'Select Invited Users'}
            />

            {/* Video Conferencing Section */}
            <Card className="border-dashed">
              <CardHeader className="pb-3">
                <CardTitle className="text-base flex items-center gap-2">
                  <Video className="h-4 w-4" />
                  Video Conferencing
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <FormField
                  control={form.control}
                  name="enable_video_conference"
                  render={({ field }) => (
                    <FormItem className="flex items-center justify-between rounded-lg border p-3">
                      <div className="space-y-0.5">
                        <FormLabel>Enable Video Conference</FormLabel>
                        <p className="text-xs text-muted-foreground">
                          Allow participants to join via video meeting
                        </p>
                      </div>
                      <FormControl>
                        <Switch checked={field.value} onCheckedChange={field.onChange} />
                      </FormControl>
                    </FormItem>
                  )}
                />

                {enableVideoConference && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    <FormField
                      control={form.control}
                      name="max_video_participants"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>Max Video Participants</FormLabel>
                          <FormControl>
                            <Input
                              type="number"
                              min={2}
                              max={500}
                              {...field}
                              onChange={e => field.onChange(parseInt(e.target.value) || 100)}
                            />
                          </FormControl>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="allow_recording"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-3 pt-6">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="!mt-0">Allow Recording</FormLabel>
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name="require_lobby"
                      render={({ field }) => (
                        <FormItem className="flex items-center gap-3 pt-6">
                          <FormControl>
                            <Switch checked={field.value} onCheckedChange={field.onChange} />
                          </FormControl>
                          <FormLabel className="!mt-0">Enable Lobby</FormLabel>
                        </FormItem>
                      )}
                    />
                  </div>
                )}
              </CardContent>
            </Card>

            <div className="flex gap-3 pt-4">
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                {eventId ? 'Update Event' : 'Create Event'}
              </Button>
              <Button type="button" variant="outline" onClick={() => form.reset()}>
                Reset
              </Button>
            </div>
          </form>
        </Form>
      </CardContent>
    </Card>
  );
};

export default TrainingEventForm;