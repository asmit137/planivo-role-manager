import * as React from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { DayPicker } from "react-day-picker";

import { cn } from "@/lib/utils";
import { buttonVariants } from "@/components/ui/button";

export type CalendarProps = React.ComponentProps<typeof DayPicker>;

function Calendar({
  className,
  classNames,
  showOutsideDays = true,
  ...props
}: CalendarProps) {
  return (
    <DayPicker
      showOutsideDays={showOutsideDays}
      className={cn(
        "p-3 sm:p-4 w-full max-w-full overflow-x-hidden pointer-events-auto",
        className
      )}
      classNames={{
        /* Layout */
        months:
          "flex flex-col sm:flex-row gap-4 sm:gap-6 w-full justify-center",
        month: "space-y-4 w-full",
        caption:
          "relative flex items-center justify-center h-10 w-full px-8",
        caption_label:
          "text-sm font-bold tracking-tight text-foreground text-center",
        nav: "flex items-center gap-1",
        nav_button: cn(
          buttonVariants({ variant: "outline" }),
          "h-8 w-8 p-0 bg-transparent hover:bg-accent hover:text-accent-foreground transition-colors rounded-lg border-0"
        ),
        nav_button_previous: "absolute left-1",
        nav_button_next: "absolute right-1",

        /* Table */
        table: "w-full border-collapse table-fixed",
        head_row: "grid grid-cols-7 w-full mb-2",
        head_cell:
          "text-muted-foreground font-semibold text-[0.6rem] sm:text-[0.75rem] uppercase tracking-[0.2em] text-center",
        row: "grid grid-cols-7 w-full mt-1",

        /* Cells */
        cell: cn(
          "relative aspect-square min-w-0 flex items-center justify-center",
          "text-xs sm:text-sm",
          "[&:has([aria-selected])]:bg-primary/10",
          "[&:has([aria-selected])]:rounded-full",
          "[&:has([aria-selected].day-outside)]:bg-accent/50"
        ),

        day: cn(
          buttonVariants({ variant: "ghost" }),
          "h-8 w-8 sm:h-9 sm:w-9 p-0 font-bold rounded-full",
          "transition-all duration-300",
          "hover:bg-primary/20 hover:text-primary hover:scale-110",
          "aria-selected:opacity-100"
        ),

        /* States */
        day_selected: cn(
          "bg-primary text-primary-foreground font-bold shadow-lg scale-105",
          "hover:bg-primary hover:text-primary-foreground",
          "focus:bg-primary focus:text-primary-foreground"
        ),
        day_today:
          "bg-accent/50 text-accent-foreground font-bold ring-1 ring-primary/20",
        day_outside:
          "text-muted-foreground/50 aria-selected:bg-accent/50 aria-selected:text-muted-foreground",
        day_disabled: "text-muted-foreground/30 cursor-not-allowed",
        day_range_middle:
          "aria-selected:bg-accent aria-selected:text-accent-foreground",
        day_range_end: "day-range-end",
        day_hidden: "invisible",

        ...classNames,
      }}
      components={{
        IconLeft: () => <ChevronLeft className="h-5 w-5" />,
        IconRight: () => <ChevronRight className="h-5 w-5" />,
      }}
      {...props}
    />
  );
}

Calendar.displayName = "Calendar";

export { Calendar };
