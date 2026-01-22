import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Mail, Send, Users, Bell, CheckCircle, Clock, AlertCircle, Megaphone } from "lucide-react";
import { format } from "date-fns";

export function EmailManagement() {
  const queryClient = useQueryClient();
  const [broadcastOpen, setBroadcastOpen] = useState(false);
  const [broadcastForm, setBroadcastForm] = useState({
    title: '',
    message: '',
    targetRole: 'all',
  });

  // Get all users with their roles
  const { data: users } = useQuery({
    queryKey: ['users-for-email'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select(`
          id,
          email,
          full_name,
          is_active,
          user_roles (role)
        `)
        .eq('is_active', true);
      if (error) throw error;
      return data;
    },
  });

  // Get recent notifications as a proxy for "sent emails"
  const { data: recentNotifications } = useQuery({
    queryKey: ['recent-notifications-admin'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('notifications')
        .select(`
          id,
          title,
          message,
          type,
          created_at,
          is_read,
          user_id
        `)
        .order('created_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Get notification statistics
  const { data: notificationStats } = useQuery({
    queryKey: ['notification-stats'],
    queryFn: async () => {
      const { count: total } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true });

      const { count: unread } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .eq('is_read', false);

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const { count: todaySent } = await supabase
        .from('notifications')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', today.toISOString());

      return {
        total: total || 0,
        unread: unread || 0,
        todaySent: todaySent || 0,
      };
    },
  });

  // Send broadcast notification
  const sendBroadcastMutation = useMutation({
    mutationFn: async (form: typeof broadcastForm) => {
      if (!users) return;

      let targetUsers = users;
      if (form.targetRole !== 'all') {
        targetUsers = users.filter(u =>
          u.user_roles?.some(r => r.role === form.targetRole)
        );
      }

      const notifications = targetUsers.map(user => ({
        user_id: user.id,
        title: form.title,
        message: form.message,
        type: 'system_announcement',
      }));

      // Insert notifications in batches
      const batchSize = 100;
      for (let i = 0; i < notifications.length; i += batchSize) {
        const batch = notifications.slice(i, i + batchSize);
        const { error } = await supabase
          .from('notifications')
          .insert(batch);
        if (error) throw error;
      }

      return { count: notifications.length };
    },
    onSuccess: (result) => {
      queryClient.invalidateQueries({ queryKey: ['recent-notifications-admin'] });
      queryClient.invalidateQueries({ queryKey: ['notification-stats'] });
      toast.success(`Broadcast sent to ${result?.count || 0} users`);
      setBroadcastOpen(false);
      setBroadcastForm({ title: '', message: '', targetRole: 'all' });
    },
    onError: (error) => {
      toast.error('Failed to send broadcast: ' + error.message);
    },
  });

  const getTypeBadge = (type: string) => {
    const types: Record<string, { label: string; className: string }> = {
      system_announcement: { label: 'Announcement', className: 'bg-purple-500/20 text-purple-400' },
      vacation: { label: 'Vacation', className: 'bg-blue-500/20 text-blue-400' },
      task: { label: 'Task', className: 'bg-green-500/20 text-green-400' },
      schedule: { label: 'Schedule', className: 'bg-yellow-500/20 text-yellow-400' },
      training: { label: 'Training', className: 'bg-brand-purple/20 text-brand-purple dark:text-indigo-300' },
    };
    const config = types[type] || { label: type, className: 'bg-gray-500/20 text-gray-400' };
    return <Badge className={config.className}>{config.label}</Badge>;
  };

  const roleOptions = [
    { value: 'all', label: 'All Users' },
    { value: 'super_admin', label: 'Super Admins' },
    { value: 'organization_admin', label: 'Organization Admins' },
    { value: 'general_admin', label: 'General Admins' },
    { value: 'workplace_supervisor', label: 'Workplace Supervisors' },
    { value: 'facility_supervisor', label: 'Facility Supervisors' },
    { value: 'department_head', label: 'Department Heads' },
    { value: 'staff', label: 'Staff' },
  ];

  const targetCount = broadcastForm.targetRole === 'all'
    ? users?.length || 0
    : users?.filter(u => u.user_roles?.some(r => r.role === broadcastForm.targetRole)).length || 0;

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 sm:gap-4">
        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-lg bg-primary/10">
                <Mail className="h-4 w-4 sm:h-6 sm:w-6 text-primary" />
              </div>
              <div>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Total</p>
                <p className="text-lg sm:text-2xl font-bold">{notificationStats?.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-lg bg-yellow-500/10">
                <Clock className="h-4 w-4 sm:h-6 sm:w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Unread</p>
                <p className="text-lg sm:text-2xl font-bold">{notificationStats?.unread || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-lg bg-green-500/10">
                <Send className="h-4 w-4 sm:h-6 sm:w-6 text-green-500" />
              </div>
              <div>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Today</p>
                <p className="text-lg sm:text-2xl font-bold">{notificationStats?.todaySent || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="p-3 sm:pt-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-2 sm:gap-4">
              <div className="p-2 sm:p-3 rounded-lg bg-blue-500/10">
                <Users className="h-4 w-4 sm:h-6 sm:w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-[10px] sm:text-sm text-muted-foreground">Users</p>
                <p className="text-lg sm:text-2xl font-bold">{users?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Broadcast Section */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Megaphone className="h-5 w-5" />
              System Broadcast
            </span>
            <Dialog open={broadcastOpen} onOpenChange={setBroadcastOpen}>
              <DialogTrigger asChild>
                <Button size="sm" className="sm:h-10">
                  <Send className="h-3.5 w-3.5 sm:h-4 sm:w-4 mr-1.5 sm:mr-2" />
                  <span className="text-[11px] sm:text-sm">New <span className="hidden xs:inline">Broadcast</span></span>
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-[500px] w-[95vw] rounded-xl">
                <DialogHeader>
                  <DialogTitle>Send System Broadcast</DialogTitle>
                </DialogHeader>
                <div className="space-y-4">
                  <div className="space-y-2">
                    <Label>Target Audience</Label>
                    <Select
                      value={broadcastForm.targetRole}
                      onValueChange={(v) => setBroadcastForm(f => ({ ...f, targetRole: v }))}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {roleOptions.map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <p className="text-sm text-muted-foreground">
                      Will be sent to {targetCount} users
                    </p>
                  </div>
                  <div className="space-y-2">
                    <Label>Title</Label>
                    <Input
                      placeholder="Announcement title..."
                      value={broadcastForm.title}
                      onChange={(e) => setBroadcastForm(f => ({ ...f, title: e.target.value }))}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>Message</Label>
                    <Textarea
                      placeholder="Your message..."
                      rows={4}
                      value={broadcastForm.message}
                      onChange={(e) => setBroadcastForm(f => ({ ...f, message: e.target.value }))}
                    />
                  </div>
                </div>
                <DialogFooter>
                  <Button variant="outline" onClick={() => setBroadcastOpen(false)}>
                    Cancel
                  </Button>
                  <Button
                    onClick={() => sendBroadcastMutation.mutate(broadcastForm)}
                    disabled={!broadcastForm.title || !broadcastForm.message || sendBroadcastMutation.isPending}
                  >
                    <Send className="h-4 w-4 mr-2" />
                    Send to {targetCount} users
                  </Button>
                </DialogFooter>
              </DialogContent>
            </Dialog>
          </CardTitle>
          <CardDescription>
            Send system-wide announcements to all users or specific role groups
          </CardDescription>
        </CardHeader>
      </Card>

      {/* Recent Notifications */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Bell className="h-5 w-5" />
            Recent Notifications
          </CardTitle>
          <CardDescription>
            Latest system notifications sent to users
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[400px] -mx-4 sm:mx-0">
            {/* Mobile List View - Visible on small screens */}
            <div className="divide-y block sm:hidden">
              {recentNotifications?.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  No notifications sent yet
                </div>
              ) : (
                recentNotifications?.map(notification => (
                  <div key={notification.id} className="p-4 space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-mono text-[10px] text-muted-foreground">
                        {format(new Date(notification.created_at), 'MMM d, HH:mm')}
                      </span>
                      {getTypeBadge(notification.type)}
                    </div>
                    <p className="font-semibold text-sm">{notification.title}</p>
                    <p className="text-xs text-muted-foreground line-clamp-2">
                      {notification.message}
                    </p>
                    <div className="flex justify-end pt-1">
                      {notification.is_read ? (
                        <Badge variant="outline" className="text-[10px] py-0 h-5 border-green-500/50 text-green-500">
                          <CheckCircle className="h-3 w-3 mr-1" />
                          Read
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] py-0 h-5 border-yellow-500/50 text-yellow-500">
                          <Clock className="h-3 w-3 mr-1" />
                          Pending
                        </Badge>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Desktop Table View - Hidden on small screens */}
            <div className="hidden sm:block">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[120px]">Timestamp</TableHead>
                    <TableHead className="w-[130px]">Type</TableHead>
                    <TableHead className="min-w-[150px]">Title</TableHead>
                    <TableHead className="min-w-[200px]">Message</TableHead>
                    <TableHead className="text-right">Status</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {recentNotifications?.map(notification => (
                    <TableRow key={notification.id}>
                      <TableCell className="font-mono text-xs whitespace-nowrap">
                        {format(new Date(notification.created_at), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell>{getTypeBadge(notification.type)}</TableCell>
                      <TableCell className="font-medium">{notification.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                        {notification.message}
                      </TableCell>
                      <TableCell className="text-right">
                        {notification.is_read ? (
                          <Badge className="bg-green-500/20 text-green-400">
                            <CheckCircle className="h-3 w-3 mr-1" />
                            Read
                          </Badge>
                        ) : (
                          <Badge className="bg-yellow-500/20 text-yellow-400">
                            <Clock className="h-3 w-3 mr-1" />
                            Pending
                          </Badge>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
