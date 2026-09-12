import {
  cloneElement,
  createContext,
  useContext,
  useMemo,
  useState,
} from "react";
import { createPortal } from "react-dom";
import { Button } from "../workspace/AdminPrimitives";
import { ChevronLeft, ChevronRight } from "lucide-react";
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

  const parsed = parse(
    `${dateText} ${timeText}`,
    "yyyy-MM-dd HH:mm",
    new Date(),
  );
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

  return (
    <span className={status === "cancelled" ? "line-through" : ""}>
      <span className="font-semibold">{typeLabel}: </span>
      {title}
      {status === "cancelled" ? " (cancelled)" : ""}
    </span>
  );
}

const CalendarViewContext = createContext("month");

function CalendarEventWrapper({ children }) {
  const view = useContext(CalendarViewContext);
  const control = cloneElement(children, { tabIndex: 0, role: "button" });
  // Month events sit in the library's table row, so retain a cell around the control.
  return view === "month" ? <div role="gridcell">{control}</div> : control;
}

const CalendarToolbarHost = createContext(null);

function CalendarToolbar({ label, onNavigate, onView, view }) {
  const host = useContext(CalendarToolbarHost);
  return host
    ? createPortal(
        <div className="rbc-toolbar">
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              aria-label="Previous calendar period"
              onClick={() => onNavigate("PREV")}
            >
              <ChevronLeft size={16} aria-hidden="true" />
            </Button>
            <Button variant="secondary" onClick={() => onNavigate("TODAY")}>
              Today
            </Button>
            <Button
              variant="secondary"
              aria-label="Next calendar period"
              onClick={() => onNavigate("NEXT")}
            >
              <ChevronRight size={16} aria-hidden="true" />
            </Button>
          </div>
          <strong className="rbc-toolbar-label">{label}</strong>
          <div className="flex flex-wrap gap-2">
            <Button
              variant={view === "month" ? "primary" : "secondary"}
              aria-pressed={view === "month"}
              onClick={() => onView("month")}
            >
              Month
            </Button>
            <Button
              variant={view === "week" ? "primary" : "secondary"}
              aria-pressed={view === "week"}
              onClick={() => onView("week")}
            >
              Week
            </Button>
          </div>
        </div>,
        host,
      )
    : null;
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
  const [toolbarHost, setToolbarHost] = useState(null);
  const events = useMemo(() => {
    return (rows || [])
      .map((booking) => {
        const start = parseDateTime(
          booking.event_date,
          booking.start_time || "00:00",
        );
        if (!start) return null;

        const hasStartTime = !!safe(booking.start_time);
        const hasEndTime = !!safe(booking.end_time);

        let end = null;
        let allDay = false;

        if (!hasStartTime) {
          allDay = true;
          end = addDays(start, 1);
        } else if (hasEndTime) {
          end =
            parseDateTime(booking.event_date, booking.end_time) ||
            addHours(start, 2);
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
    () =>
      (rows || []).filter(
        (row) => String(row.status || "").toLowerCase() === "confirmed",
      ).length,
    [rows],
  );

  function handleRangeChange(nextRange) {
    const normalized = normalizeRange(nextRange);
    if (!normalized || typeof onRangeChange !== "function") return;
    onRangeChange({
      from: format(normalized.start, "yyyy-MM-dd"),
      to: format(normalized.end, "yyyy-MM-dd"),
    });
  }

  const busyDates = useMemo(
    () =>
      new Set(
        (rows || [])
          .filter(
            (row) => String(row.status || "").toLowerCase() === "confirmed",
          )
          .map((row) => safe(row.event_date)),
      ),
    [rows],
  );

  function eventPropGetter(event) {
    const booking = event?.resource || {};
    const origin = String(booking.origin_type || "").toLowerCase();
    const status = String(booking.status || "").toLowerCase();
    return {
      className:
        status === "cancelled"
          ? "ew-calendar-cancelled"
          : origin === "eventwow"
            ? ""
            : "ew-calendar-external",
    };
  }

  function dayPropGetter(day) {
    if (currentView !== "month" || !busyDates.has(format(day, "yyyy-MM-dd")))
      return {};
    return { className: "ew-calendar-busy" };
  }

  return (
    <div className="ew-calendar space-y-3">
      <p className="ew-form-help">
        Eventwow enquiries and external bookings. Cancelled events are labelled
        and struck through. Busy = at least one confirmed booking ({busyCount}).
      </p>
      <p className="ew-form-help">
        On narrow screens, scroll the calendar horizontally or use the booking
        list above.
      </p>
      <div ref={setToolbarHost} />
      <CalendarViewContext.Provider value={currentView}>
        <CalendarToolbarHost.Provider value={toolbarHost}>
          <div
            className="ew-calendar-scroll"
            tabIndex={0}
            role="region"
            aria-label="Booking calendar grid"
          >
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
              onSelectEvent={(event) =>
                onSelectBooking?.(event?.resource?.id || event?.id)
              }
              onKeyPressEvent={(event, keyboardEvent) => {
                if (keyboardEvent.key !== "Enter" && keyboardEvent.key !== " ")
                  return;
                keyboardEvent.preventDefault();
                onSelectBooking?.(event?.resource?.id || event?.id);
              }}
              onSelectSlot={(slotInfo) => {
                if (!slotInfo?.start) return;
                const dayKey = format(slotInfo.start, "yyyy-MM-dd");
                const firstMatch = (rows || []).find(
                  (row) => safe(row.event_date) === dayKey,
                );
                if (firstMatch?.id) onSelectBooking?.(firstMatch.id);
              }}
              selectable
              eventPropGetter={eventPropGetter}
              dayPropGetter={dayPropGetter}
              components={{
                event: CalendarEventPill,
                eventWrapper: CalendarEventWrapper,
                toolbar: CalendarToolbar,
              }}
              popup
              className={loading ? "opacity-60" : ""}
            />
          </div>
        </CalendarToolbarHost.Provider>
      </CalendarViewContext.Provider>
    </div>
  );
}
