import { useQuery } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { DataTable } from '@/components/shared/DataTable';
import { Users, CheckCircle, XCircle, Clock } from 'lucide-react';
import { safeProfileName, safeProfileEmail } from '@/lib/utils';

interface TrainingRegistrationsProps {
  eventId: string;
}

const TrainingRegistrations = ({ eventId }: TrainingRegistrationsProps) => {
  const { data: event } = useQuery({
    queryKey: ['training-event', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_events')
        .select('title, max_participants')
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  const { data: registrations, isLoading } = useQuery({
    queryKey: ['training-registrations', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_registrations')
        .select(`
          id,
          user_id,
          registered_at,
          status,
          reminder_sent,
          profiles:user_id (full_name, email)
        `)
        .eq('event_id', eventId)
        .order('registered_at', { ascending: true });
      if (error) throw error;
      return data;
    },
  });

  if (isLoading) {
    return <LoadingState message="Loading registrations..." />;
  }

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'registered':
        return <Badge className="bg-emerald-500 text-white"><CheckCircle className="h-3 w-3 mr-1" />Registered</Badge>;
      case 'cancelled':
        return <Badge variant="secondary"><XCircle className="h-3 w-3 mr-1" />Cancelled</Badge>;
      case 'attended':
        return <Badge className="bg-blue-500 text-white"><CheckCircle className="h-3 w-3 mr-1" />Attended</Badge>;
      default:
        return <Badge variant="outline"><Clock className="h-3 w-3 mr-1" />{status}</Badge>;
    }
  };

  type RegistrationRow = {
    id: string;
    user_id: string;
    registered_at: string;
    status: string;
    reminder_sent: boolean;
    profiles: { full_name: string; email: string } | null;
  };

  const columns = [
    {
      key: 'profiles',
      header: 'Participant',
      cell: (row: RegistrationRow) => (
        <div>
          <p className="font-medium">{safeProfileName(row.profiles)}</p>
          <p className="text-sm text-muted-foreground">{safeProfileEmail(row.profiles)}</p>
        </div>
      ),
    },
    {
      key: 'registered_at',
      header: 'Registered At',
      cell: (row: RegistrationRow) => format(new Date(row.registered_at), 'MMM d, yyyy h:mm a'),
    },
    {
      key: 'status',
      header: 'Status',
      cell: (row: RegistrationRow) => getStatusBadge(row.status),
    },
  ];

  const registeredCount = registrations?.filter(r => r.status === 'registered').length || 0;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Users className="h-5 w-5" />
          Registrations for {event?.title}
        </CardTitle>
        <CardDescription>
          {registeredCount} registered
          {event?.max_participants && ` / ${event.max_participants} max capacity`}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {!registrations || registrations.length === 0 ? (
          <EmptyState
            icon={Users}
            title="No Registrations"
            description="No one has registered for this event yet."
          />
        ) : (
          <DataTable
            data={registrations}
            columns={columns}
          />
        )}
      </CardContent>
    </Card>
  );
};

export default TrainingRegistrations;
