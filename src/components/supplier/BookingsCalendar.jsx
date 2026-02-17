import { useMemo } from "react";
import { Calendar, dateFnsLocalizer } from "react-big-calendar";
import format from "date-fns/format";
import parse from "date-fns/parse";
import startOfWeek from "date-fns/startOfWeek";
import getDay from "date-fns/getDay";
import addDays from "date-fns/addDays";
import addHours from "date-fns/addHours";
import enGB from "date-fns/locale/en-GB";
import "react-big-calendar/lib/css/react-big-calendar.css";

const locales = {
  "en-GB": enGB,
};

const localizer = dateFnsLocalizer({
  format,
  parse,
  startOfWeek,
  getDay,
  locales,
});

function safe(value) {
  return String(value || "").trim();
}

function parseDateTime(dateValue, timeValue = "00:00") {
  const dateText = safe(dateValue);
  if (!dateText) return null;
  const timeText = safe(timeValue) || "00:00";

  const parsed = parse(`${dateText} ${timeText}`, "yyyy-MM-dd HH:mm", new Date());
  if (!Number.isNaN(parsed.getTime())) return parsed;

  const fallback = new Date(`${dateText}T${timeText}:00`);
  if (!Number.isNaN(fallback.getTime())) return fallback;

  return null;
}

function normalizeRange(range) {
  if (Array.isArray(range) && range.length > 0) {
    const sorted = [...range].sort((a, b) => a.getTime() - b.getTime());
    return { start: sorted[0], end: sorted[sorted.length - 1] };
  }

  if (range?.start instanceof Date && range?.end instanceof Date) {
    return { start: range.start, end: range.end };
  }

  return null;
}

function CalendarEventPill({ event }) {
  const booking = event?.resource || {};
  const origin = String(booking.origin_type || "").toLowerCase();
  const status = String(booking.status || "").toLowerCase();
  const typeLabel = origin === "eventwow" ? "Enquiry" : "Booking";
  const title = event?.title || "Booking";

  const baseClass =
    "inline-flex max-w-full items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-medium leading-4";
  const toneClass =
    origin === "eventwow"
      ? "bg-teal-700 text-white"
      : "bg-slate-600 text-white";
  const cancelledClass = status === "cancelled" ? "opacity-60 line-through" : "";

  return (
    <span className={`${baseClass} ${toneClass} ${cancelledClass}`}>
      <span className="rounded-full bg-white/20 px-1.5 py-[1px] text-[10px] uppercase tracking-wide">
        {typeLabel}
      </span>
      <span className="truncate">{title}</span>
    </span>
  );
}

export default function BookingsCalendar({
  rows,
  loading,
  onSelectBooking,
  onRangeChange,
  currentDate,
  currentView,
  onNavigate,
  onView,
}) {
  const events = useMemo(() => {
    return (rows || [])
      .map((booking) => {
        const start = parseDateTime(booking.event_date, booking.start_time || "00:00");
        if (!start) return null;

        const hasStartTime = !!safe(booking.start_time);
        const hasEndTime = !!safe(booking.end_time);

        let end = null;
        let allDay = false;

        if (!hasStartTime) {
          allDay = true;
          end = addDays(start, 1);
        } else if (hasEndTime) {
          end = parseDateTime(booking.event_date, booking.end_time) || addHours(start, 2);
        } else {
          end = addHours(start, 2);
        }

        return {
          id: booking.id,
          title: booking.customer_name || "Booking",
          start,
          end,
          allDay,
          resource: booking,
        };
      })
      .filter(Boolean);
  }, [rows]);

  const busyCount = useMemo(
    () => (rows || []).filter((row) => String(row.status || "").toLowerCase() === "confirmed").length,
    [rows]
  );

  function handleRangeChange(nextRange) {
    const normalized = normalizeRange(nextRange);
    if (!normalized || typeof onRangeChange !== "function") return;
    onRangeChange({
      from: format(normalized.start, "yyyy-MM-dd"),
      to: format(normalized.end, "yyyy-MM-dd"),
    });
  }

  function eventPropGetter(event) {
    const booking = event?.resource || {};
    const origin = String(booking.origin_type || "").toLowerCase();
    const status = String(booking.status || "").toLowerCase();

    let backgroundColor = origin === "eventwow" ? "#0f766e" : "#475569";
    let color = "#ffffff";
    let opacity = 1;

    if (status === "cancelled") {
      backgroundColor = "#64748b";
      opacity = 0.55;
    }

    return {
      style: {
        backgroundColor,
        color,
        borderRadius: "8px",
        border: "none",
        opacity,
        fontSize: "12px",
        padding: "2px 6px",
      },
    };
  }

  function dayPropGetter(day) {
    const dayKey = format(day, "yyyy-MM-dd");
    const isBusy = (rows || []).some((row) => {
      const sameDate = safe(row.event_date) === dayKey;
      const confirmed = String(row.status || "").toLowerCase() === "confirmed";
      return sameDate && confirmed;
    });

    if (!isBusy || currentView !== "month") return {};

    return {
      style: {
        backgroundColor: "rgba(15, 118, 110, 0.06)",
      },
    };
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2 text-sm">
        <div className="flex items-center gap-2">
          <span className="inline-flex items-center gap-1 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-teal-700" />
            Eventwow
          </span>
          <span className="inline-flex items-center gap-1 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-600" />
            External
          </span>
          <span className="inline-flex items-center gap-1 text-slate-600">
            <span className="h-2.5 w-2.5 rounded-full bg-slate-500/70" />
            Cancelled
          </span>
        </div>
        <p className="text-xs text-slate-500">Busy = at least one confirmed booking ({busyCount})</p>
      </div>

      <div className="min-h-[700px] overflow-hidden rounded-xl border border-slate-200 bg-white p-2">
        <Calendar
          localizer={localizer}
          events={events}
          startAccessor="start"
          endAccessor="end"
          view={currentView}
          onView={onView}
          views={["month", "week"]}
          date={currentDate}
          onNavigate={onNavigate}
          onRangeChange={handleRangeChange}
          onSelectEvent={(event) => onSelectBooking?.(event?.resource?.id || event?.id)}
          onSelectSlot={(slotInfo) => {
            if (!slotInfo?.start) return;
            const dayKey = format(slotInfo.start, "yyyy-MM-dd");
            const firstMatch = (rows || []).find((row) => safe(row.event_date) === dayKey);
            if (firstMatch?.id) onSelectBooking?.(firstMatch.id);
          }}
          selectable
          eventPropGetter={eventPropGetter}
          dayPropGetter={dayPropGetter}
          components={{
            event: CalendarEventPill,
          }}
          popup
          style={{ minHeight: 680 }}
          className={loading ? "opacity-60" : ""}
        />
      </div>
    </div>
  );
}
