// Availability logic for the booking page. Pure functions: no DOM, no clock (pass `now`).
//
// The owner's rules (weekly hours, one-off blocks, extra openings) are written in the owner's
// time zone. They are expanded date by date in that zone into absolute instants, so daylight
// saving on either side and slots that fall on a different calendar day for the visitor are
// handled naturally. The visitor-side view then regroups those instants by the visitor's days.

import { getParts, zonedToUtc, addDays, weekdayOf, sameDate, startOfDay } from './tz.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const MINUTE = 60000;

// "09:00-12:30" -> [540, 750]
export function parseRange(text) {
    const m = /^\s*(\d{1,2}):(\d{2})\s*[-–]\s*(\d{1,2}):(\d{2})\s*$/.exec(String(text));
    if (!m) throw new Error(`Bad time range "${text}" (expected "HH:MM-HH:MM")`);
    const a = Number(m[1]) * 60 + Number(m[2]);
    let b = Number(m[3]) * 60 + Number(m[4]);
    if (b === 0) b = 24 * 60; // "18:00-00:00" means until midnight
    if (b <= a) throw new Error(`Time range "${text}" ends before it starts`);
    return [a, b];
}

// "2026-12-24" or "2026-12-24 14:30" (owner's zone) -> { date, minutes|null }
export function parseLocal(text) {
    const m = /^\s*(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{1,2}):(\d{2}))?\s*$/.exec(String(text));
    if (!m) throw new Error(`Bad date "${text}" (expected "YYYY-MM-DD" or "YYYY-MM-DD HH:MM")`);
    const date = { year: Number(m[1]), month: Number(m[2]), day: Number(m[3]) };
    return { date, minutes: m[4] === undefined ? null : Number(m[4]) * 60 + Number(m[5]) };
}

function localToUtc(date, minutes, timeZone) {
    if (minutes >= 24 * 60) return startOfDay(addDays(date, 1), timeZone);
    return zonedToUtc(date.year, date.month, date.day, Math.floor(minutes / 60), minutes % 60, timeZone);
}

// A configured { start, end } period in the owner's zone -> [startMs, endMs).
// Whole-day ends are inclusive ("2026-12-24" to "2026-12-26" blocks three days).
export function periodToInterval(period, timeZone) {
    const s = parseLocal(period.start);
    const e = parseLocal(period.end ?? period.start);
    const start = s.minutes === null ? startOfDay(s.date, timeZone) : localToUtc(s.date, s.minutes, timeZone);
    const end = e.minutes === null ? startOfDay(addDays(e.date, 1), timeZone) : localToUtc(e.date, e.minutes, timeZone);
    return [start, end];
}

function overlaps(start, end, intervals) {
    for (const [a, b] of intervals) if (start < b && a < end) return true;
    return false;
}

// Normalise the YAML config into what the generator needs (and fail loudly on typos).
export function normaliseConfig(raw) {
    const slotMinutes = Number(raw.slot_minutes) || 30;
    const weekly = {};
    for (const key of DAY_KEYS) {
        const ranges = raw.weekly?.[key];
        weekly[key] = Array.isArray(ranges) ? ranges.filter(Boolean).map(parseRange) : [];
    }
    const durations = (raw.durations?.length ? raw.durations : [slotMinutes]).map(Number)
        .filter((d) => d > 0 && d % slotMinutes === 0);
    return {
        timeZone: raw.timezone || 'UTC',
        slotMinutes,
        durations: durations.length ? durations : [slotMinutes],
        minNoticeMs: (Number(raw.min_notice_hours) || 0) * 60 * MINUTE,
        horizonMs: (Number(raw.horizon_weeks) || 6) * 7 * 24 * 60 * MINUTE,
        weekly,
        blocked: (raw.blocked || []).filter(Boolean),
        extra: (raw.extra || []).filter(Boolean),
    };
}

