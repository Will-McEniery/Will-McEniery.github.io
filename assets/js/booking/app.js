// "Book a meeting" page: week timetable in the visitor's time zone + request form.
// Availability rules live in _data/booking.yml (owner's time zone); busy times in _data/busy.json.

import { normaliseConfig, generateSlots, canStartAt, buildWeekGrid } from './slots.js';
import { getParts, addDays, startOfDay, offsetLabel, isValidTimeZone, sameDate } from './tz.js';

const MINUTE = 60000;
const DAY_MS = 86400000;
const ZONE_STORAGE_KEY = 'booking-zone';
const $ = (id) => document.getElementById(id);

const root = $('booking');

function readJson(id) {
    try {
        return JSON.parse($(id)?.textContent || 'null');
    } catch (e) {
        return null;
    }
}

function el(tag, attrs = {}, ...children) {
    const node = document.createElement(tag);
    for (const [key, value] of Object.entries(attrs)) {
        if (value === false || value === null || value === undefined) continue;
        if (key === 'class') node.className = value;
        else if (key === 'text') node.textContent = value;
        else if (key.startsWith('data-')) node.setAttribute(key, value);
        else if (key in node && typeof value !== 'string') node[key] = value;
        else node.setAttribute(key, value === true ? '' : value);
    }
    for (const child of children.flat()) {
        if (child !== null && child !== undefined && child !== false) node.append(child);
    }
    return node;
}

// ---------------------------------------------------------------- formatting (visitor's locale)

const formatters = new Map();
function formatter(timeZone, options) {
    const key = timeZone + JSON.stringify(options);
    if (!formatters.has(key)) formatters.set(key, new Intl.DateTimeFormat(undefined, { timeZone, ...options }));
    return formatters.get(key);
}
const TIME = { hour: 'numeric', minute: '2-digit' };
const LONG_DAY = { weekday: 'long', day: 'numeric', month: 'long' };

function formatTimeRange(start, end, zone) {
    const f = formatter(zone, TIME);
    return typeof f.formatRange === 'function' ? f.formatRange(start, end) : `${f.format(start)} – ${f.format(end)}`;
}
function formatWhen(start, end, zone) {
    return `${formatter(zone, LONG_DAY).format(start)}, ${formatTimeRange(start, end, zone)}`;
}
// Calendar dates and clock times that are already "local": format them in UTC so nothing shifts.
function formatDate(date, options) {
    return formatter('UTC', options).format(Date.UTC(date.year, date.month - 1, date.day));
}
function formatClock(minutes) {
    return formatter('UTC', TIME).format(Date.UTC(2000, 0, 1, Math.floor(minutes / 60), minutes % 60));
}
function placeName(zone) {
    const parts = zone.split('/');
    return parts[parts.length - 1].replace(/_/g, ' ');
}

// ---------------------------------------------------------------- page

