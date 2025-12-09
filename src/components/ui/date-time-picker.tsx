import * as React from "react";
import { format } from "date-fns";
import { Calendar as CalendarIcon, Clock } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { Calendar } from "@/components/ui/calendar";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";

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
    if (selectedDate) {
      setDate(selectedDate);
      updateDateTime(selectedDate, time);
    }
  };

  const handleTimeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const newTime = e.target.value;
    setTime(newTime);
    if (date) {
      updateDateTime(date, newTime);
    }
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
      <PopoverContent className="w-auto p-0" align="start">
        <div className="p-4 space-y-4">
          <Calendar
            mode="single"
            selected={date}
            onSelect={handleDateSelect}
            disabled={(d) => minDate ? d < minDate : false}
            initialFocus
            className="rounded-lg border"
          />
          
          <div className="flex items-center gap-3 px-2">
            <Clock className="h-4 w-4 text-muted-foreground" />
            <div className="flex-1">
              <Input
                type="time"
                value={time}
                onChange={handleTimeChange}
                className="w-full"
              />
            </div>
          </div>

          <Button 
            className="w-full" 
            onClick={() => setOpen(false)}
            disabled={!date}
          >
            Confirm
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

export default DateTimePicker;