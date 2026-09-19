import { describe, expect, it } from "vitest";
import { normalizeCalendarEvent } from "./CalendarPage";

describe("normalizeCalendarEvent", () => {
  it("converts an appointment API event into the shape rendered by the calendar", () => {
    const event = normalizeCalendarEvent({
      id: "appointment_42",
      int_id: 42,
      title: "Meeting: Project review",
      description: "Review the project proposal",
      start_time: "2026-09-21 14:30",
      end_time: null,
      event_type: "appointment",
      color: "#059669",
    });

    expect(event).toMatchObject({
      id: "appointment_42",
      raw_id: 42,
      start: "2026-09-21T14:30",
      end: "2026-09-21T14:30",
      type: "appointment",
      editable: false,
    });
  });
});
