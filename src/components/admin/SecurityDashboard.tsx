import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Progress } from "@/components/ui/progress";
import { Shield, AlertTriangle, Lock, Users, Clock, Activity, CheckCircle, XCircle } from "lucide-react";
import { format, subHours, subDays } from "date-fns";

export function SecurityDashboard() {
  // Rate limit statistics
  const { data: rateLimits } = useQuery({
    queryKey: ['rate-limits'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('rate_limits')
        .select('*')
        .order('window_start', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
  });

  // Recent audit activity for security-relevant tables
  const { data: securityAuditLogs } = useQuery({
    queryKey: ['security-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .in('table_name', ['user_roles', 'profiles', 'organizations', 'user_module_access'])
        .order('performed_at', { ascending: false })
        .limit(20);
      if (error) throw error;
      return data;
    },
  });

  // User role statistics
  const { data: roleStats } = useQuery({
    queryKey: ['role-statistics'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('user_roles')
        .select('role');
      if (error) throw error;
      
      const counts: Record<string, number> = {};
      data.forEach(r => {
        counts[r.role] = (counts[r.role] || 0) + 1;
      });
      return counts;
    },
  });

  // Active users count (users with roles)
  const { data: userStats } = useQuery({
    queryKey: ['user-stats'],
    queryFn: async () => {
      const { data: activeUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact' })
        .eq('is_active', true);
      
      const { data: inactiveUsers } = await supabase
        .from('profiles')
        .select('id', { count: 'exact' })
        .eq('is_active', false);
      
      const { data: forcePasswordChange } = await supabase
        .from('profiles')
        .select('id', { count: 'exact' })
        .eq('force_password_change', true);

      return {
        active: activeUsers?.length || 0,
        inactive: inactiveUsers?.length || 0,
        forcePasswordChange: forcePasswordChange?.length || 0,
      };
    },
  });

  // Recent role changes
  const { data: recentRoleChanges } = useQuery({
    queryKey: ['recent-role-changes'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('*')
        .eq('table_name', 'user_roles')
        .order('performed_at', { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const totalRateLimitHits = rateLimits?.reduce((sum, r) => sum + (r.request_count || 0), 0) || 0;
  const blockedRequests = rateLimits?.filter(r => (r.request_count || 0) >= 10).length || 0;

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT':
        return <Badge className="bg-green-500/20 text-green-400">New</Badge>;
      case 'UPDATE':
        return <Badge className="bg-blue-500/20 text-blue-400">Modified</Badge>;
      case 'DELETE':
        return <Badge className="bg-red-500/20 text-red-400">Removed</Badge>;
      default:
        return <Badge variant="secondary">{action}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    const colors: Record<string, string> = {
      super_admin: 'bg-purple-500/20 text-purple-400',
      organization_admin: 'bg-indigo-500/20 text-indigo-400',
      general_admin: 'bg-blue-500/20 text-blue-400',
      workplace_supervisor: 'bg-cyan-500/20 text-cyan-400',
      facility_supervisor: 'bg-teal-500/20 text-teal-400',
      department_head: 'bg-green-500/20 text-green-400',
      staff: 'bg-gray-500/20 text-gray-400',
    };
    return <Badge className={colors[role] || 'bg-gray-500/20'}>{role.replace('_', ' ')}</Badge>;
  };

  return (
    <div className="space-y-6">
      {/* Security Overview Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <CheckCircle className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Active Users</p>
                <p className="text-2xl font-bold">{userStats?.active || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-yellow-500/10">
                <AlertTriangle className="h-6 w-6 text-yellow-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Pending Password Reset</p>
                <p className="text-2xl font-bold">{userStats?.forcePasswordChange || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Activity className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Rate Limit Hits</p>
                <p className="text-2xl font-bold">{totalRateLimitHits}</p>
              </div>
            </div>
          </CardContent>
        </Card>

        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-red-500/10">
                <XCircle className="h-6 w-6 text-red-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Blocked Requests</p>
                <p className="text-2xl font-bold">{blockedRequests}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Role Distribution */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5" />
              Role Distribution
            </CardTitle>
            <CardDescription>Current user roles across the system</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {roleStats && Object.entries(roleStats).sort((a, b) => b[1] - a[1]).map(([role, count]) => {
                const total = Object.values(roleStats).reduce((a, b) => a + b, 0);
                const percentage = (count / total) * 100;
                return (
                  <div key={role} className="space-y-2">
                    <div className="flex justify-between items-center">
                      {getRoleBadge(role)}
                      <span className="text-sm font-medium">{count} users ({percentage.toFixed(1)}%)</span>
                    </div>
                    <Progress value={percentage} className="h-2" />
                  </div>
                );
              })}
              {!roleStats || Object.keys(roleStats).length === 0 && (
                <p className="text-muted-foreground text-center py-4">No role data available</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* Recent Security Events */}
        <Card className="bg-card border-border">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Shield className="h-5 w-5" />
              Recent Security Events
            </CardTitle>
            <CardDescription>Role and permission changes</CardDescription>
          </CardHeader>
          <CardContent>
            <ScrollArea className="h-[300px]">
              <div className="space-y-3">
                {securityAuditLogs?.map(log => (
                  <div key={log.id} className="flex items-start gap-3 p-3 rounded-lg bg-muted/50">
                    <div className="mt-1">
                      {log.action === 'INSERT' ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : log.action === 'DELETE' ? (
                        <XCircle className="h-4 w-4 text-red-500" />
                      ) : (
                        <Activity className="h-4 w-4 text-blue-500" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        {getActionBadge(log.action)}
                        <Badge variant="outline">{log.table_name}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">
                        {log.performed_at ? format(new Date(log.performed_at), 'MMM d, HH:mm') : 'Unknown time'}
                      </p>
                      {log.changed_fields && log.changed_fields.length > 0 && (
                        <p className="text-xs text-muted-foreground">
                          Changed: {log.changed_fields.slice(0, 3).join(', ')}
                        </p>
                      )}
                    </div>
                  </div>
                ))}
                {(!securityAuditLogs || securityAuditLogs.length === 0) && (
                  <p className="text-muted-foreground text-center py-4">No security events</p>
                )}
              </div>
            </ScrollArea>
          </CardContent>
        </Card>
      </div>

      {/* Rate Limits Table */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5" />
            Rate Limit Activity
          </CardTitle>
          <CardDescription>Recent rate limiting events and blocked requests</CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[300px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Identifier</TableHead>
                  <TableHead>Action Type</TableHead>
                  <TableHead>Request Count</TableHead>
                  <TableHead>Window Start</TableHead>
                  <TableHead>Status</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {rateLimits?.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={5} className="text-center py-8 text-muted-foreground">
                      No rate limit events recorded
                    </TableCell>
                  </TableRow>
                ) : (
                  rateLimits?.map(limit => (
                    <TableRow key={limit.id}>
                      <TableCell className="font-mono text-xs">{limit.identifier.slice(0, 20)}...</TableCell>
                      <TableCell>
                        <Badge variant="outline">{limit.action_type}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={(limit.request_count || 0) >= 10 ? 'text-red-500 font-bold' : ''}>
                          {limit.request_count}
                        </span>
                      </TableCell>
                      <TableCell className="text-xs">
                        {limit.window_start ? format(new Date(limit.window_start), 'MMM d, HH:mm:ss') : '-'}
                      </TableCell>
                      <TableCell>
                        {(limit.request_count || 0) >= 10 ? (
                          <Badge className="bg-red-500/20 text-red-400">Blocked</Badge>
                        ) : (
                          <Badge className="bg-green-500/20 text-green-400">Active</Badge>
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