// Every slot the owner offers that starts in [from, to), with a status:
//   'open'    bookable
//   'busy'    clashes with a calendar event
//   'blocked' inside a one-off blocked period
//   'past'    too soon (before now + minimum notice)
//   'beyond'  too far ahead (after now + horizon)
// busy: array of { start, end } (ISO strings or epoch ms).
export function generateSlots(config, { from, to, now, busy = [] }) {
    const { timeZone, slotMinutes, weekly } = config;
    const slotMs = slotMinutes * MINUTE;
    const blocked = config.blocked.map((p) => periodToInterval(p, timeZone));
    const busyIntervals = busy
        .map((b) => [toMs(b.start), toMs(b.end)])
        .filter(([a, b]) => Number.isFinite(a) && Number.isFinite(b) && b > a);

    const starts = new Set();
    const addRange = (date, fromMin, toMin) => {
        for (let m = fromMin; m + slotMinutes <= toMin; m += slotMinutes) {
            const start = localToUtc(date, m, timeZone);
            if (!Number.isNaN(start) && start >= from && start < to) starts.add(start);
        }
    };

    // Owner-local dates that can touch the window (pad a day each side for zone differences)
    let date = addDays(getParts(from, timeZone), -1);
    const last = addDays(getParts(to, timeZone), 1);
    while (!sameDate(date, addDays(last, 1))) {
        for (const [a, b] of weekly[DAY_KEYS[weekdayOf(date.year, date.month, date.day)]]) addRange(date, a, b);
        date = addDays(date, 1);
    }
    for (const period of config.extra) {
        const [a, b] = periodToInterval(period, timeZone);
        for (let s = a; s + slotMs <= b; s += slotMs) if (s >= from && s < to) starts.add(s);
    }

    return [...starts].sort((a, b) => a - b).map((start) => {
        const end = start + slotMs;
        let status = 'open';
        if (start < now + config.minNoticeMs) status = 'past';
        else if (start > now + config.horizonMs) status = 'beyond';
        else if (overlaps(start, end, blocked)) status = 'blocked';
        else if (overlaps(start, end, busyIntervals)) status = 'busy';
        return { start, end, status };
    });
}

// Can a meeting of `durationMinutes` start at this slot? (needs consecutive open slots)
export function canStartAt(slotsByStart, start, durationMinutes, slotMinutes) {
    for (let k = 0; k < durationMinutes / slotMinutes; k++) {
        const slot = slotsByStart.get(start + k * slotMinutes * MINUTE);
        if (!slot || slot.status !== 'open') return false;
    }
    return true;
}

// Lay a week of slots out for the visitor: 7 day columns (visitor's calendar) and rows of
// visitor clock times. Long runs of rows with nothing in them are collapsed into a single gap.
// days: array of 7 {year, month, day} in the visitor's zone.
export function buildWeekGrid(slots, days, visitorZone, slotMinutes) {
    const cells = new Map(); // `${dayIndex}:${minuteOfDay}` -> slot
    const used = new Set();
    for (const slot of slots) {
        const p = getParts(slot.start, visitorZone);
        const dayIndex = days.findIndex((d) => sameDate(d, p));
        if (dayIndex < 0) continue;
        const tod = p.hour * 60 + p.minute;
        cells.set(`${dayIndex}:${tod}`, slot);
        used.add(tod);
    }
    if (!used.size) return { rows: [], cells };

    const times = [...used].sort((a, b) => a - b);
    const phase = times[0] % slotMinutes;
    const rows = [];
    let gap = null;
    for (let t = times[0]; t <= times[times.length - 1]; t += slotMinutes) {
        if (used.has(t)) {
            if (gap) {
                if (gap.length >= 3) rows.push({ gap: true, from: gap[0], to: gap[gap.length - 1] + slotMinutes });
                else for (const g of gap) rows.push({ minutes: g });
                gap = null;
            }
            rows.push({ minutes: t });
        } else {
            (gap ||= []).push(t);
        }
    }
    // Times that don't sit on the row phase (rare: a 30-min DST shift) get their own rows
    for (const t of times) if (t % slotMinutes !== phase) rows.push({ minutes: t });
    rows.sort((a, b) => (a.minutes ?? a.from) - (b.minutes ?? b.from));
    return { rows, cells };
}

function toMs(value) {
    return typeof value === 'number' ? value : Date.parse(value);
}
