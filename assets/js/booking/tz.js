// Small time-zone toolkit on top of Intl (no libraries). All instants are epoch milliseconds;
// "wall time" means calendar date + clock time as read in a particular IANA time zone.

const formatters = new Map();

function partsFormatter(timeZone) {
    let f = formatters.get(timeZone);
    if (!f) {
        f = new Intl.DateTimeFormat('en-US', {
            timeZone,
            hourCycle: 'h23',
            year: 'numeric', month: 'numeric', day: 'numeric',
            hour: 'numeric', minute: 'numeric', second: 'numeric',
        });
        formatters.set(timeZone, f);
    }
    return f;
}

export function isValidTimeZone(timeZone) {
    try {
        partsFormatter(timeZone);
        return true;
    } catch (e) {
        return false;
    }
}

// Wall-clock fields of an instant in a zone. weekday: 0 = Monday ... 6 = Sunday.
export function getParts(epochMs, timeZone) {
    const out = {};
    for (const { type, value } of partsFormatter(timeZone).formatToParts(new Date(epochMs))) {
        if (type !== 'literal') out[type] = Number(value);
    }
    if (out.hour === 24) out.hour = 0; // very old engines
    out.weekday = weekdayOf(out.year, out.month, out.day);
    return out;
}

// Offset of the zone from UTC at an instant, in minutes (Brisbane: +600).
export function offsetMinutes(epochMs, timeZone) {
    const p = getParts(epochMs, timeZone);
    const asUtc = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    return Math.round((asUtc - Math.floor(epochMs / 1000) * 1000) / 60000);
}

// Instant at which the wall clock in `timeZone` reads the given date and time.
// Returns NaN for wall times skipped by a daylight-saving jump. For repeated wall times
// (clocks going back) it returns the earlier instant.
export function zonedToUtc(year, month, day, hour, minute, timeZone) {
    const naive = Date.UTC(year, month - 1, day, hour, minute);
    let best = NaN;
    // Try the offsets in force a day either side; this catches both sides of any transition.
    for (const probe of [naive - 86400000, naive, naive + 86400000]) {
        const candidate = naive - offsetMinutes(probe, timeZone) * 60000;
        const p = getParts(candidate, timeZone);
        if (p.year === year && p.month === month && p.day === day && p.hour === hour && p.minute === minute) {
            if (Number.isNaN(best) || candidate < best) best = candidate;
        }
    }
    return best;
}

// Calendar helpers on plain {year, month, day} dates (no time zone involved).
export function weekdayOf(year, month, day) {
    return (new Date(Date.UTC(year, month - 1, day)).getUTCDay() + 6) % 7;
}

export function addDays(date, n) {
    const d = new Date(Date.UTC(date.year, date.month - 1, date.day + n));
    return { year: d.getUTCFullYear(), month: d.getUTCMonth() + 1, day: d.getUTCDate() };
}

export function sameDate(a, b) {
    return a.year === b.year && a.month === b.month && a.day === b.day;
}

export function dateKey(d) {
    return `${d.year}-${String(d.month).padStart(2, '0')}-${String(d.day).padStart(2, '0')}`;
}

// Start of a calendar day in a zone (midnight, or the first valid minute if midnight was skipped).
export function startOfDay(date, timeZone) {
    for (let minutes = 0; minutes < 180; minutes += 15) {
        const t = zonedToUtc(date.year, date.month, date.day, Math.floor(minutes / 60), minutes % 60, timeZone);
        if (!Number.isNaN(t)) return t;
    }
    return Date.UTC(date.year, date.month - 1, date.day);
}

// "GMT+10", "GMT-3:30"
export function offsetLabel(epochMs, timeZone) {
    const m = offsetMinutes(epochMs, timeZone);
    const sign = m < 0 ? '-' : '+';
    const abs = Math.abs(m);
    const h = Math.floor(abs / 60);
    const mm = abs % 60;
    return m === 0 ? 'GMT' : `GMT${sign}${h}${mm ? `:${String(mm).padStart(2, '0')}` : ''}`;
}
