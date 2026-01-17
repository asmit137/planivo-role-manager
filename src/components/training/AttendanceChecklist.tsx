import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { Download, Users, CheckCircle, XCircle, Clock, Search, UserCheck, Wifi } from 'lucide-react';
import * as XLSX from 'xlsx';

interface AttendanceChecklistProps {
  eventId: string;
}

interface AttendeeRecord {
  id: string;
  user_id: string;
  status: string;
  profiles: {
    full_name: string;
    email: string;
  } | null;
  attendance?: {
    id: string;
    joined_at: string;
    left_at: string | null;
    duration_minutes: number | null;
    attendance_status: string;
    check_in_method: string;
    checked_in_at: string | null;
  } | null;
}

const AttendanceChecklist = ({ eventId }: AttendanceChecklistProps) => {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const [searchTerm, setSearchTerm] = useState('');

  // Fetch event details
  const { data: event } = useQuery({
    queryKey: ['training-event', eventId],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('training_events')
        .select('*, responsible_user:responsible_user_id(full_name)')
        .eq('id', eventId)
        .single();
      if (error) throw error;
      return data;
    },
  });

  // Fetch all registrations with their attendance status
  const { data: attendees, isLoading } = useQuery({
    queryKey: ['event-attendees-checklist', eventId],
    queryFn: async () => {
      // First get all registrations
      const { data: registrations, error: regError } = await supabase
        .from('training_registrations')
        .select(`
          id,
          user_id,
          status,
          profiles!training_registrations_user_id_fkey (
            full_name,
            email
          )
        `)
        .eq('event_id', eventId);

      if (regError) throw regError;

      // Then get attendance records
      const { data: attendance, error: attError } = await supabase
        .from('training_attendance')
        .select('*')
        .eq('event_id', eventId);

      if (attError) throw attError;

      // Merge data
      const merged = registrations?.map(reg => ({
        ...reg,
        attendance: attendance?.find(a => a.user_id === reg.user_id) || null,
      }));

      return merged as AttendeeRecord[];
    },
  });

  // Manual check-in mutation
  const checkInMutation = useMutation({
    mutationFn: async ({ userId, checkIn }: { userId: string; checkIn: boolean }) => {
      if (checkIn) {
        // Create or update attendance record
        const { data: existing } = await supabase
          .from('training_attendance')
          .select('id')
          .eq('event_id', eventId)
          .eq('user_id', userId)
          .maybeSingle();

        if (existing) {
          const { error } = await supabase
            .from('training_attendance')
            .update({
              check_in_method: 'manual',
              checked_in_at: new Date().toISOString(),
              checked_in_by: user?.id,
              attendance_status: 'present',
            })
            .eq('id', existing.id);
          if (error) throw error;
        } else {
          const { error } = await supabase
            .from('training_attendance')
            .insert({
              event_id: eventId,
              user_id: userId,
              joined_at: new Date().toISOString(),
              check_in_method: 'manual',
              checked_in_at: new Date().toISOString(),
              checked_in_by: user?.id,
              attendance_status: 'present',
            });
          if (error) throw error;
        }
      } else {
        // Mark as absent by removing check-in
        const { error } = await supabase
          .from('training_attendance')
          .update({
            attendance_status: 'absent',
            checked_in_at: null,
            checked_in_by: null,
          })
          .eq('event_id', eventId)
          .eq('user_id', userId);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-attendees-checklist', eventId] });
      toast.success('Attendance updated');
    },
    onError: (error: Error) => {
      toast.error(error.message || 'Failed to update attendance');
    },
  });

  // Bulk check-in all
  const bulkCheckInMutation = useMutation({
    mutationFn: async () => {
      const unchecked = attendees?.filter(a => !a.attendance?.checked_in_at && a.attendance?.check_in_method !== 'auto') || [];
      if (unchecked.length === 0) {
        throw new Error('No pending attendees to check in');
      }

      const upsertData = unchecked.map(attendee => ({
        event_id: eventId,
        user_id: attendee.user_id,
        joined_at: attendee.attendance?.joined_at || new Date().toISOString(),
        check_in_method: 'manual',
        checked_in_at: new Date().toISOString(),
        checked_in_by: user?.id,
        attendance_status: 'present',
      }));

      const { error } = await supabase
        .from('training_attendance')
        .upsert(upsertData, {
          onConflict: 'event_id,user_id',
          ignoreDuplicates: false
        });

      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['event-attendees-checklist', eventId] });
      toast.success('Successfully checked in all available attendees');
    },
    onError: (error: Error) => {
      console.error('Bulk check-in error:', error);
      toast.error(`Check-in failed: ${error.message}`);
    },
  });

  const handleExport = () => {
    if (!attendees || !event) return;

    const exportData = attendees.map(record => ({
      'Name': record.profiles?.full_name || 'Unknown',
      'Email': record.profiles?.email || 'N/A',
      'Registration Status': record.status,
      'Attendance Status': getAttendanceStatus(record),
      'Check-in Method': record.attendance?.check_in_method || 'N/A',
      'Check-in Time': record.attendance?.checked_in_at
        ? format(new Date(record.attendance.checked_in_at), 'PPpp')
        : 'N/A',
      'Duration (minutes)': record.attendance?.duration_minutes || 0,
    }));

    const ws = XLSX.utils.json_to_sheet(exportData);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Attendance');
    XLSX.writeFile(wb, `attendance-${event.title.replace(/\s+/g, '-')}-${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
  };

  const getAttendanceStatus = (record: AttendeeRecord) => {
    if (!record.attendance) return 'Not Checked In';
    if (record.attendance.attendance_status === 'absent') return 'Absent';
    if (record.attendance.check_in_method === 'manual') return 'Checked In (Manual)';
    if (record.attendance.check_in_method === 'auto') return 'Joined Online';
    return 'Present';
  };

  const getStatusBadge = (record: AttendeeRecord) => {
    if (!record.attendance) {
      return <Badge variant="outline" className="text-muted-foreground">⬜ Pending</Badge>;
    }
    if (record.attendance.attendance_status === 'absent') {
      return <Badge variant="destructive"><XCircle className="h-3 w-3 mr-1" />Absent</Badge>;
    }
    if (record.attendance.check_in_method === 'auto') {
      return <Badge className="bg-blue-500 text-white"><Wifi className="h-3 w-3 mr-1" />Online</Badge>;
    }
    if (record.attendance.checked_in_at) {
      return <Badge className="bg-emerald-500 text-white"><CheckCircle className="h-3 w-3 mr-1" />Checked In</Badge>;
    }
    return <Badge variant="secondary">Unknown</Badge>;
  };

  const filteredAttendees = attendees?.filter(a => {
    const name = a.profiles?.full_name?.toLowerCase() || '';
    const email = a.profiles?.email?.toLowerCase() || '';
    const search = searchTerm.toLowerCase();
    return name.includes(search) || email.includes(search);
  });

  const checkedInCount = attendees?.filter(a =>
    a.attendance?.checked_in_at || a.attendance?.check_in_method === 'auto'
  ).length || 0;
  const totalCount = attendees?.length || 0;

  if (isLoading) {
    return <LoadingState message="Loading attendance list..." />;
  }

  return (
    <Card>
      <CardHeader>
        <div className="flex flex-col sm:flex-row gap-4 sm:items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <UserCheck className="h-5 w-5" />
              Attendance Checklist
            </CardTitle>
            <CardDescription>
              {event?.title} - {event && format(new Date(event.start_datetime), 'PPP')}
            </CardDescription>
          </div>
          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => bulkCheckInMutation.mutate()}
              disabled={bulkCheckInMutation.isPending}
            >
              <CheckCircle className="h-4 w-4 mr-2" />
              Check All Present
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport}>
              <Download className="h-4 w-4 mr-2" />
              Export
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Stats */}
        <div className="flex items-center gap-4 p-3 bg-muted/50 rounded-lg">
          <div className="flex items-center gap-2">
            <Users className="h-5 w-5 text-muted-foreground" />
            <span className="font-medium">{totalCount}</span>
            <span className="text-muted-foreground">Registered</span>
          </div>
          <div className="flex items-center gap-2">
            <CheckCircle className="h-5 w-5 text-emerald-500" />
            <span className="font-medium">{checkedInCount}</span>
            <span className="text-muted-foreground">Checked In</span>
          </div>
          <div className="ml-auto">
            <Badge variant="outline" className="text-lg px-3 py-1">
              {totalCount > 0 ? Math.round((checkedInCount / totalCount) * 100) : 0}%
            </Badge>
          </div>
        </div>

        {/* Search */}
        <div className="relative">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search by name or email..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            className="pl-9"
          />
        </div>

        {/* Attendee Table */}
        {filteredAttendees && filteredAttendees.length > 0 ? (
          <div className="rounded-md border overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[50px]">Check</TableHead>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Time</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAttendees.map((record) => {
                  const isCheckedIn = Boolean(record.attendance?.checked_in_at || record.attendance?.check_in_method === 'auto');

                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <Checkbox
                          checked={isCheckedIn}
                          onCheckedChange={(checked) => {
                            checkInMutation.mutate({
                              userId: record.user_id,
                              checkIn: checked as boolean
                            });
                          }}
                        />
                      </TableCell>
                      <TableCell className="font-medium">
                        {record.profiles?.full_name || 'Unknown'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {record.profiles?.email || 'N/A'}
                      </TableCell>
                      <TableCell>
                        {getStatusBadge(record)}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {record.attendance?.checked_in_at ? (
                          <span className="flex items-center gap-1">
                            <Clock className="h-3 w-3" />
                            {format(new Date(record.attendance.checked_in_at), 'h:mm a')}
                          </span>
                        ) : record.attendance?.joined_at ? (
                          <span className="flex items-center gap-1">
                            <Wifi className="h-3 w-3" />
                            {format(new Date(record.attendance.joined_at), 'h:mm a')}
                          </span>
                        ) : (
                          '-'
                        )}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        ) : (
          <EmptyState
            icon={Users}
            title="No Registrations"
            description="No one has registered for this event yet."
          />
        )}
      </CardContent>
    </Card>
  );
};

export default AttendanceChecklist;