function init() {
    const raw = readJson('booking-config') || {};
    const owner = readJson('booking-owner') || {};
    const busyData = readJson('booking-busy') || {};

    let config;
    try {
        config = normaliseConfig(raw);
        if (!isValidTimeZone(config.timeZone)) throw new Error(`unknown time zone "${config.timeZone}"`);
    } catch (err) {
        console.error('Booking settings problem:', err);
        root.replaceWith(el('p', { class: 'notice' },
            'The booking timetable is unavailable right now. Please email me at ',
            el('a', { href: `mailto:${owner.email}`, text: owner.email }), ' instead.'));
        return;
    }

    const ownerName = owner.name || 'Will';
    const ownerZone = config.timeZone;
    const busy = Array.isArray(busyData.events) ? busyData.events : [];
    const meetingTypes = Array.isArray(raw.meeting_types) && raw.meeting_types.length
        ? raw.meeting_types
        : [{ id: 'video', label: 'Video call' }];
    const delivery = raw.form || {};
    const detectedZone = detectZone();
    const narrow = window.matchMedia('(max-width: 640px)');

    const state = {
        zone: storedZone() || detectedZone,
        week: 0,
        day: null,
        duration: config.durations[0],
        selection: null,
        byStart: new Map(),
        scrollToFirst: true, // scroll the grid to the first free time on the next render
    };

    const table = $('week-grid');
    const form = $('booking-form');
    root.hidden = false;

    buildZoneSelect();
    buildDurationOptions();
    buildTypeOptions();
    bindEvents();
    showSyncNote();
    refresh();

    // ------------------------------------------------------------ setup helpers

    function detectZone() {
        try {
            const zone = Intl.DateTimeFormat().resolvedOptions().timeZone;
            if (zone && isValidTimeZone(zone)) return zone;
        } catch (e) { /* fall through */ }
        return 'UTC';
    }

    function storedZone() {
        try {
            const zone = localStorage.getItem(ZONE_STORAGE_KEY);
            return zone && isValidTimeZone(zone) ? zone : null;
        } catch (e) {
            return null;
        }
    }

    function buildZoneSelect() {
        const select = $('tz-select');
        const now = Date.now();
        let zones = [];
        try { zones = Intl.supportedValuesOf('timeZone'); } catch (e) { /* older browsers */ }
        zones = [...new Set([...zones, detectedZone, ownerZone, state.zone, 'UTC'])];

        const label = (zone) => `${zone.replace(/_/g, ' ')} (${offsetLabel(now, zone)})`;
        const suggested = el('optgroup', { label: 'Suggested' },
            el('option', { value: detectedZone, text: `Your time zone: ${label(detectedZone)}` }),
            ownerZone !== detectedZone ? el('option', { value: ownerZone, text: `${ownerName}'s time zone: ${label(ownerZone)}` }) : null);
        select.append(suggested);

        const groups = new Map();
        for (const zone of zones.sort()) {
            const region = zone.includes('/') ? zone.split('/')[0] : 'Other';
            if (!groups.has(region)) groups.set(region, el('optgroup', { label: region }));
            groups.get(region).append(el('option', { value: zone, text: label(zone) }));
        }
        for (const group of groups.values()) select.append(group);
        select.value = state.zone;
    }

    function buildDurationOptions() {
        const box = $('duration-options');
        for (const minutes of config.durations) {
            const id = `duration-${minutes}`;
            box.append(
                el('input', { type: 'radio', name: 'duration', id, value: String(minutes), checked: minutes === state.duration }),
                el('label', { for: id, text: minutes % 60 === 0 ? `${minutes / 60} hour${minutes > 60 ? 's' : ''}` : `${minutes} min` }));
        }
    }

    function buildTypeOptions() {
        const box = $('type-options');
        meetingTypes.forEach((type, i) => {
            const id = `type-${type.id || i}`;
            box.append(el('label', { class: 'choice', for: id },
                el('input', { type: 'radio', name: 'type', id, value: type.label, required: true, defaultChecked: i === 0 }),
                el('span', { class: 'choice-text' },
                    el('span', { class: 'choice-label', text: type.label }),
                    type.note ? el('span', { class: 'choice-note', text: type.note }) : null)));
        });
    }

    function showSyncNote() {
        if (!busyData.updated) return;
        const minutes = Math.round((Date.now() - Date.parse(busyData.updated)) / MINUTE);
        if (!Number.isFinite(minutes) || minutes < 0) return;
        const note = $('sync-note');
        note.textContent = `Busy times were last synced from my calendar ${minutes < 2 ? 'just now' : minutes < 120 ? `${minutes} minutes ago` : `${Math.round(minutes / 60)} hours ago`}.`;
        note.hidden = false;
    }

    // ------------------------------------------------------------ events

    function bindEvents() {
        $('tz-select').addEventListener('change', (e) => setZone(e.target.value));
        $('tz-toggle').addEventListener('click', () => setZone(state.zone === ownerZone ? detectedZone : ownerZone));

        $('duration-options').addEventListener('change', (e) => {
            state.duration = Number(e.target.value);
            if (state.selection !== null && !stillAvailable(state.selection)) {
                state.selection = null;
                setStatus(`That time doesn't have room for ${state.duration} minutes, so I've cleared it. Please pick another.`, 'info');
            }
            refresh();
        });

        $('week-prev').addEventListener('click', () => changeWeek(state.week - 1));
        $('week-next').addEventListener('click', () => changeWeek(state.week + 1));
        $('week-today').addEventListener('click', () => changeWeek(0));

        table.addEventListener('click', (e) => {
            const button = e.target.closest('button[data-start]');
            if (button && !button.disabled) select(Number(button.dataset.start));
        });
        table.addEventListener('mouseover', (e) => {
            const button = e.target.closest('button[data-start]');
            highlight(button && !button.disabled ? Number(button.dataset.start) : null, 'is-hover');
        });
        table.addEventListener('mouseleave', () => highlight(null, 'is-hover'));
        table.addEventListener('keydown', onGridKey);

        $('day-tabs').addEventListener('click', (e) => {
            const tab = e.target.closest('[data-day]');
            if (!tab) return;
            state.day = Number(tab.dataset.day);
            state.scrollToFirst = true;
            refresh();
            $('day-tabs').querySelector(`[data-day="${state.day}"]`)?.focus();
        });

        narrow.addEventListener?.('change', refresh);
        form.addEventListener('submit', onSubmit);
    }

    function setZone(zone) {
        if (!isValidTimeZone(zone)) return;
        state.zone = zone;
        $('tz-select').value = zone;
        try { localStorage.setItem(ZONE_STORAGE_KEY, zone); } catch (e) { /* not essential */ }
        state.day = null;
        state.scrollToFirst = true;
        refresh();
    }

    function changeWeek(week) {
        state.week = Math.max(0, Math.min(maxWeek(), week));
        state.day = null;
        state.scrollToFirst = true;
        refresh();
    }

    function select(start) {
        state.selection = start;
        setStatus('');
        refresh();
        table.querySelector(`button[data-start="${start}"]`)?.focus();
    }

    // ------------------------------------------------------------ week model

    function weekDays(week = state.week) {
        const today = getParts(Date.now(), state.zone);
        const monday = addDays(today, -today.weekday + 7 * week);
        return Array.from({ length: 7 }, (_, i) => addDays(monday, i));
    }

    function maxWeek() {
        const monday = weekDays(0)[0];
        const last = getParts(Date.now() + config.horizonMs, state.zone);
        const days = (Date.UTC(last.year, last.month - 1, last.day) - Date.UTC(monday.year, monday.month - 1, monday.day)) / DAY_MS;
        return Math.max(0, Math.floor(days / 7));
    }

    function cellState(slot) {
        if (!slot) return 'off';
        if (slot.status === 'busy') return 'busy';
        if (slot.status !== 'open') return 'off';
        return canStartAt(state.byStart, slot.start, state.duration, config.slotMinutes) ? 'open' : 'short';
    }

    // ------------------------------------------------------------ rendering

    function refresh() {
        const days = weekDays();
        const from = startOfDay(days[0], state.zone);
        const to = startOfDay(addDays(days[6], 1), state.zone);
        const longest = Math.max(...config.durations);
        // Generate a little past the week so meetings that start late on Sunday can be checked
        const slots = generateSlots(config, { from, to: to + longest * MINUTE, now: Date.now(), busy });
        state.byStart = new Map(slots.map((s) => [s.start, s]));
        const grid = buildWeekGrid(slots.filter((s) => s.start < to), days, state.zone, config.slotMinutes);

        const openDays = days.map((_, d) => [...grid.cells.entries()].some(([key, slot]) => key.startsWith(`${d}:`) && cellState(slot) === 'open'));
        if (state.day === null) {
            const todayIndex = days.findIndex((d) => sameDate(d, getParts(Date.now(), state.zone)));
            state.day = openDays[todayIndex] ? todayIndex : Math.max(0, openDays.indexOf(true));
        }

        renderToolbar(days);
        renderDayTabs(days, openDays);
        renderTable(days, grid, openDays);
        renderSelection();
    }

    function renderToolbar(days) {
        const sameMonth = days[0].month === days[6].month;
        const month = sameMonth && !narrow.matches ? 'long' : 'short';
        $('week-label').textContent = `${formatDate(days[0], sameMonth ? { day: 'numeric' } : { day: 'numeric', month })} – ${formatDate(days[6], { day: 'numeric', month, year: 'numeric' })}`;
        $('week-prev').disabled = state.week <= 0;
        $('week-next').disabled = state.week >= maxWeek();
        $('week-today').disabled = state.week === 0;

        const toggle = $('tz-toggle');
        if (state.zone !== ownerZone) {
            toggle.textContent = `Show in ${ownerName}'s time`;
            toggle.hidden = false;
        } else {
            toggle.textContent = 'Back to your time zone';
            toggle.hidden = detectedZone === ownerZone;
        }
    }

    function renderDayTabs(days, openDays) {
        const tabs = $('day-tabs');
        tabs.hidden = !narrow.matches;
        tabs.textContent = '';
        if (!narrow.matches) return;
        days.forEach((date, d) => {
            tabs.append(el('button', {
                type: 'button', role: 'tab', class: `day-tab${openDays[d] ? ' has-open' : ''}`,
                'aria-selected': String(d === state.day), 'data-day': String(d), tabindex: d === state.day ? '0' : '-1',
            },
            el('span', { class: 'day-tab-dow', text: formatDate(date, { weekday: 'short' }) }),
            el('span', { class: 'day-tab-dom', text: formatDate(date, { day: 'numeric' }) })));
        });
    }

    function renderTable(days, { rows, cells }, openDays) {
        table.textContent = '';
        const empty = $('grid-empty');
        const visible = narrow.matches ? [state.day] : [0, 1, 2, 3, 4, 5, 6];
        const today = getParts(Date.now(), state.zone);

        if (!rows.length || !visible.some((d) => openDays[d])) {
            empty.hidden = false;
            empty.textContent = !rows.length
                ? 'There are no times on offer this week. Try the next week.'
                : narrow.matches
                    ? 'Nothing free on this day. Try another day or week.'
                    : 'Everything this week is taken or too soon. Try the next week.';
        } else {
            empty.hidden = true;
        }
        $('grid-wrap').hidden = !rows.length;
        if (!rows.length) return;

        const head = el('tr', {}, el('th', { scope: 'col', class: 'time-col' }, el('span', { class: 'visually-hidden', text: 'Time' })));
        for (const d of visible) {
            head.append(el('th', { scope: 'col', class: `day-col${sameDate(days[d], today) ? ' is-today' : ''}` },
                el('span', { class: 'day-dow', text: formatDate(days[d], { weekday: 'short' }) }),
                el('span', { class: 'day-dom', text: formatDate(days[d], { day: 'numeric' }) })));
        }
        table.append(el('thead', {}, head));

        // Status of every visible cell, so runs of the same status can be drawn as one block
        const statusAt = (rowIndex, d) => {
            const row = rows[rowIndex];
            if (!row || row.gap) return null;
            return cellState(cells.get(`${d}:${row.minutes}`));
        };

        const body = el('tbody');
        const selEnd = state.selection === null ? null : state.selection + state.duration * MINUTE;
        rows.forEach((row, r) => {
            if (row.gap) {
                body.append(el('tr', { class: 'gap-row' },
                    el('td', { colspan: String(visible.length + 1) },
                        el('span', { text: `${formatClock(row.from)} – ${formatClock(row.to % 1440)}: no times available` }))));
                return;
            }
            const tr = el('tr', { class: row.minutes % 60 === 0 ? 'on-hour' : 'off-hour' },
                el('th', { scope: 'row', class: 'time-label', text: formatClock(row.minutes) }));
            visible.forEach((d, c) => {
                const slot = cells.get(`${d}:${row.minutes}`);
                const status = statusAt(r, d);
                const classes = [`cell`, `cell-${status}`];
                if (statusAt(r - 1, d) !== status) classes.push('run-top');
                if (statusAt(r + 1, d) !== status) classes.push('run-bottom');
                if (slot && selEnd !== null && slot.start >= state.selection && slot.start < selEnd) {
                    classes.push('is-selected');
                    if (slot.start === state.selection) classes.push('sel-top');
                    if (slot.start + config.slotMinutes * MINUTE === selEnd) classes.push('sel-bottom');
                }
                const td = el('td', { class: classes.join(' '), 'data-start': slot ? String(slot.start) : null });
                if (status === 'busy') td.title = 'Busy';
                if (status === 'open' || status === 'short') {
                    const end = slot.start + state.duration * MINUTE;
                    const selected = slot.start === state.selection;
                    td.append(el('button', {
                        type: 'button',
                        class: 'slot-button',
                        'data-start': String(slot.start),
                        'data-row': String(r),
                        'data-col': String(c),
                        tabindex: '-1',
                        disabled: status === 'short',
                        title: status === 'short' ? `Not enough free time here for ${state.duration} minutes` : null,
                        'aria-pressed': String(selected),
                        'aria-label': `${formatWhen(slot.start, end, state.zone)}${status === 'short' ? ', too short' : ''}`,
                    }));
                }
                tr.append(td);
            });
            body.append(tr);
        });
        table.append(body);

        // One tab stop for the whole grid: the selected time, else the first free one
        const buttons = table.querySelectorAll('button.slot-button:not(:disabled)');
        const focusTarget = table.querySelector('button[aria-pressed="true"]') || buttons[0];
        if (focusTarget) focusTarget.tabIndex = 0;

        // Bring the first free time into view inside the scrolling grid
        if (state.scrollToFirst) {
            state.scrollToFirst = false;
            const anchor = focusTarget?.closest('tr');
            $('grid-wrap').scrollTop = anchor ? Math.max(0, anchor.offsetTop - 80) : 0;
        }
    }

    function highlight(start, className) {
        table.querySelectorAll(`.${className}`).forEach((n) => n.classList.remove(className));
        if (start === null) return;
        for (let t = start; t < start + state.duration * MINUTE; t += config.slotMinutes * MINUTE) {
            table.querySelector(`td[data-start="${t}"]`)?.classList.add(className);
        }
    }

    function onGridKey(e) {
        const button = e.target.closest('button[data-start]');
        if (!button) return;
        const row = Number(button.dataset.row);
        const col = Number(button.dataset.col);
        const all = [...table.querySelectorAll('button.slot-button:not(:disabled)')].map((b) => ({ b, r: Number(b.dataset.row), c: Number(b.dataset.col) }));
        let target = null;
        const nearestIn = (c) => all.filter((x) => x.c === c).sort((a, b) => Math.abs(a.r - row) - Math.abs(b.r - row))[0];
        switch (e.key) {
            case 'ArrowDown': target = all.filter((x) => x.c === col && x.r > row).sort((a, b) => a.r - b.r)[0]; break;
            case 'ArrowUp': target = all.filter((x) => x.c === col && x.r < row).sort((a, b) => b.r - a.r)[0]; break;
            case 'ArrowRight': for (let c = col + 1; !target && c < 7; c++) target = nearestIn(c); break;
            case 'ArrowLeft': for (let c = col - 1; !target && c >= 0; c--) target = nearestIn(c); break;
            case 'Home': target = all[0]; break;
            case 'End': target = all[all.length - 1]; break;
            default: return;
        }
        e.preventDefault();
        if (!target) return;
        all.forEach((x) => { x.b.tabIndex = -1; });
        target.b.tabIndex = 0;
        target.b.focus();
        highlight(Number(target.b.dataset.start), 'is-hover');
    }

    function renderSelection() {
        const box = $('selection');
        box.textContent = '';
        if (state.selection === null) {
            box.append(el('p', { class: 'selection-empty', text: 'No time chosen yet. Pick one in the timetable above.' }));
            return;
        }
        const start = state.selection;
        const end = start + state.duration * MINUTE;
        const clear = el('button', { type: 'button', class: 'link-button', text: 'Clear' });
        clear.addEventListener('click', () => { state.selection = null; refresh(); });
        box.append(el('div', { class: 'selection-card' },
            el('div', {},
                el('p', { class: 'selection-when', text: formatWhen(start, end, state.zone) }),
                el('p', { class: 'selection-zone', text: `${state.zone === detectedZone ? 'Your time' : 'Time'} (${state.zone.replace(/_/g, ' ')})` }),
                state.zone !== ownerZone
                    ? el('p', { class: 'selection-owner', text: `That's ${formatWhen(start, end, ownerZone)} for ${ownerName} in ${placeName(ownerZone)}.` })
                    : null),
            clear));
    }

    // ------------------------------------------------------------ submission

    function setStatus(message, kind = 'info') {
        const status = $('form-status');
        status.textContent = message;
        status.dataset.kind = kind;
    }

    function stillAvailable(start) {
        const fresh = generateSlots(config, { from: start - MINUTE, to: start + state.duration * MINUTE, now: Date.now(), busy });
        return canStartAt(new Map(fresh.map((s) => [s.start, s])), start, state.duration, config.slotMinutes);
    }

    function collectRequest() {
        const data = new FormData(form);
        const start = state.selection;
        const end = start + state.duration * MINUTE;
        const name = String(data.get('name') || '').trim();
        const email = String(data.get('email') || '').trim();
        const type = String(data.get('type') || meetingTypes[0].label);
        const topic = String(data.get('topic') || '').trim();
        const message = String(data.get('message') || '').trim();
        const ownerWhen = formatWhen(start, end, ownerZone);
        const visitorWhen = formatWhen(start, end, state.zone);
        const lines = [
            `Name: ${name}`,
            `Email: ${email}`,
            `Meeting: ${type}, ${state.duration} minutes`,
            `${ownerName}'s time (${ownerZone}): ${ownerWhen}`,
            `Requester's time (${state.zone}): ${visitorWhen}`,
            `UTC: ${new Date(start).toISOString()} to ${new Date(end).toISOString()}`,
        ];
        if (topic) lines.push(`Topic: ${topic}`);
        if (message) lines.push('', 'Message:', message);
        return {
            name, email, type, topic, message, start, end,
            subject: `Meeting request: ${ownerWhen} (${placeName(ownerZone)}) from ${name}`,
            text: lines.join('\n'),
        };
    }

    async function onSubmit(e) {
        e.preventDefault();
        setStatus('');
        if (state.selection === null) {
            setStatus('Please choose a time in the timetable first.', 'error');
            (table.querySelector('button[tabindex="0"]') || $('week-label')).focus();
            return;
        }
        if (!form.reportValidity()) return;
        if (!stillAvailable(state.selection)) {
            state.selection = null;
            refresh();
            setStatus('Sorry, that time is no longer available. Please choose another.', 'error');
            return;
        }

        const request = collectRequest();
        if (form.elements.website.value) { // honeypot filled: quietly pretend it worked
            showSent(request, 'sent');
            return;
        }

        const provider = String(delivery.provider || 'email').toLowerCase();
        const key = String(delivery.key || '').trim();
        if ((provider === 'web3forms' || provider === 'formspree') && key) {
            const button = $('submit-button');
            button.disabled = true;
            setStatus('Sending…');
            try {
                await (provider === 'web3forms' ? sendWeb3Forms(request, key) : sendFormspree(request, key));
                showSent(request, 'sent');
            } catch (err) {
                console.error(err);
                setStatus('', 'error');
                const status = $('form-status');
                status.append('That didn\'t go through. ',
                    el('a', { href: mailtoUrl(request), text: 'Send it by email instead' }), '.');
            } finally {
                button.disabled = false;
            }
            return;
        }
        window.location.href = mailtoUrl(request);
        showSent(request, 'email');
    }

    async function sendWeb3Forms(request, key) {
        const response = await fetch('https://api.web3forms.com/submit', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                access_key: key,
                subject: request.subject,
                from_name: `${request.name} (website booking)`,
                name: request.name,
                email: request.email,
                message: request.text,
                botcheck: false,
            }),
        });
        const result = await response.json().catch(() => ({}));
        if (!response.ok || !result.success) throw new Error(result.message || `HTTP ${response.status}`);
    }

    async function sendFormspree(request, formId) {
        const response = await fetch(`https://formspree.io/f/${encodeURIComponent(formId)}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
            body: JSON.stringify({
                _subject: request.subject,
                name: request.name,
                email: request.email,
                message: request.text,
            }),
        });
        if (!response.ok) {
            const result = await response.json().catch(() => ({}));
            throw new Error(result.errors?.map((x) => x.message).join(', ') || `HTTP ${response.status}`);
        }
    }

    function mailtoUrl(request) {
        return `mailto:${owner.email}?subject=${encodeURIComponent(request.subject)}&body=${encodeURIComponent(request.text)}`;
    }

    function showSent(request, mode) {
        const panel = el('div', { class: 'sent-panel', tabindex: '-1' });
        if (mode === 'sent') {
            panel.append(
                el('h3', { text: 'Request sent' }),
                el('p', { text: `Thanks, ${request.name.split(' ')[0] || 'there'}. I'll reply to ${request.email} to confirm ${formatWhen(request.start, request.end, state.zone)}. Nothing is booked until then.` }));
        } else {
            const details = el('pre', { class: 'sent-details', text: request.text });
            const copy = el('button', { type: 'button', class: 'button button-quiet button-small', text: 'Copy details' });
            copy.addEventListener('click', async () => {
                try {
                    await navigator.clipboard.writeText(`${request.subject}\n\n${request.text}`);
                    copy.textContent = 'Copied';
                } catch (err) {
                    copy.textContent = 'Copy failed: select the text instead';
                }
            });
            panel.append(
                el('h3', { text: 'Almost done: send the email' }),
                el('p', {},
                    'Your email app should have opened with the request filled in. It isn\'t sent until you press send there. If nothing opened, ',
                    el('a', { href: mailtoUrl(request), text: 'try again' }),
                    ' or copy the details below to ',
                    el('a', { href: `mailto:${owner.email}`, text: owner.email }), '.'),
                details,
                copy);
        }
        const again = el('button', { type: 'button', class: 'link-button', text: 'Make another request' });
        again.addEventListener('click', () => {
            panel.replaceWith(form);
            form.reset();
            state.selection = null;
            setStatus('');
            refresh();
        });
        panel.append(el('p', {}, again));
        form.replaceWith(panel);
        panel.focus();
    }
}

if (root) init();
