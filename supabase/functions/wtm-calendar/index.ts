// WTM calendar feed — Supabase Edge Function "wtm-calendar"
//
// Google Calendar, Outlook and Apple Calendar fetch this address on their own,
// with no sign-in header, so JWT checks must be off:
//
//   supabase functions deploy wtm-calendar --no-verify-jwt
//
// The only secret is the token in the address, made by wtm_calendar_feed.
// The function reads that person's tasks through wtm_feed_data.

import { createClient } from "npm:@supabase/supabase-js@2.45.4";

const DAYS = ["SU", "MO", "TU", "WE", "TH", "FR", "SA"];
const KIND: Record<string, string> = { event: "Event", booking: "Booking", holiday: "Public holiday" };

const esc = (s: unknown) => String(s ?? "").replace(/\\/g, "\\\\").replace(/\r?\n/g, "\\n").replace(/,/g, "\\,").replace(/;/g, "\\;");
const fold = (line: string) => {
  const out: string[] = [];
  let s = line;
  while (s.length > 73) { out.push(s.slice(0, 73)); s = " " + s.slice(73); }
  out.push(s);
  return out.join("\r\n");
};
const ymd = (day: string) => day.replace(/-/g, "");
function clock(day: string, hm: string, add = 0) {
  const [h, m] = hm.split(":").map(Number);
  const d = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m + add, 0);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}T${p(d.getHours())}${p(d.getMinutes())}00`;
}
function nextDay(day: string) {
  const d = new Date(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)) + 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}`;
}
function today() {
  const d = new Date(), p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

Deno.serve(async (req) => {
  if (req.method !== "GET") return new Response("Use GET.", { status: 405 });
  const token = new URL(req.url).searchParams.get("token") ?? "";
  if (!/^[0-9a-f]{64}$/.test(token)) return new Response("This calendar link is not valid.", { status: 404 });

  const admin = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { data, error } = await admin.rpc("wtm_feed_data", { p_token: token });
  if (error || !data) return new Response("This calendar link is not valid.", { status: 404 });

  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//WTM//Work Task Manager//EN", "CALSCALE:GREGORIAN", "METHOD:PUBLISH", "X-WR-CALNAME:WTM"];
  const add = (uid: string, summary: string, start: string, end: string, extra: string[]) => {
    lines.push("BEGIN:VEVENT", "UID:" + uid, "DTSTAMP:" + stamp, start, end, "SUMMARY:" + esc(summary), ...extra, "END:VEVENT");
  };
  const day = today();

  for (const t of data.jobs ?? []) {
    const when = t.due_time
      ? ["DTSTART:" + clock(t.due, t.due_time), "DTEND:" + clock(t.due, t.due_time, 30)]
      : ["DTSTART;VALUE=DATE:" + ymd(t.due), "DTEND;VALUE=DATE:" + nextDay(t.due)];
    add("job-" + t.id + "@wtm", t.title, when[0], when[1], ["CATEGORIES:Job"].concat(t.status === "done" ? ["STATUS:COMPLETED"] : []));
  }
  for (const d of data.daily ?? []) {
    const by = (d.weekdays ?? []).map((n: number) => DAYS[Number(n)]).filter(Boolean);
    if (!by.length) continue;
    const when = d.due_time
      ? ["DTSTART:" + clock(day, d.due_time), "DTEND:" + clock(day, d.due_time, 30)]
      : ["DTSTART;VALUE=DATE:" + ymd(day), "DTEND;VALUE=DATE:" + nextDay(day)];
    add("daily-" + d.id + "@wtm", d.title, when[0], when[1], ["RRULE:FREQ=WEEKLY;BYDAY=" + by.join(","), "CATEGORIES:Job"].concat(d.department ? ["DESCRIPTION:" + esc(d.department)] : []));
  }
  for (const c of data.entries ?? []) {
    const end = c.end_day || c.day;
    const when = c.starts
      ? ["DTSTART:" + clock(c.day, c.starts), "DTEND:" + clock(c.day, c.starts, 60)]
      : ["DTSTART;VALUE=DATE:" + ymd(c.day), "DTEND;VALUE=DATE:" + nextDay(end)];
    add(c.kind + "-" + c.id + "@wtm", c.title, when[0], when[1], ["CATEGORIES:" + (KIND[c.kind] || "Event")].concat(c.notes ? ["DESCRIPTION:" + esc(c.notes)] : []));
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.map(fold).join("\r\n") + "\r\n", {
    headers: { "Content-Type": "text/calendar; charset=utf-8", "Cache-Control": "public, max-age=900" },
  });
});
