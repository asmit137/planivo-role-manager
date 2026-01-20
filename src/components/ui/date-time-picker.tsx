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

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTime(newTime);
    if (date) updateDateTime(date, newTime);
  };

  const updateDateTime = (d: Date, t: string) => {
    const [hours, minutes] = t.split(":").map(Number);
    const newDate = new Date(d);
    newDate.setHours(hours, minutes, 0, 0);
    onChange(newDate.toISOString().slice(0, 16));
  };

  const displayValue = React.useMemo(() => {
    if (!date) return placeholder;
    return `${format(date, "EEE, MMM d, yyyy")} at ${time}`;
  }, [date, time, placeholder]);

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
          {/* Calendar - Standard Sizing */}
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

          {/* Time Picker - Compact */}
          <div className="space-y-2 pt-2 border-t border-border">
            <div className="flex items-center justify-between px-1">
              <div className="flex items-center gap-2 text-muted-foreground">
                <Clock className="h-3 w-3" />
                <span className="text-[0.65rem] font-semibold uppercase tracking-wider">
                  Time
                </span>
              </div>
              <span className="text-[0.7rem] font-bold text-primary">
                {time}
              </span>
            </div>

            <Input
              type="time"
              value={time}
              onChange={handleTimeChange}
              className="h-8 text-xs font-semibold bg-muted/50 border-0 focus-visible:ring-1 focus-visible:ring-primary/30"
            />
          </div>

          {/* Confirm Button */}
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
