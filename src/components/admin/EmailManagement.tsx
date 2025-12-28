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
      training: { label: 'Training', className: 'bg-cyan-500/20 text-cyan-400' },
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
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Mail className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Notifications</p>
                <p className="text-2xl font-bold">{notificationStats?.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <Clock className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Unread</p>
                <p className="text-2xl font-bold">{notificationStats?.unread || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <Send className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Sent Today</p>
                <p className="text-2xl font-bold">{notificationStats?.todaySent || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Users className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">{users?.length || 0}</p>
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
                <Button>
                  <Send className="h-4 w-4 mr-2" />
                  New Broadcast
                </Button>
              </DialogTrigger>
              <DialogContent>
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
          <ScrollArea className="h-[400px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Title</TableHead>
                  <TableHead>Message</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentNotifications?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No notifications sent yet
                    </TableCell>
                  </TableRow>
                ) : (
                  recentNotifications?.map(notification => (
                    <TableRow key={notification.id}>
                      <TableCell className="font-mono text-xs">
                        {format(new Date(notification.created_at), 'MMM d, HH:mm')}
                      </TableCell>
                      <TableCell>{getTypeBadge(notification.type)}</TableCell>
                      <TableCell className="font-medium">{notification.title}</TableCell>
                      <TableCell className="text-sm text-muted-foreground max-w-[200px] truncate">
                        {notification.message}
                      </TableCell>
                      <TableCell>
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
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
