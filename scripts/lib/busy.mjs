// Turn an iCalendar (.ics) feed into a list of busy periods, keeping only start/end times.
// Used by scripts/sync-calendar.mjs (in CI) and by the unit tests.

import ICAL from 'ical.js';
import { zonedToUtc, startOfDay, isValidTimeZone } from '../../assets/js/booking/tz.js';

const MAX_OCCURRENCES = 5000;

function prop(component, name) {
    const value = component.getFirstPropertyValue(name);
    return value === null || value === undefined ? '' : String(value).toUpperCase();
}

// Events marked "free" (Google/Apple: TRANSP:TRANSPARENT, Outlook: BUSYSTATUS FREE) or cancelled don't block time.
function blocksTime(component) {
    if (prop(component, 'status') === 'CANCELLED') return false;
    if (prop(component, 'transp') === 'TRANSPARENT') return false;
    if (prop(component, 'x-microsoft-cdo-busystatus') === 'FREE') return false;
    return true;
}

// ICAL.Time -> epoch ms. Date-only values and floating times are read in `fallbackZone`
// (the owner's zone); unknown TZIDs that are valid IANA names are honoured directly.
function toMs(time, fallbackZone) {
    if (time.isDate) return startOfDay({ year: time.year, month: time.month, day: time.day }, fallbackZone);
    const zone = time.zone;
    const isFloating = !zone || zone === ICAL.Timezone.localTimezone || zone.tzid === 'floating';
    if (!isFloating) return time.toUnixTime() * 1000;
    const tzid = time.timezone && isValidTimeZone(time.timezone) ? time.timezone : fallbackZone;
    const ms = zonedToUtc(time.year, time.month, time.day, time.hour, time.minute, tzid);
    return Number.isNaN(ms) ? zonedToUtc(time.year, time.month, time.day, time.hour + 1, time.minute, tzid) : ms;
}

function mergeIntervals(intervals) {
    const sorted = intervals.filter(([a, b]) => b > a).sort((x, y) => x[0] - y[0]);
    const out = [];
    for (const [a, b] of sorted) {
        const last = out[out.length - 1];
        if (last && a <= last[1]) last[1] = Math.max(last[1], b);
        else out.push([a, b]);
    }
    return out;
}

export function extractBusy(icsText, { from, to, ownerZone }) {
    const root = new ICAL.Component(ICAL.parse(icsText));
    for (const vtimezone of root.getAllSubcomponents('vtimezone')) {
        ICAL.TimezoneService.register(vtimezone);
    }

    const masters = new Map();
    const orphans = [];
    const exceptions = [];
    for (const vevent of root.getAllSubcomponents('vevent')) {
        const event = new ICAL.Event(vevent);
        if (event.isRecurrenceException()) exceptions.push(event);
        else masters.set(event.uid, event);
    }
    for (const exception of exceptions) {
        const master = masters.get(exception.uid);
        if (master) master.relateException(exception);
        else orphans.push(exception);
    }

    const intervals = [];
    const add = (component, start, end) => {
        if (end > from && start < to && blocksTime(component)) intervals.push([start, end]);
    };

    for (const event of [...masters.values(), ...orphans]) {
        if (!event.startDate) continue;
        if (!event.isRecurring() || orphans.includes(event)) {
            const start = toMs(event.startDate, ownerZone);
            const end = event.endDate ? toMs(event.endDate, ownerZone) : start;
            add(event.component, start, end);
            continue;
        }
        const iterator = event.iterator();
        for (let n = 0, next = iterator.next(); next && n < MAX_OCCURRENCES; n++, next = iterator.next()) {
            // Stop on the original (unmoved) occurrence time; moved exceptions are filtered by add()
            if (toMs(next, ownerZone) >= to + 2 * 86400000) break;
            const details = event.getOccurrenceDetails(next);
            add(details.item.component, toMs(details.startDate, ownerZone), toMs(details.endDate, ownerZone));
        }
    }

    return mergeIntervals(intervals).map(([a, b]) => ({ start: new Date(a).toISOString(), end: new Date(b).toISOString() }));
}
