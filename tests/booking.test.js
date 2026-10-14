import { test } from 'node:test';
import assert from 'node:assert/strict';
import { getParts, zonedToUtc, offsetMinutes, addDays, startOfDay, offsetLabel } from '../assets/js/booking/tz.js';
import { parseRange, normaliseConfig, generateSlots, canStartAt, buildWeekGrid, periodToInterval } from '../assets/js/booking/slots.js';

const iso = (ms) => new Date(ms).toISOString();
const NOW = Date.parse('2026-10-01T00:00Z'); // a 'now' before every test week
const utc = (s) => Date.parse(s);

const baseConfig = {
    timezone: 'Australia/Brisbane',
    slot_minutes: 30,
    durations: [30, 60],
    min_notice_hours: 0,
    horizon_weeks: 52,
    weekly: { mon: ['09:00-10:00'], wed: ['13:00-14:00'] },
};

test('zonedToUtc converts Brisbane wall time (UTC+10, no DST)', () => {
    assert.equal(iso(zonedToUtc(2026, 10, 20, 9, 0, 'Australia/Brisbane')), '2026-10-19T23:00:00.000Z');
    assert.equal(offsetMinutes(utc('2026-07-01T00:00Z'), 'Australia/Brisbane'), 600);
});

test('zonedToUtc follows daylight saving in Sydney and London', () => {
    // Sydney: AEST (+10) until 5 Oct 2026, AEDT (+11) after
    assert.equal(iso(zonedToUtc(2026, 10, 1, 9, 0, 'Australia/Sydney')), '2026-09-30T23:00:00.000Z');
    assert.equal(iso(zonedToUtc(2026, 10, 8, 9, 0, 'Australia/Sydney')), '2026-10-07T22:00:00.000Z');
    // London: BST (+1) until 25 Oct 2026
    assert.equal(iso(zonedToUtc(2026, 10, 20, 9, 0, 'Europe/London')), '2026-10-20T08:00:00.000Z');
    assert.equal(iso(zonedToUtc(2026, 10, 27, 9, 0, 'Europe/London')), '2026-10-27T09:00:00.000Z');
});

test('zonedToUtc returns NaN for skipped times and the earlier instant for repeated ones', () => {
    // London springs forward 01:00 -> 02:00 on 29 Mar 2026
    assert.ok(Number.isNaN(zonedToUtc(2026, 3, 29, 1, 30, 'Europe/London')));
    // London falls back 02:00 -> 01:00 on 25 Oct 2026; 01:30 happens twice (BST first)
    assert.equal(iso(zonedToUtc(2026, 10, 25, 1, 30, 'Europe/London')), '2026-10-25T00:30:00.000Z');
});

test('calendar helpers', () => {
    assert.deepEqual(addDays({ year: 2026, month: 12, day: 31 }, 1), { year: 2027, month: 1, day: 1 });
    assert.deepEqual(addDays({ year: 2026, month: 3, day: 1 }, -1), { year: 2026, month: 2, day: 28 });
    assert.equal(getParts(utc('2026-10-19T23:00Z'), 'Australia/Brisbane').weekday, 1); // Tuesday
    assert.equal(iso(startOfDay({ year: 2026, month: 10, day: 20 }, 'Europe/London')), '2026-10-19T23:00:00.000Z');
    assert.equal(offsetLabel(utc('2026-07-01T00:00Z'), 'Asia/Kolkata'), 'GMT+5:30');
    assert.equal(offsetLabel(utc('2026-01-01T00:00Z'), 'Europe/London'), 'GMT');
});

test('parseRange validates "HH:MM-HH:MM"', () => {
    assert.deepEqual(parseRange('09:00-12:30'), [540, 750]);
    assert.deepEqual(parseRange('18:00-00:00'), [1080, 1440]);
    assert.throws(() => parseRange('9-5'));
    assert.throws(() => parseRange('12:00-09:00'));
});

test('weekly hours become absolute slots in the owner time zone', () => {
    const config = normaliseConfig(baseConfig);
    const from = utc('2026-10-18T00:00Z');
    const to = utc('2026-10-25T00:00Z');
    const slots = generateSlots(config, { from, to, now: NOW });
    // Mon 19 Oct 09:00, 09:30 and Wed 21 Oct 13:00, 13:30 Brisbane
    assert.deepEqual(slots.map((s) => iso(s.start)), [
        '2026-10-18T23:00:00.000Z', '2026-10-18T23:30:00.000Z',
        '2026-10-21T03:00:00.000Z', '2026-10-21T03:30:00.000Z',
    ]);
    assert.ok(slots.every((s) => s.status === 'open' && s.end - s.start === 30 * 60000));
});

test('owner zone with daylight saving keeps the wall-clock hours across the change', () => {
    const config = normaliseConfig({ ...baseConfig, timezone: 'Europe/London', weekly: { mon: ['09:00-09:30'] } });
    const slots = generateSlots(config, { from: utc('2026-10-18T00:00Z'), to: utc('2026-11-02T00:00Z'), now: NOW });
    assert.deepEqual(slots.map((s) => iso(s.start)), ['2026-10-19T08:00:00.000Z', '2026-10-26T09:00:00.000Z']);
});

