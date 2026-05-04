"use client";

import { useState, useRef, useEffect } from "react";
import { createPortal } from "react-dom";
import { DayPicker } from "react-day-picker";
import { format } from "date-fns";
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
  const [open, setOpen]           = useState(false);
  const [popupPos, setPopupPos]   = useState({ top: 0, left: 0 });
  const triggerRef                = useRef<HTMLButtonElement>(null);
  const popupRef                  = useRef<HTMLDivElement>(null);

  const selected = value ? new Date(value + "T00:00:00") : new Date();

  // Position the portal popup below the trigger button
  const openPopup = () => {
    if (triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      setPopupPos({ top: rect.bottom + window.scrollY + 4, left: rect.left + window.scrollX });
    }
    setOpen(true);
  };

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function handleClick(e: MouseEvent) {
      if (
        triggerRef.current && triggerRef.current.contains(e.target as Node)
      ) return;
      if (
        popupRef.current && popupRef.current.contains(e.target as Node)
      ) return;
      setOpen(false);
    }
    document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => (open ? setOpen(false) : openPopup())}
        className={`h-7 w-full flex items-center gap-1.5 px-2 rounded-none border transition
          focus:outline-none focus:ring-1 focus:ring-[#e8473f] focus:border-transparent
          ${open ? "border-[#e8473f] ring-1 ring-[#e8473f]" : "border-gray-200"}
          ${selected ? "text-gray-800" : "text-gray-400"}
          bg-white`}
      >
        <Calendar size={11} className={selected ? "text-[#e8473f] shrink-0" : "text-gray-400 shrink-0"} />
        <span className="text-[0.7rem] font-medium whitespace-nowrap">
          {selected ? format(selected, "MMM d, yyyy") : placeholder}
        </span>
      </button>

      {open && typeof document !== "undefined" && createPortal(
        <div
          ref={popupRef}
          style={{ top: popupPos.top, left: popupPos.left }}
          className="fixed z-9999 bg-white border border-gray-200 shadow-lg p-3"
        >
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
              root:          "font-sans",
              months:        "relative",
              month:         "w-full",
              month_caption: "flex items-center justify-between mb-2 px-1",
              caption_label: "text-xs font-semibold text-gray-900 mr-auto pl-1",
              nav:           "flex items-center gap-1",
              button_previous:
                "w-5 h-5 flex items-center justify-center rounded-none border border-gray-200 text-gray-500 hover:border-[#e8473f] hover:text-[#e8473f] hover:bg-[#fef2f2] transition-colors",
              button_next:
                "w-5 h-5 flex items-center justify-center rounded-none border border-gray-200 text-gray-500 hover:border-[#e8473f] hover:text-[#e8473f] hover:bg-[#fef2f2] transition-colors",
              weeks:    "w-full",
              weekdays: "flex mb-1",
              weekday:
                "w-7 text-center text-[0.6rem] font-semibold text-gray-400 uppercase tracking-wide",
              week: "flex",
              day:  "w-7 h-7 flex items-center justify-center",
              day_button:
                "w-6 h-6 text-[0.7rem] rounded-none flex items-center justify-center transition-colors text-gray-700 hover:bg-[#fef2f2] hover:text-[#e8473f] cursor-pointer border-none bg-transparent",
              selected:
                "[&>button]:bg-[#e8473f] [&>button]:text-white [&>button]:font-semibold [&>button]:hover:bg-[#d43f37] [&>button]:hover:text-white",
              today:
                "[&>button]:font-bold [&>button]:text-[#e8473f] [&>button]:border [&>button]:border-[#e8473f]",
              outside:  "[&>button]:text-gray-300",
              disabled: "[&>button]:text-gray-200 [&>button]:cursor-not-allowed",
            }}
          />
        </div>,
        document.body
      )}
    </>
  );
}
