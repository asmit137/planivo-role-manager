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
        className={cn(
          "p-0 border-none shadow-2xl bg-card overflow-hidden rounded-2xl",
          "w-[92vw] max-w-[400px]",
          "sm:w-[380px]",
          "md:w-[400px]"
        )}
      >
        <div className="flex flex-col w-full">
          {/* Header */}
          {/* <div className="bg-primary/5 p-4 sm:p-5 border-b border-primary/10 text-center">
            <h4 className="text-[0.65rem] font-bold text-primary mb-1 uppercase tracking-[0.2em]">
              Select Date & Time
            </h4>
            <p className="text-lg sm:text-xl font-black text-foreground tracking-tight">
              {date ? format(date, "MMMM d, yyyy") : "Choose a date"}
            </p>
          </div> */}

          <div className="p-4 sm:p-6 space-y-6 sm:space-y-8">
            {/* Calendar */}
            <Calendar
              mode="single"
              selected={date}
              onSelect={handleDateSelect}
              disabled={(d) => (minDate ? d < minDate : false)}
              initialFocus
              className={cn(
                "p-0 w-full",
                "scale-[0.95] sm:scale-100",
                "origin-top"
              )}
            />

            {/* Time Picker */}
            <div className="space-y-4">
              <div className="flex items-center justify-between px-2">
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Clock className="h-4 w-4" />
                  <span className="text-[0.65rem] font-bold uppercase tracking-[0.2em]">
                    Time
                  </span>
                </div>
                <span className="text-sm font-black text-primary bg-primary/10 px-4 py-1.5 rounded-full">
                  {time}
                </span>
              </div>

              <div className="relative group px-1">
                <Input
                  type="time"
                  value={time}
                  onChange={handleTimeChange}
                  className={cn(
                    "w-full bg-muted/40 border-none",
                    "h-12 sm:h-14",
                    "rounded-2xl text-center font-black",
                    "text-lg sm:text-xl",
                    "focus-visible:ring-2 focus-visible:ring-primary/20",
                    "transition-all cursor-pointer shadow-inner"
                  )}
                />
                <div className="absolute inset-0 pointer-events-none rounded-2xl ring-1 ring-inset ring-foreground/5 group-hover:ring-primary/20 transition-all" />
              </div>
            </div>

            {/* Confirm Button */}
            <Button
              onClick={() => setOpen(false)}
              disabled={!date}
              className={cn(
                "w-full rounded-2xl font-black uppercase tracking-widest",
                "h-12 sm:h-14",
                "text-xs sm:text-sm",
                "bg-primary hover:bg-primary/90 text-primary-foreground",
                "shadow-xl shadow-primary/20 transition-all active:scale-[0.98]"
              )}
            >
              Confirm Selection
            </Button>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DateTimePicker;
