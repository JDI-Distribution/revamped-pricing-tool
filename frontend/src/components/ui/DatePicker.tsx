"use client";

import { useState, useRef, useEffect } from "react";
import { DayPicker } from "react-day-picker";
import { format, addWeeks } from "date-fns";
import { Calendar, ChevronLeft, ChevronRight } from "lucide-react";

interface DatePickerProps {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
}

export default function DatePicker({
  value,
  onChange,
  placeholder = "Pick a date",
}: DatePickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const defaultDate = addWeeks(new Date(), 1);
  const selected = value ? new Date(value + "T00:00:00") : defaultDate;

  useEffect(() => {
    if (!value) {
      onChange(format(defaultDate, "yyyy-MM-dd"));
    }
  }, []);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <div ref={ref} className="relative">
      {/* Trigger */}
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className={`h-8 w-full flex items-center gap-2.5 px-2.5 rounded-none border text-sm transition
          focus:outline-none focus:ring-2 focus:ring-[#e8473f] focus:border-transparent
          ${open ? "border-[#e8473f] ring-2 ring-[#e8473f]" : "border-gray-200"}
          ${selected ? "text-gray-900" : "text-gray-400"}
          bg-white`}
      >
        <Calendar size={15} className={selected ? "text-[#e8473f]" : "text-gray-400"} />
        <span>{selected ? format(selected, "MMM d, yyyy") : placeholder}</span>
        {selected && (
          <span className="ml-auto text-xs text-gray-400">
            {format(selected, "EEEE")}
          </span>
        )}
      </button>

      {/* Calendar Popover */}
      {open && (
        <div className="absolute top-full mt-2 z-50 bg-white border border-gray-200 rounded-none shadow-lg p-3">
          <DayPicker
            mode="single"
            selected={selected}
            defaultMonth={selected}
            onSelect={(day) => {
              if (day) {
                onChange(format(day, "yyyy-MM-dd"));
                setOpen(false);
              }
            }}
            components={{
              Chevron: ({ orientation }) =>
                orientation === "left" ? (
                  <ChevronLeft size={12} />
                ) : (
                  <ChevronRight size={12} />
                ),
            }}
            classNames={{
              root: "font-sans",
              months: "relative",
              month: "w-full",
              month_caption: "flex items-center justify-between mb-2 px-1",
              caption_label: "text-xs font-semibold text-gray-900 mr-auto pl-1",
              nav: "flex items-center gap-1",
              button_previous:
                "w-5 h-5 flex items-center justify-center rounded-none border border-gray-200 text-gray-500 hover:border-[#e8473f] hover:text-[#e8473f] hover:bg-[#fef2f2] transition-colors",
              button_next:
                "w-5 h-5 flex items-center justify-center rounded-none border border-gray-200 text-gray-500 hover:border-[#e8473f] hover:text-[#e8473f] hover:bg-[#fef2f2] transition-colors",
              weeks: "w-full",
              weekdays: "flex mb-1",
              weekday:
                "w-7 text-center text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wide",
              week: "flex",
              day: "w-7 h-7 flex items-center justify-center",
              day_button:
                "w-6 h-6 text-[0.7rem] rounded-none flex items-center justify-center transition-colors text-gray-700 hover:bg-[#fef2f2] hover:text-[#e8473f] cursor-pointer border-none bg-transparent",
              selected:
                "[&>button]:bg-[#e8473f] [&>button]:text-white [&>button]:font-semibold [&>button]:hover:bg-[#d43f37] [&>button]:hover:text-white",
              today:
                "[&>button]:font-bold [&>button]:text-[#e8473f] [&>button]:border [&>button]:border-[#e8473f]",
              outside: "[&>button]:text-gray-300",
              disabled:
                "[&>button]:text-gray-200 [&>button]:cursor-not-allowed",
            }}
          />
        </div>
      )}
    </div>
  );
}