import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/lib/auth';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import { LoadingState } from '@/components/layout/LoadingState';
import { EmptyState } from '@/components/layout/EmptyState';
import { toast } from 'sonner';
import { format } from 'date-fns';
import {
    Download,
    Users,
    CheckCircle,
    XCircle,
    Clock,
    Search,
    UserCheck,
    Wifi,
    Users2,
    Calendar,
} from 'lucide-react';
import * as XLSX from 'xlsx';

interface AttendanceChecklistModalProps {
    eventId: string;
    isOpen: boolean;
    onClose: () => void;
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

const AttendanceChecklistModal = ({ eventId, isOpen, onClose }: AttendanceChecklistModalProps) => {
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
        enabled: !!eventId && isOpen,
    });

    // Fetch all registrations with their attendance status
    const { data: attendees, isLoading } = useQuery({
        queryKey: ['event-attendees-checklist', eventId],
        queryFn: async () => {
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

            const { data: attendance, error: attError } = await supabase
                .from('training_attendance')
                .select('*')
                .eq('event_id', eventId);

            if (attError) throw attError;

            const merged = registrations?.map(reg => ({
                ...reg,
                attendance: attendance?.find(a => a.user_id === reg.user_id) || null,
            }));

            return merged as AttendeeRecord[];
        },
        enabled: !!eventId && isOpen,
    });

    // Manual check-in mutation
    const checkInMutation = useMutation({
        mutationFn: async ({ userId, checkIn }: { userId: string; checkIn: boolean }) => {
            if (checkIn) {
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
            return <Badge variant="outline" className="text-muted-foreground">Pending</Badge>;
        }
        if (record.attendance.attendance_status === 'absent') {
            return <Badge variant="destructive" className="gap-1 animate-in fade-in zoom-in duration-300"><XCircle className="h-3 w-3" />Absent</Badge>;
        }
        if (record.attendance.check_in_method === 'auto') {
            return <Badge className="bg-blue-500 text-white gap-1 animate-in fade-in zoom-in duration-300"><Wifi className="h-3 w-3" />Online</Badge>;
        }
        if (record.attendance.checked_in_at) {
            return <Badge className="bg-emerald-500 text-white gap-1 animate-in fade-in zoom-in duration-300"><CheckCircle className="h-3 w-3" />Checked In</Badge>;
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
    const attendancePercentage = totalCount > 0 ? Math.round((checkedInCount / totalCount) * 100) : 0;

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="max-w-4xl w-[95vw] lg:w-[80vw] h-[90vh] flex flex-col p-0 gap-0 overflow-hidden bg-background ring-offset-background transition-colors duration-300">
                {/* Header Section */}
                <div className="p-6 md:p-8 space-y-6 bg-gradient-to-b from-muted/30 to-background border-b">
                    <DialogHeader>
                        <div className="flex flex-col md:flex-row md:items-start justify-between gap-6">
                            <div className="space-y-1.5">
                                <DialogTitle className="text-2xl font-bold flex items-center gap-3">
                                    <div className="p-2 bg-primary/10 rounded-lg">
                                        <Users2 className="h-6 w-6 text-primary" />
                                    </div>
                                    Attendance Checklist
                                </DialogTitle>
                                <DialogDescription className="text-base flex items-center gap-2">
                                    <Calendar className="h-4 w-4 text-muted-foreground" />
                                    {event?.title} • {event && format(new Date(event.start_datetime), 'PPP')}
                                </DialogDescription>
                            </div>
                            <div className="flex items-center gap-3 self-end md:self-start">
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl h-10 px-4 font-medium transition-all hover:bg-primary hover:text-primary-foreground group"
                                    onClick={() => bulkCheckInMutation.mutate()}
                                    disabled={bulkCheckInMutation.isPending}
                                >
                                    <CheckCircle className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
                                    Check All Present
                                </Button>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    className="rounded-xl h-10 px-4 font-medium transition-all hover:bg-primary hover:text-primary-foreground group"
                                    onClick={handleExport}
                                >
                                    <Download className="h-4 w-4 mr-2 group-hover:scale-110 transition-transform" />
                                    Export
                                </Button>
                            </div>
                        </div>
                    </DialogHeader>

                    {/* Stats Bar */}
                    <div className="grid grid-cols-1 sm:grid-cols-[1fr_1fr_auto] items-center gap-6 p-6 bg-muted/40 backdrop-blur-sm rounded-3xl border border-border/50 shadow-sm transition-all hover:shadow-md">
                        <div className="flex items-center gap-4 px-2">
                            <div className="p-3 bg-primary/10 rounded-2xl">
                                <Users className="h-5 w-5 text-primary" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold tracking-tight">{totalCount}</p>
                                <p className="text-sm font-medium text-muted-foreground">Registered</p>
                            </div>
                        </div>

                        <div className="flex items-center gap-4 px-2 border-l border-border/50 sm:pl-8">
                            <div className="p-3 bg-emerald-500/10 rounded-2xl">
                                <CheckCircle className="h-5 w-5 text-emerald-500" />
                            </div>
                            <div>
                                <p className="text-2xl font-bold tracking-tight">{checkedInCount}</p>
                                <p className="text-sm font-medium text-muted-foreground">Checked In</p>
                            </div>
                        </div>

                        <div className="flex items-center justify-center sm:pl-8 border-l border-border/50">
                            <div className="relative h-16 w-16">
                                <svg className="h-full w-full" viewBox="0 0 36 36">
                                    <path
                                        className="stroke-muted"
                                        strokeWidth="3.5"
                                        fill="none"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    />
                                    <path
                                        className="stroke-primary transition-all duration-1000 ease-out"
                                        strokeWidth="3.5"
                                        strokeDasharray={`${attendancePercentage}, 100`}
                                        strokeLinecap="round"
                                        fill="none"
                                        d="M18 2.0845 a 15.9155 15.9155 0 0 1 0 31.831 a 15.9155 15.9155 0 0 1 0 -31.831"
                                    />
                                    <text x="18" y="21.5" className="text-[9px] font-bold fill-foreground" textAnchor="middle">
                                        {attendancePercentage}%
                                    </text>
                                </svg>
                            </div>
                        </div>
                    </div>

                    {/* Search Bar */}
                    <div className="relative group">
                        <Search className="absolute left-4 top-1/2 transform -translate-y-1/2 h-5 w-5 text-muted-foreground group-focus-within:text-primary transition-colors" />
                        <Input
                            placeholder="Search by name or email..."
                            value={searchTerm}
                            onChange={(e) => setSearchTerm(e.target.value)}
                            className="pl-12 h-12 rounded-2xl bg-muted/30 border-muted-foreground/20 focus:ring-primary/20 focus:border-primary transition-all placeholder:text-muted-foreground/60 shadow-sm"
                        />
                    </div>
                </div>

                {/* Content Section */}
                <div className="flex-1 overflow-y-auto px-6 py-4 md:px-8">
                    {isLoading ? (
                        <div className="h-full flex items-center justify-center">
                            <LoadingState message="Fetching attendee records..." />
                        </div>
                    ) : filteredAttendees && filteredAttendees.length > 0 ? (
                        <div className="rounded-2xl border bg-card/50 overflow-hidden shadow-sm">
                            <Table>
                                <TableHeader className="bg-muted/50">
                                    <TableRow className="hover:bg-transparent border-none">
                                        <TableHead className="w-[80px] text-center font-semibold">Check</TableHead>
                                        <TableHead className="font-semibold">Name</TableHead>
                                        <TableHead className="hidden md:table-cell font-semibold">Email</TableHead>
                                        <TableHead className="font-semibold">Status</TableHead>
                                        <TableHead className="text-right font-semibold">Time</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredAttendees.map((record) => {
                                        const isCheckedIn = Boolean(record.attendance?.checked_in_at || record.attendance?.check_in_method === 'auto');

                                        return (
                                            <TableRow key={record.id} className="group hover:bg-muted/30 transition-colors border-border/50 last:border-0">
                                                <TableCell className="text-center py-4">
                                                    <Checkbox
                                                        checked={isCheckedIn}
                                                        onCheckedChange={(checked) => {
                                                            checkInMutation.mutate({
                                                                userId: record.user_id,
                                                                checkIn: checked as boolean
                                                            });
                                                        }}
                                                        className="h-5 w-5 rounded-md border-2 transition-all data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                                                    />
                                                </TableCell>
                                                <TableCell className="py-4 font-medium">
                                                    <div className="flex items-center gap-3">
                                                        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-xs font-bold text-primary shrink-0">
                                                            {(record.profiles?.full_name || 'U').charAt(0).toUpperCase()}
                                                        </div>
                                                        <span className="truncate max-w-[150px] sm:max-w-none">
                                                            {record.profiles?.full_name || 'Unknown'}
                                                        </span>
                                                    </div>
                                                </TableCell>
                                                <TableCell className="hidden md:table-cell py-4 text-muted-foreground">
                                                    <span className="truncate block max-w-[200px]">
                                                        {record.profiles?.email || 'N/A'}
                                                    </span>
                                                </TableCell>
                                                <TableCell className="py-4">
                                                    {getStatusBadge(record)}
                                                </TableCell>
                                                <TableCell className="py-4 text-right">
                                                    {record.attendance?.checked_in_at ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-emerald-500/5 text-emerald-600 font-medium text-xs whitespace-nowrap">
                                                            <Clock className="h-3 w-3" />
                                                            {format(new Date(record.attendance.checked_in_at), 'h:mm a')}
                                                        </span>
                                                    ) : record.attendance?.joined_at ? (
                                                        <span className="inline-flex items-center gap-1.5 px-2 py-1 rounded-lg bg-blue-500/5 text-blue-600 font-medium text-xs whitespace-nowrap">
                                                            <Wifi className="h-3 w-3" />
                                                            {format(new Date(record.attendance.joined_at), 'h:mm a')}
                                                        </span>
                                                    ) : (
                                                        <span className="text-muted-foreground/40 font-bold">—</span>
                                                    )}
                                                </TableCell>
                                            </TableRow>
                                        );
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    ) : (
                        <div className="h-full flex items-center justify-center py-12">
                            <EmptyState
                                icon={Users}
                                title="No Registrations"
                                description="No one has registered for this event yet."
                                className="opacity-75"
                            />
                        </div>
                    )}
                </div>
            </DialogContent>
        </Dialog>
    );
};

export default AttendanceChecklistModal;
