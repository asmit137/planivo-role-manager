import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock } from "lucide-react";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

interface DateTimePickerProps {
  value?: string;
  onChange: (value: string) => void;
  placeholder?: string;
  disabled?: boolean;
  minDate?: Date;
}

export function DateTimePicker({
  value,
  onChange,
  placeholder = "Pick date and time",
  disabled = false,
  minDate,
}: DateTimePickerProps) {
  const [date, setDate] = React.useState<Date | undefined>(
    value ? new Date(value) : undefined
  );
  const [time, setTime] = React.useState<string>(
    value ? format(new Date(value), "HH:mm") : "09:00"
  );
  const [open, setOpen] = React.useState(false);

  // Helper to get 12h parts from 24h string
  const get12hParts = (time24: string) => {
    let [hours, minutes] = time24.split(":").map(Number);
    const ampm = hours >= 12 ? "PM" : "AM";
    hours = hours % 12;
    hours = hours ? hours : 12; // the hour '0' should be '12'
    return {
      hour: hours.toString(),
      minute: minutes.toString().padStart(2, '0'),
      ampm
    };
  };

  const { hour, minute, ampm } = React.useMemo(() => get12hParts(time), [time]);

  React.useEffect(() => {
    if (value) {
      const d = new Date(value);
      setDate(d);
      setTime(format(d, "HH:mm"));
    }
  }, [value]);

  const handleDateSelect = (selectedDate: Date | undefined) => {
    if (!selectedDate) return;
    setDate(selectedDate);
    updateDateTime(selectedDate, time);
  };

  const updateDateTime = (d: Date, t: string) => {
    const [hours, minutes] = t.split(":").map(Number);
    const newDate = new Date(d);
    newDate.setHours(hours, minutes, 0, 0);
    onChange(newDate.toISOString());
  };

  const handleTimePartChange = (part: 'hour' | 'minute' | 'ampm', newValue: string) => {
    let h = parseInt(hour);
    let m = parseInt(minute);
    let ap = ampm;

    if (part === 'hour') h = parseInt(newValue);
    if (part === 'minute') m = parseInt(newValue);
    if (part === 'ampm') ap = newValue;

    // Convert back to 24h
    let h24 = h;
    if (ap === "PM" && h < 12) h24 += 12;
    if (ap === "AM" && h === 12) h24 = 0;

    const newTime24 = `${h24.toString().padStart(2, '0')}:${m.toString().padStart(2, '0')}`;
    setTime(newTime24);
    if (date) {
      // Create a temporary date object to ensure immediate update with correct time
      const [hours, minutes] = newTime24.split(":").map(Number);
      const newDate = new Date(date);
      newDate.setHours(hours, minutes, 0, 0);
      onChange(newDate.toISOString());
    }
  };

  const displayValue = React.useMemo(() => {
    if (!date) return placeholder;
    return `${format(date, "EEE, MMM d, yyyy")} at ${hour}:${minute} ${ampm}`;
  }, [date, hour, minute, ampm, placeholder]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          disabled={disabled}
          className={cn(
            "w-full justify-start text-left font-normal",
            !date && "text-muted-foreground"
          )}
        >
          <CalendarIcon className="mr-2 h-4 w-4" />
          {displayValue}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        align="center"
        sideOffset={8}
        className="w-auto p-0 border shadow-md bg-card rounded-lg overflow-hidden"
      >
        <div className="flex flex-col p-3 space-y-3">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            disabled={(d) => {
              if (!minDate) return false;
              const minDateStart = new Date(minDate);
              minDateStart.setHours(0, 0, 0, 0);
              return d < minDateStart;
            }}
            initialFocus
            className="p-0 border-0"
          />

          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider">
                  Time
                </span>
              </div>
              <span className="text-[0.7rem] font-bold text-primary">
                {hour}:{minute} {ampm}
              </span>
            </div>

            <div className="flex gap-1">
              <Select value={hour} onValueChange={(v) => handleTimePartChange('hour', v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((h) => (
                    <SelectItem key={h} value={h.toString()}>
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={minute} onValueChange={(v) => handleTimePartChange('minute', v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {["00", "05", "10", "15", "20", "25", "30", "35", "40", "45", "50", "55"].map((m) => (
                    <SelectItem key={m} value={m}>
                      {m}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={ampm} onValueChange={(v) => handleTimePartChange('ampm', v)}>
                <SelectTrigger className="h-8 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="AM">AM</SelectItem>
                  <SelectItem value="PM">PM</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          <Button
            onClick={() => setOpen(false)}
            disabled={!date}
            size="sm"
            className="w-full text-xs font-bold uppercase tracking-widest h-9"
          >
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DateTimePicker;
