import { useState } from 'react';
import { useForm } from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { z } from 'zod';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { useUserRole } from '@/hooks/useUserRole';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { toast } from 'sonner';
import { Loader2, Calendar, MapPin, Link as LinkIcon, Users } from 'lucide-react';

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
});

type EventFormData = z.infer<typeof eventSchema>;

interface TrainingEventFormProps {
  eventId?: string;
  onSuccess?: () => void;
}

const TrainingEventForm = ({ eventId, onSuccess }: TrainingEventFormProps) => {
  const { user } = useAuth();
  const { data: roles } = useUserRole();
  const queryClient = useQueryClient();
  const [isSubmitting, setIsSubmitting] = useState(false);

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
      status: (existingEvent?.status as EventFormData['status']) || 'draft',
    },
  });

  const locationType = form.watch('location_type');

  const createEventMutation = useMutation({
    mutationFn: async (data: EventFormData) => {
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
      };

      if (eventId) {
        const { error } = await supabase
          .from('training_events')
          .update(eventData)
          .eq('id', eventId);
        if (error) throw error;
      } else {
        const { error } = await supabase
          .from('training_events')
          .insert([eventData]);
        if (error) throw error;
      }

      // If publishing, create notifications for all org users
      if (data.status === 'published' && !eventId) {
        // Get all users in the organization's workspaces
        const { data: orgUsers } = await supabase
          .from('user_roles')
          .select('user_id, workspaces!inner(organization_id)')
          .eq('workspaces.organization_id', data.organization_id);
        
        if (orgUsers && orgUsers.length > 0) {
          const uniqueUserIds = [...new Set(orgUsers.map(u => u.user_id))];
          const notifications = uniqueUserIds.map(userId => ({
            user_id: userId,
            title: 'New Training Event',
            message: `A new training event "${data.title}" has been scheduled`,
            type: 'system',
          }));

          await supabase.from('notifications').insert(notifications);
        }
      }
    },
    onSuccess: () => {
      toast.success(eventId ? 'Event updated successfully' : 'Event created successfully');
      queryClient.invalidateQueries({ queryKey: ['training-events'] });
      form.reset();
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
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="end_datetime"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>End Date & Time *</FormLabel>
                    <FormControl>
                      <Input type="datetime-local" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
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
