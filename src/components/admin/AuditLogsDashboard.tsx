import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Search, Download, Eye, RefreshCw, Filter, FileText, Database, Shield } from "lucide-react";
import { format } from "date-fns";

interface AuditLog {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  old_data: any;
  new_data: any;
  changed_fields: string[] | null;
  performed_by: string | null;
  performed_at: string | null;
  ip_address: string | null;
  user_agent: string | null;
}

export function AuditLogsDashboard() {
  const [searchTerm, setSearchTerm] = useState("");
  const [tableFilter, setTableFilter] = useState<string>("all");
  const [actionFilter, setActionFilter] = useState<string>("all");
  const [page, setPage] = useState(0);
  const pageSize = 20;

  const { data: auditLogs, isLoading, refetch } = useQuery({
    queryKey: ['audit-logs', tableFilter, actionFilter, page],
    queryFn: async () => {
      let query = supabase
        .from('audit_logs')
        .select('*')
        .order('performed_at', { ascending: false })
        .range(page * pageSize, (page + 1) * pageSize - 1);

      if (tableFilter !== 'all') {
        query = query.eq('table_name', tableFilter);
      }
      if (actionFilter !== 'all') {
        query = query.eq('action', actionFilter);
      }

      const { data, error } = await query;
      if (error) throw error;
      return data as AuditLog[];
    },
  });

  const { data: tableNames } = useQuery({
    queryKey: ['audit-table-names'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('table_name')
        .limit(1000);
      if (error) throw error;
      const unique = [...new Set(data.map(d => d.table_name))];
      return unique.sort();
    },
  });

  const { data: stats } = useQuery({
    queryKey: ['audit-stats'],
    queryFn: async () => {
      const { count: totalCount } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true });

      const today = new Date();
      today.setHours(0, 0, 0, 0);
      
      const { count: todayCount } = await supabase
        .from('audit_logs')
        .select('*', { count: 'exact', head: true })
        .gte('performed_at', today.toISOString());

      return {
        total: totalCount || 0,
        today: todayCount || 0,
      };
    },
  });

  const { data: performerProfiles } = useQuery({
    queryKey: ['audit-performers', auditLogs],
    queryFn: async () => {
      if (!auditLogs) return {};
      const performerIds = [...new Set(auditLogs.filter(l => l.performed_by).map(l => l.performed_by))];
      if (performerIds.length === 0) return {};
      
      const { data } = await supabase
        .from('profiles')
        .select('id, full_name, email')
        .in('id', performerIds as string[]);
      
      const map: Record<string, { full_name: string; email: string }> = {};
      data?.forEach(p => { map[p.id] = { full_name: p.full_name, email: p.email }; });
      return map;
    },
    enabled: !!auditLogs && auditLogs.length > 0,
  });

  const filteredLogs = auditLogs?.filter(log => {
    if (!searchTerm) return true;
    const search = searchTerm.toLowerCase();
    return (
      log.table_name.toLowerCase().includes(search) ||
      log.action.toLowerCase().includes(search) ||
      log.record_id.toLowerCase().includes(search) ||
      (performerProfiles?.[log.performed_by || '']?.full_name || '').toLowerCase().includes(search)
    );
  }) || [];

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30">INSERT</Badge>;
      case 'UPDATE':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30">UPDATE</Badge>;
      case 'DELETE':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30">DELETE</Badge>;
      default:
        return <Badge variant="secondary">{action}</Badge>;
    }
  };

  const exportToCSV = () => {
    if (!auditLogs) return;
    
    const headers = ['ID', 'Table', 'Action', 'Record ID', 'Changed Fields', 'Performed By', 'Performed At', 'IP Address'];
    const rows = auditLogs.map(log => [
      log.id,
      log.table_name,
      log.action,
      log.record_id,
      log.changed_fields?.join(', ') || '',
      performerProfiles?.[log.performed_by || '']?.email || log.performed_by || 'System',
      log.performed_at || '',
      log.ip_address || '',
    ]);
    
    const csv = [headers, ...rows].map(row => row.map(cell => `"${cell}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `audit-logs-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click();
  };

  return (
    <div className="space-y-6">
      {/* Stats Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-primary/10">
                <Database className="h-6 w-6 text-primary" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Total Audit Logs</p>
                <p className="text-2xl font-bold">{stats?.total || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-green-500/10">
                <FileText className="h-6 w-6 text-green-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Today's Events</p>
                <p className="text-2xl font-bold">{stats?.today || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-6">
            <div className="flex items-center gap-4">
              <div className="p-3 rounded-lg bg-blue-500/10">
                <Shield className="h-6 w-6 text-blue-500" />
              </div>
              <div>
                <p className="text-sm text-muted-foreground">Tables Tracked</p>
                <p className="text-2xl font-bold">{tableNames?.length || 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center justify-between">
            <span className="flex items-center gap-2">
              <Filter className="h-5 w-5" />
              Audit Logs
            </span>
            <div className="flex gap-2">
              <Button variant="outline" size="sm" onClick={() => refetch()}>
                <RefreshCw className="h-4 w-4 mr-2" />
                Refresh
              </Button>
              <Button variant="outline" size="sm" onClick={exportToCSV}>
                <Download className="h-4 w-4 mr-2" />
                Export CSV
              </Button>
            </div>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col md:flex-row gap-4 mb-6">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="Search logs..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                className="pl-10"
              />
            </div>
            <Select value={tableFilter} onValueChange={setTableFilter}>
              <SelectTrigger className="w-full md:w-[200px]">
                <SelectValue placeholder="Filter by table" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Tables</SelectItem>
                {tableNames?.map(name => (
                  <SelectItem key={name} value={name}>{name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={actionFilter} onValueChange={setActionFilter}>
              <SelectTrigger className="w-full md:w-[150px]">
                <SelectValue placeholder="Filter by action" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Actions</SelectItem>
                <SelectItem value="INSERT">INSERT</SelectItem>
                <SelectItem value="UPDATE">UPDATE</SelectItem>
                <SelectItem value="DELETE">DELETE</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <ScrollArea className="h-[500px]">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Timestamp</TableHead>
                  <TableHead>Table</TableHead>
                  <TableHead>Action</TableHead>
                  <TableHead>Performed By</TableHead>
                  <TableHead>Changed Fields</TableHead>
                  <TableHead>Details</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {isLoading ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8">
                      Loading audit logs...
                    </TableCell>
                  </TableRow>
                ) : filteredLogs.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                      No audit logs found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredLogs.map(log => (
                    <TableRow key={log.id}>
                      <TableCell className="font-mono text-xs">
                        {log.performed_at ? format(new Date(log.performed_at), 'MMM d, HH:mm:ss') : '-'}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{log.table_name}</Badge>
                      </TableCell>
                      <TableCell>{getActionBadge(log.action)}</TableCell>
                      <TableCell>
                        {performerProfiles?.[log.performed_by || '']?.full_name || 
                         (log.performed_by ? 'Unknown User' : 'System')}
                      </TableCell>
                      <TableCell>
                        <span className="text-xs text-muted-foreground">
                          {log.changed_fields?.slice(0, 3).join(', ')}
                          {(log.changed_fields?.length || 0) > 3 && '...'}
                        </span>
                      </TableCell>
                      <TableCell>
                        <Dialog>
                          <DialogTrigger asChild>
                            <Button variant="ghost" size="sm">
                              <Eye className="h-4 w-4" />
                            </Button>
                          </DialogTrigger>
                          <DialogContent className="max-w-2xl max-h-[80vh] overflow-auto">
                            <DialogHeader>
                              <DialogTitle>Audit Log Details</DialogTitle>
                            </DialogHeader>
                            <div className="space-y-4">
                              <div className="grid grid-cols-2 gap-4 text-sm">
                                <div>
                                  <span className="text-muted-foreground">Record ID:</span>
                                  <p className="font-mono">{log.record_id}</p>
                                </div>
                                <div>
                                  <span className="text-muted-foreground">IP Address:</span>
                                  <p className="font-mono">{log.ip_address || 'N/A'}</p>
                                </div>
                              </div>
                              {log.changed_fields && (
                                <div>
                                  <span className="text-muted-foreground text-sm">Changed Fields:</span>
                                  <div className="flex flex-wrap gap-1 mt-1">
                                    {log.changed_fields.map(field => (
                                      <Badge key={field} variant="secondary">{field}</Badge>
                                    ))}
                                  </div>
                                </div>
                              )}
                              {log.old_data && (
                                <div>
                                  <span className="text-muted-foreground text-sm">Old Data:</span>
                                  <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-40">
                                    {JSON.stringify(log.old_data, null, 2)}
                                  </pre>
                                </div>
                              )}
                              {log.new_data && (
                                <div>
                                  <span className="text-muted-foreground text-sm">New Data:</span>
                                  <pre className="mt-1 p-3 bg-muted rounded-lg text-xs overflow-auto max-h-40">
                                    {JSON.stringify(log.new_data, null, 2)}
                                  </pre>
                                </div>
                              )}
                            </div>
                          </DialogContent>
                        </Dialog>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </ScrollArea>

          {/* Pagination */}
          <div className="flex justify-between items-center mt-4">
            <p className="text-sm text-muted-foreground">
              Showing {page * pageSize + 1} - {Math.min((page + 1) * pageSize, stats?.total || 0)} of {stats?.total || 0}
            </p>
            <div className="flex gap-2">
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => Math.max(0, p - 1))}
                disabled={page === 0}
              >
                Previous
              </Button>
              <Button 
                variant="outline" 
                size="sm" 
                onClick={() => setPage(p => p + 1)}
                disabled={(page + 1) * pageSize >= (stats?.total || 0)}
              >
                Next
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
