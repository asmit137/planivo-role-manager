import { useEffect, useState, useCallback } from "react";
import { useSearchParams } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { format, isToday, isTomorrow, parseISO } from "date-fns";
import { Clock, Users, Calendar, RefreshCw, AlertTriangle, Monitor } from "lucide-react";
import { cn } from "@/lib/utils";

interface ShiftAssignment {
  id: string;
  date: string;
  status: string;
  staff_name: string;
}

interface Shift {
  id: string;
  name: string;
  start_time: string;
  end_time: string;
  color: string;
  required_staff: number;
  assignments: ShiftAssignment[] | null;
}

interface Schedule {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
  department_name: string;
  shifts: Shift[] | null;
}

interface ScheduleData {
  token_name: string;
  show_staff_names: boolean;
  refresh_interval: number;
  schedules: Schedule[];
  error?: string;
}

export default function ScheduleDisplay() {
  const [searchParams] = useSearchParams();
  const token = searchParams.get("token");
  const [data, setData] = useState<ScheduleData | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentTime, setCurrentTime] = useState(new Date());
  const [lastRefresh, setLastRefresh] = useState(new Date());
  const [isFullscreen, setIsFullscreen] = useState(false);

  const fetchSchedule = useCallback(async () => {
    if (!token) {
      setError("No display token provided. Add ?token=YOUR_TOKEN to the URL.");
      setLoading(false);
      return;
    }

    try {
      const { data: result, error: rpcError } = await supabase.rpc("get_public_schedule", {
        p_token: token,
      });

      if (rpcError) throw rpcError;

      const scheduleData = result as unknown as ScheduleData;
      
      if (scheduleData.error) {
        setError(scheduleData.error);
      } else {
        setData(scheduleData);
        setError(null);
      }
      setLastRefresh(new Date());
    } catch (err) {
      console.error("Error fetching schedule:", err);
      setError("Failed to load schedule data");
    } finally {
      setLoading(false);
    }
  }, [token]);

  // Initial fetch and auto-refresh
  useEffect(() => {
    fetchSchedule();
    
    const refreshInterval = setInterval(() => {
      fetchSchedule();
    }, (data?.refresh_interval || 60) * 1000);

    return () => clearInterval(refreshInterval);
  }, [fetchSchedule, data?.refresh_interval]);

  // Update clock every second
  useEffect(() => {
    const clockInterval = setInterval(() => {
      setCurrentTime(new Date());
    }, 1000);

    return () => clearInterval(clockInterval);
  }, []);

  // Fullscreen toggle
  const toggleFullscreen = () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
      setIsFullscreen(true);
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Check if a shift is currently active
  const isShiftActive = (startTime: string, endTime: string) => {
    const now = currentTime;
    const [startHour, startMin] = startTime.split(":").map(Number);
    const [endHour, endMin] = endTime.split(":").map(Number);
    
    const currentMinutes = now.getHours() * 60 + now.getMinutes();
    const startMinutes = startHour * 60 + startMin;
    const endMinutes = endHour * 60 + endMin;
    
    if (endMinutes < startMinutes) {
      // Overnight shift
      return currentMinutes >= startMinutes || currentMinutes < endMinutes;
    }
    
    return currentMinutes >= startMinutes && currentMinutes < endMinutes;
  };

  // Get today's assignments for a shift
  const getTodayAssignments = (shift: Shift) => {
    if (!shift.assignments) return [];
    const today = format(new Date(), "yyyy-MM-dd");
    return shift.assignments.filter((a) => a.date === today);
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <div className="text-center space-y-4">
          <RefreshCw className="h-12 w-12 animate-spin text-primary mx-auto" />
          <p className="text-xl text-muted-foreground">Loading schedule...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-8">
        <div className="text-center space-y-4 max-w-md">
          <AlertTriangle className="h-16 w-16 text-destructive mx-auto" />
          <h1 className="text-2xl font-bold text-foreground">Schedule Unavailable</h1>
          <p className="text-muted-foreground">{error}</p>
          <button
            onClick={fetchSchedule}
            className="mt-4 px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:bg-primary/90 transition-colors"
          >
            Try Again
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background text-foreground">
      {/* Header */}
      <header className="bg-card border-b border-border px-6 py-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-4">
            <Calendar className="h-8 w-8 text-primary" />
            <div>
              <h1 className="text-2xl font-bold">{data?.token_name || "Schedule Display"}</h1>
              <p className="text-sm text-muted-foreground">
                Last updated: {format(lastRefresh, "HH:mm:ss")}
              </p>
            </div>
          </div>
          
          <div className="flex items-center gap-6">
            <div className="text-right">
              <div className="text-4xl font-bold font-mono tracking-wider">
                {format(currentTime, "HH:mm:ss")}
              </div>
              <div className="text-sm text-muted-foreground">
                {format(currentTime, "EEEE, MMMM d, yyyy")}
              </div>
            </div>
            <button
              onClick={toggleFullscreen}
              className="p-2 rounded-lg hover:bg-accent transition-colors"
              title="Toggle fullscreen"
            >
              <Monitor className="h-6 w-6" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="p-6">
        {data?.schedules && data.schedules.length > 0 ? (
          <div className="space-y-8">
            {data.schedules.map((schedule) => (
              <div key={schedule.id} className="bg-card rounded-xl border border-border overflow-hidden">
                {/* Schedule Header */}
                <div className="bg-primary/10 px-6 py-4 border-b border-border">
                  <h2 className="text-xl font-semibold">{schedule.department_name}</h2>
                  <p className="text-sm text-muted-foreground">
                    {schedule.name} • {format(parseISO(schedule.start_date), "MMM d")} - {format(parseISO(schedule.end_date), "MMM d, yyyy")}
                  </p>
                </div>

                {/* Shifts Grid */}
                <div className="p-6">
                  {schedule.shifts && schedule.shifts.length > 0 ? (
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                      {schedule.shifts.map((shift) => {
                        const isActive = isShiftActive(shift.start_time, shift.end_time);
                        const todayAssignments = getTodayAssignments(shift);
                        const staffCount = todayAssignments.length;
                        const isFullyStaffed = staffCount >= shift.required_staff;

                        return (
                          <div
                            key={shift.id}
                            className={cn(
                              "rounded-lg border-2 p-4 transition-all",
                              isActive
                                ? "border-primary bg-primary/5 shadow-lg ring-2 ring-primary/20"
                                : "border-border bg-card"
                            )}
                          >
                            {/* Shift Header */}
                            <div className="flex items-center justify-between mb-3">
                              <div className="flex items-center gap-2">
                                <div
                                  className="w-3 h-3 rounded-full"
                                  style={{ backgroundColor: shift.color || "#3b82f6" }}
                                />
                                <span className="font-semibold text-lg">{shift.name}</span>
                              </div>
                              {isActive && (
                                <span className="px-2 py-1 text-xs font-medium bg-primary text-primary-foreground rounded-full animate-pulse">
                                  NOW
                                </span>
                              )}
                            </div>

                            {/* Time */}
                            <div className="flex items-center gap-2 text-muted-foreground mb-3">
                              <Clock className="h-4 w-4" />
                              <span className="text-sm">
                                {shift.start_time.slice(0, 5)} - {shift.end_time.slice(0, 5)}
                              </span>
                            </div>

                            {/* Staffing Status */}
                            <div className={cn(
                              "flex items-center gap-2 text-sm font-medium mb-3",
                              isFullyStaffed ? "text-green-600 dark:text-green-400" : "text-amber-600 dark:text-amber-400"
                            )}>
                              <Users className="h-4 w-4" />
                              <span>
                                {staffCount}/{shift.required_staff} Staff
                              </span>
                            </div>

                            {/* Staff List */}
                            {todayAssignments.length > 0 && (
                              <div className="space-y-1 pt-2 border-t border-border">
                                {todayAssignments.map((assignment) => (
                                  <div
                                    key={assignment.id}
                                    className="flex items-center justify-between text-sm"
                                  >
                                    <span className="truncate">{assignment.staff_name}</span>
                                    <span className={cn(
                                      "text-xs px-2 py-0.5 rounded-full",
                                      assignment.status === "confirmed"
                                        ? "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400"
                                        : "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400"
                                    )}>
                                      {assignment.status}
                                    </span>
                                  </div>
                                ))}
                              </div>
                            )}

                            {todayAssignments.length === 0 && (
                              <div className="text-sm text-muted-foreground italic pt-2 border-t border-border">
                                No staff assigned today
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className="text-center py-8 text-muted-foreground">
                      No shifts configured for this schedule
                    </div>
                  )}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="flex flex-col items-center justify-center min-h-[50vh] text-center">
            <Calendar className="h-16 w-16 text-muted-foreground/50 mb-4" />
            <h2 className="text-xl font-semibold mb-2">No Active Schedules</h2>
            <p className="text-muted-foreground">
              There are no published schedules to display at this time.
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="fixed bottom-0 left-0 right-0 bg-card/80 backdrop-blur border-t border-border px-6 py-2">
        <div className="flex items-center justify-between text-xs text-muted-foreground">
          <span>Auto-refreshes every {data?.refresh_interval || 60} seconds</span>
          <span>Planivo Schedule Display</span>
        </div>
      </footer>
    </div>
  );
}
