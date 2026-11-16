import "@/test/env";
import { describe, expect, it } from "vitest";
import { NOTIFICATION_TEMPLATES, notificationText } from "@/lib/services/notifications";

const GENERIC_STUDENT_PREVIEW = "You have a new update in CampusCare.";

/** Words that would reveal an alert, a score, an instrument, a condition or a service type. */
const REVEALING =
  /alert|score|phq|gad|questionnaire|screen|assessment|depress|anxi|suicid|self.?harm|harm|crisis|risk|mental|diagnos|condition|stress|panic|counsel|psych|therap|clinic|appointment|referral|case|help/i;

const templates = Object.entries(NOTIFICATION_TEMPLATES);

describe("notification templates", () => {
  it("every student-audience template uses the generic preview", () => {
    const student = templates.filter(([, t]) => t.audience === "student");
    expect(student.length).toBeGreaterThan(0);
    for (const [name, t] of student) expect(t.preview, name).toBe(GENERIC_STUDENT_PREVIEW);
  });

  it("no preview mentions alert details, scores, instrument names or conditions", () => {
    for (const [name, t] of templates) expect(t.preview, name).not.toMatch(REVEALING);
  });

  it("no preview carries digits that could be a score or a phone number", () => {
    for (const [name, t] of templates) expect(t.preview, name).not.toMatch(/\d/);
  });

  it("every template has in-app text in both languages", () => {
    for (const [name, t] of templates) {
      expect(t.inApp.en.trim().length, name).toBeGreaterThan(0);
      expect(t.inApp.hi.trim().length, name).toBeGreaterThan(0);
    }
  });

  it("student in-app text never names an instrument, a score or a condition", () => {
    const clinical = /phq|gad|score|depress|anxi|suicid|self.?harm|diagnos|alert/i;
    for (const [name, t] of templates.filter(([, t]) => t.audience === "student")) {
      expect(t.inApp.en, name).not.toMatch(clinical);
    }
  });

  it("notificationText resolves by locale and falls back for unknown templates", () => {
    expect(notificationText("help_received", "en")).toBe(NOTIFICATION_TEMPLATES.help_received.inApp.en);
    expect(notificationText("help_received", "hi")).toBe(NOTIFICATION_TEMPLATES.help_received.inApp.hi);
    expect(notificationText("no_such_template", "en")).toBe("Update");
  });
});