test('busy events, blocked periods, notice and horizon set the status', () => {
    const config = normaliseConfig({
        ...baseConfig,
        min_notice_hours: 24,
        horizon_weeks: 2,
        blocked: [{ start: '2026-10-21' }],
    });
    const now = utc('2026-10-17T12:00Z');
    const busy = [{ start: '2026-10-18T23:15:00Z', end: '2026-10-18T23:45:00Z' }];
    const slots = generateSlots(config, { from: utc('2026-10-18T00:00Z'), to: utc('2026-11-08T00:00Z'), now, busy });
    const status = Object.fromEntries(slots.map((s) => [iso(s.start), s.status]));
    assert.equal(status['2026-10-18T23:00:00.000Z'], 'busy');   // overlaps busy 23:15-23:45
    assert.equal(status['2026-10-18T23:30:00.000Z'], 'busy');
    assert.equal(status['2026-10-21T03:00:00.000Z'], 'blocked'); // whole day blocked
    assert.equal(status['2026-10-25T23:00:00.000Z'], 'open');
    assert.equal(status['2026-10-28T03:00:00.000Z'], 'open');
    assert.equal(status['2026-11-01T23:00:00.000Z'], 'beyond'); // more than two weeks ahead

    // 13 hours away with 24 hours' notice required
    const soon = generateSlots(config, { from: utc('2026-10-18T00:00Z'), to: utc('2026-10-19T12:00Z'), now: utc('2026-10-18T10:00Z') });
    assert.equal(soon[0].status, 'past');
});

test('blocked periods: whole days are inclusive, times are exact', () => {
    const tz = 'Australia/Brisbane';
    const [a, b] = periodToInterval({ start: '2026-12-24', end: '2026-12-26' }, tz);
    assert.equal(iso(a), '2026-12-23T14:00:00.000Z');
    assert.equal(iso(b), '2026-12-26T14:00:00.000Z');
    const [c, d] = periodToInterval({ start: '2026-11-03 14:00', end: '2026-11-03 16:30' }, tz);
    assert.equal(iso(c), '2026-11-03T04:00:00.000Z');
    assert.equal(iso(d), '2026-11-03T06:30:00.000Z');
});

test('extra openings add slots outside the weekly pattern', () => {
    const config = normaliseConfig({ ...baseConfig, extra: [{ start: '2026-10-24 10:00', end: '2026-10-24 11:00' }] });
    const slots = generateSlots(config, { from: utc('2026-10-23T00:00Z'), to: utc('2026-10-25T00:00Z'), now: NOW });
    assert.deepEqual(slots.map((s) => iso(s.start)), ['2026-10-24T00:00:00.000Z', '2026-10-24T00:30:00.000Z']);
});

test('a 60-minute meeting needs two consecutive open slots', () => {
    const config = normaliseConfig(baseConfig);
    const busy = [{ start: '2026-10-21T03:30:00Z', end: '2026-10-21T04:00:00Z' }];
    const slots = generateSlots(config, { from: utc('2026-10-18T00:00Z'), to: utc('2026-10-25T00:00Z'), now: NOW, busy });
    const byStart = new Map(slots.map((s) => [s.start, s]));
    assert.equal(canStartAt(byStart, utc('2026-10-18T23:00Z'), 60, 30), true);
    assert.equal(canStartAt(byStart, utc('2026-10-18T23:30Z'), 60, 30), false); // runs past 10:00
    assert.equal(canStartAt(byStart, utc('2026-10-21T03:00Z'), 60, 30), false); // second half busy
    assert.equal(canStartAt(byStart, utc('2026-10-21T03:00Z'), 30, 30), true);
});

test('a London visitor sees Brisbane Monday morning on their Sunday night / Monday', () => {
    const config = normaliseConfig({ ...baseConfig, weekly: { mon: ['09:00-17:00'] } });
    const visitor = 'Europe/London';
    // Visitor week Mon 26 Oct - Sun 1 Nov 2026 (London on GMT by then)
    const days = Array.from({ length: 7 }, (_, i) => addDays({ year: 2026, month: 10, day: 26 }, i));
    const from = startOfDay(days[0], visitor);
    const to = startOfDay(addDays(days[6], 1), visitor);
    const slots = generateSlots(config, { from, to, now: NOW });
    const { rows, cells } = buildWeekGrid(slots, days, visitor, 30);

    // Brisbane Mon 2 Nov 09:00 = Sun 1 Nov 23:00 London: the last column, last row
    assert.ok(cells.get('6:1380'), 'Sunday 23:00 should be available');
    // Brisbane Mon 26 Oct 09:00-17:00 = Sun 25 Oct 23:00 to Mon 26 Oct 07:00 London
    assert.ok(cells.get('0:0') && cells.get('0:390'), 'Monday 00:00-07:00 should be available');
    assert.equal(cells.get('0:420'), undefined);
    // 07:00-23:00 has nothing, so it collapses into one gap row
    const gaps = rows.filter((r) => r.gap);
    assert.equal(gaps.length, 1);
    assert.deepEqual([gaps[0].from, gaps[0].to], [420, 1380]);
});

test('a visitor half an hour out of phase (India) still lines up', () => {
    const config = normaliseConfig({ ...baseConfig, weekly: { mon: ['09:00-11:00'] } });
    const visitor = 'Asia/Kolkata'; // UTC+5:30, Brisbane 09:00 = 04:30
    const days = Array.from({ length: 7 }, (_, i) => addDays({ year: 2026, month: 10, day: 19 }, i));
    const slots = generateSlots(config, { from: startOfDay(days[0], visitor), to: startOfDay(addDays(days[6], 1), visitor), now: NOW });
    const { rows } = buildWeekGrid(slots, days, visitor, 30);
    assert.deepEqual(rows.map((r) => r.minutes), [270, 300, 330, 360]);
});
