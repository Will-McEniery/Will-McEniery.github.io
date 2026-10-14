import { test } from 'node:test';
import assert from 'node:assert/strict';
import { extractBusy } from '../scripts/lib/busy.mjs';

// A feed shaped like Outlook's (Windows zone name + VTIMEZONE) mixed with Google-style events.
const ICS = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Test//Test//EN
BEGIN:VTIMEZONE
TZID:E. Australia Standard Time
BEGIN:STANDARD
DTSTART:16010101T000000
TZOFFSETFROM:+1000
TZOFFSETTO:+1000
END:STANDARD
END:VTIMEZONE
BEGIN:VTIMEZONE
TZID:Europe/London
BEGIN:DAYLIGHT
TZOFFSETFROM:+0000
TZOFFSETTO:+0100
TZNAME:BST
DTSTART:19700329T010000
RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU
END:DAYLIGHT
BEGIN:STANDARD
TZOFFSETFROM:+0100
TZOFFSETTO:+0000
TZNAME:GMT
DTSTART:19701025T020000
RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU
END:STANDARD
END:VTIMEZONE
BEGIN:VEVENT
UID:simple-outlook
SUMMARY:Secret meeting title
DTSTART;TZID=E. Australia Standard Time:20261020T100000
DTEND;TZID=E. Australia Standard Time:20261020T110000
END:VEVENT
BEGIN:VEVENT
UID:weekly
SUMMARY:Weekly group meeting
DTSTART;TZID=E. Australia Standard Time:20261005T140000
DTEND;TZID=E. Australia Standard Time:20261005T150000
RRULE:FREQ=WEEKLY;BYDAY=MO
EXDATE;TZID=E. Australia Standard Time:20261012T140000
END:VEVENT
BEGIN:VEVENT
UID:weekly
RECURRENCE-ID;TZID=E. Australia Standard Time:20261019T140000
SUMMARY:Weekly group meeting (moved)
DTSTART;TZID=E. Australia Standard Time:20261019T160000
DTEND;TZID=E. Australia Standard Time:20261019T170000
END:VEVENT
BEGIN:VEVENT
UID:free-event
SUMMARY:Reminder
TRANSP:TRANSPARENT
DTSTART:20261021T000000Z
DTEND:20261021T010000Z
END:VEVENT
BEGIN:VEVENT
UID:outlook-free
SUMMARY:Tentative focus time
X-MICROSOFT-CDO-BUSYSTATUS:FREE
DTSTART:20261021T020000Z
DTEND:20261021T030000Z
END:VEVENT
BEGIN:VEVENT
UID:cancelled
STATUS:CANCELLED
DTSTART:20261021T040000Z
DTEND:20261021T050000Z
END:VEVENT
BEGIN:VEVENT
UID:all-day
SUMMARY:Conference
DTSTART;VALUE=DATE:20261022
DTEND;VALUE=DATE:20261023
END:VEVENT
BEGIN:VEVENT
UID:london
SUMMARY:Call with London
DTSTART;TZID=Europe/London:20261023T090000
DTEND;TZID=Europe/London:20261023T093000
END:VEVENT
BEGIN:VEVENT
UID:overlap-a
DTSTART:20261024T000000Z
DTEND:20261024T010000Z
END:VEVENT
BEGIN:VEVENT
UID:overlap-b
DTSTART:20261024T003000Z
DTEND:20261024T020000Z
END:VEVENT
BEGIN:VEVENT
UID:far-future
DTSTART:20270601T000000Z
DTEND:20270601T010000Z
END:VEVENT
END:VCALENDAR`.replace(/\n/g, '\r\n');

const busy = extractBusy(ICS, {
    from: Date.parse('2026-10-15T00:00Z'),
    to: Date.parse('2026-11-01T00:00Z'),
    ownerZone: 'Australia/Brisbane',
});

test('only start/end times come out, never titles', () => {
    assert.ok(busy.every((b) => Object.keys(b).join() === 'start,end'));
    assert.ok(!JSON.stringify(busy).includes('Secret'));
});

test('events in an Outlook (Windows-named) zone are converted correctly', () => {
    assert.ok(busy.some((b) => b.start === '2026-10-20T00:00:00.000Z' && b.end === '2026-10-20T01:00:00.000Z'));
});

test('recurring events expand, honour EXDATE and moved occurrences', () => {
    const weekly = busy.filter((b) => b.start.endsWith(':00:00.000Z') && /T0[4-7]:00/.test(b.start)).map((b) => b.start);
    // 19 Oct moved from 14:00 to 16:00 Brisbane (06:00Z); 26 Oct normal (04:00Z); 12 Oct excluded (before window anyway)
    assert.ok(weekly.includes('2026-10-19T06:00:00.000Z'));
    assert.ok(!weekly.includes('2026-10-19T04:00:00.000Z'));
    assert.ok(weekly.includes('2026-10-26T04:00:00.000Z'));
});

test('free, tentative-free and cancelled events are ignored', () => {
    for (const t of ['2026-10-21T00:00:00.000Z', '2026-10-21T02:00:00.000Z', '2026-10-21T04:00:00.000Z']) {
        assert.ok(!busy.some((b) => b.start === t), `${t} should not be busy`);
    }
});

test('all-day events block the whole day in the owner time zone', () => {
    assert.ok(busy.some((b) => b.start === '2026-10-21T14:00:00.000Z' && b.end === '2026-10-22T14:00:00.000Z'));
});

test('events in other zones (London, BST) land at the right instant', () => {
    assert.ok(busy.some((b) => b.start === '2026-10-23T08:00:00.000Z' && b.end === '2026-10-23T08:30:00.000Z'));
});

test('overlapping events merge and events outside the window are dropped', () => {
    assert.ok(busy.some((b) => b.start === '2026-10-24T00:00:00.000Z' && b.end === '2026-10-24T02:00:00.000Z'));
    assert.ok(!busy.some((b) => b.start.startsWith('2027')));
});
