import { useState, useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Activity, Pause, Play, Trash2, Bell, BellOff, User, Database, Clock, Zap } from "lucide-react";
import { format } from "date-fns";
import { cn } from "@/lib/utils";

interface ActivityEvent {
  id: string;
  table_name: string;
  record_id: string;
  action: string;
  changed_fields: string[] | null;
  performed_by: string | null;
  performed_at: string | null;
  performer_name?: string;
  isNew?: boolean;
}

export function RealTimeActivityMonitor() {
  const [events, setEvents] = useState<ActivityEvent[]>([]);
  const [isPaused, setIsPaused] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  // Fetch initial audit logs
  const { data: initialLogs } = useQuery({
    queryKey: ['initial-audit-logs'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('audit_logs')
        .select('id, table_name, record_id, action, changed_fields, performed_by, performed_at')
        .order('performed_at', { ascending: false })
        .limit(50);
      if (error) throw error;
      return data as ActivityEvent[];
    },
  });

  // Fetch user profiles for display names
  const { data: profiles } = useQuery({
    queryKey: ['profiles-for-activity'],
    queryFn: async () => {
      const { data, error } = await supabase
        .from('profiles')
        .select('id, full_name');
      if (error) throw error;
      const map: Record<string, string> = {};
      data.forEach(p => { map[p.id] = p.full_name; });
      return map;
    },
  });

  // Set initial logs
  useEffect(() => {
    if (initialLogs && events.length === 0) {
      setEvents(initialLogs.map(log => ({
        ...log,
        performer_name: profiles?.[log.performed_by || ''] || 'System',
        isNew: false,
      })));
    }
  }, [initialLogs, profiles]);

  // Subscribe to real-time audit log changes
  useEffect(() => {
    const channel = supabase
      .channel('realtime-audit-logs')
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'audit_logs',
        },
        (payload) => {
          if (isPaused) return;
          
          const newEvent = payload.new as ActivityEvent;
          newEvent.isNew = true;
          newEvent.performer_name = profiles?.[newEvent.performed_by || ''] || 'System';
          
          setEvents(prev => [newEvent, ...prev.slice(0, 99)]);
          
          // Play sound if enabled
          if (soundEnabled && audioRef.current) {
            audioRef.current.currentTime = 0;
            audioRef.current.play().catch(() => {});
          }

          // Remove "new" highlight after animation
          setTimeout(() => {
            setEvents(prev => 
              prev.map(e => e.id === newEvent.id ? { ...e, isNew: false } : e)
            );
          }, 2000);
        }
      )
      .subscribe((status) => {
        setIsConnected(status === 'SUBSCRIBED');
        console.log('Real-time subscription status:', status);
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [isPaused, soundEnabled, profiles]);

  // Stats
  const stats = {
    total: events.length,
    inserts: events.filter(e => e.action === 'INSERT').length,
    updates: events.filter(e => e.action === 'UPDATE').length,
    deletes: events.filter(e => e.action === 'DELETE').length,
  };

  const getActionBadge = (action: string) => {
    switch (action) {
      case 'INSERT':
        return <Badge className="bg-green-500/20 text-green-400 border-green-500/30 text-xs">CREATE</Badge>;
      case 'UPDATE':
        return <Badge className="bg-blue-500/20 text-blue-400 border-blue-500/30 text-xs">UPDATE</Badge>;
      case 'DELETE':
        return <Badge className="bg-red-500/20 text-red-400 border-red-500/30 text-xs">DELETE</Badge>;
      default:
        return <Badge variant="secondary" className="text-xs">{action}</Badge>;
    }
  };

  const getTableIcon = (tableName: string) => {
    const colors: Record<string, string> = {
      profiles: 'text-purple-400',
      user_roles: 'text-orange-400',
      organizations: 'text-blue-400',
      workspaces: 'text-cyan-400',
      facilities: 'text-green-400',
      departments: 'text-teal-400',
      tasks: 'text-yellow-400',
      vacation_plans: 'text-pink-400',
      schedules: 'text-indigo-400',
      training_events: 'text-rose-400',
      messages: 'text-emerald-400',
    };
    return colors[tableName] || 'text-gray-400';
  };

  const clearEvents = () => {
    setEvents([]);
  };

  return (
    <div className="space-y-6">
      {/* Hidden audio element for notification sound */}
      <audio ref={audioRef} src="data:audio/wav;base64,UklGRnoGAABXQVZFZm10IBAAAAABAAEAQB8AAEAfAAABAAgAZGF0YQoGAACBhYqFbF1fdJivrJBhNjVgodDbq2EcBj+a2teleP/9///+/v///////v///v///v/+//8=" />

      {/* Status Bar */}
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <div className={cn(
              "w-3 h-3 rounded-full animate-pulse",
              isConnected ? "bg-green-500" : "bg-red-500"
            )} />
            <span className="text-sm font-medium">
              {isConnected ? "Connected" : "Disconnected"}
            </span>
          </div>
          <Badge variant="outline" className="font-mono">
            {events.length} events
          </Badge>
        </div>

        <div className="flex items-center gap-4">
          <div className="flex items-center gap-2">
            <Switch
              id="sound"
              checked={soundEnabled}
              onCheckedChange={setSoundEnabled}
            />
            <Label htmlFor="sound" className="flex items-center gap-1 cursor-pointer">
              {soundEnabled ? <Bell className="h-4 w-4" /> : <BellOff className="h-4 w-4" />}
              <span className="text-sm">Sound</span>
            </Label>
          </div>

          <Button
            variant={isPaused ? "default" : "outline"}
            size="sm"
            onClick={() => setIsPaused(!isPaused)}
          >
            {isPaused ? (
              <>
                <Play className="h-4 w-4 mr-1" />
                Resume
              </>
            ) : (
              <>
                <Pause className="h-4 w-4 mr-1" />
                Pause
              </>
            )}
          </Button>

          <Button
            variant="outline"
            size="sm"
            onClick={clearEvents}
          >
            <Trash2 className="h-4 w-4 mr-1" />
            Clear
          </Button>
        </div>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Activity className="h-5 w-5 text-primary" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Total Events</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-green-500/10">
                <Zap className="h-5 w-5 text-green-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Creates</p>
                <p className="text-xl font-bold">{stats.inserts}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-blue-500/10">
                <Database className="h-5 w-5 text-blue-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Updates</p>
                <p className="text-xl font-bold">{stats.updates}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card className="bg-card border-border">
          <CardContent className="pt-4 pb-4">
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-red-500/10">
                <Trash2 className="h-5 w-5 text-red-500" />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Deletes</p>
                <p className="text-xl font-bold">{stats.deletes}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Activity Feed */}
      <Card className="bg-card border-border">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Activity className="h-5 w-5 animate-pulse" />
            Live Activity Feed
          </CardTitle>
          <CardDescription>
            Real-time system events as they happen
          </CardDescription>
        </CardHeader>
        <CardContent>
          <ScrollArea className="h-[500px]" ref={scrollRef}>
            <div className="space-y-2">
              {events.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground">
                  <Activity className="h-12 w-12 mx-auto mb-4 opacity-30" />
                  <p>Waiting for activity...</p>
                  <p className="text-sm">Events will appear here in real-time</p>
                </div>
              ) : (
                events.map((event) => (
                  <div
                    key={event.id}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg transition-all duration-500",
                      event.isNew 
                        ? "bg-primary/20 border border-primary/30 animate-pulse" 
                        : "bg-muted/30 hover:bg-muted/50"
                    )}
                  >
                    <div className={cn("mt-1", getTableIcon(event.table_name))}>
                      <Database className="h-4 w-4" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        {getActionBadge(event.action)}
                        <Badge variant="outline" className="font-mono text-xs">
                          {event.table_name}
                        </Badge>
                        {event.changed_fields && event.changed_fields.length > 0 && (
                          <span className="text-xs text-muted-foreground">
                            ({event.changed_fields.slice(0, 2).join(', ')}
                            {event.changed_fields.length > 2 && ` +${event.changed_fields.length - 2}`})
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3 mt-1 text-xs text-muted-foreground">
                        <span className="flex items-center gap-1">
                          <User className="h-3 w-3" />
                          {event.performer_name || 'System'}
                        </span>
                        <span className="flex items-center gap-1">
                          <Clock className="h-3 w-3" />
                          {event.performed_at 
                            ? format(new Date(event.performed_at), 'HH:mm:ss') 
                            : 'Now'}
                        </span>
                        <span className="font-mono opacity-50">
                          {event.record_id.slice(0, 8)}...
                        </span>
                      </div>
                    </div>
                    {event.isNew && (
                      <Badge className="bg-primary text-primary-foreground text-xs animate-bounce">
                        NEW
                      </Badge>
                    )}
                  </div>
                ))
              )}
            </div>
          </ScrollArea>
        </CardContent>
      </Card>
    </div>
  );
}
