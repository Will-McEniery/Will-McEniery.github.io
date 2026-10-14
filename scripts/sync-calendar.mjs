// Pull busy times from your calendar into _data/busy.json (run by GitHub Actions before each build).
//
// Set the repository secret CALENDAR_ICS_URL to your calendar's *secret* iCal address:
//   Google:  Calendar settings -> (your calendar) -> Integrate calendar -> "Secret address in iCal format"
//   Outlook: Settings -> Calendar -> Shared calendars -> Publish a calendar -> "Can view when I'm busy" -> ICS link
// Only start and end times are written out. Titles, locations, attendees etc. never leave the runner.

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import YAML from 'yaml';
import { extractBusy } from './lib/busy.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUT = path.join(ROOT, '_data', 'busy.json');
const DAY = 86400000;

const url = process.env.CALENDAR_ICS_URL;
if (!url) {
    console.log('CALENDAR_ICS_URL is not set, so busy times were not synced (the booking page still works).');
    process.exit(0);
}

const config = YAML.parse(fs.readFileSync(path.join(ROOT, '_data', 'booking.yml'), 'utf8'));
const now = Date.now();
const from = now - DAY;
const to = now + ((Number(config.horizon_weeks) || 6) + 1) * 7 * DAY;

try {
    const response = await fetch(url.replace(/^webcal:/i, 'https:'), { headers: { 'User-Agent': 'website-calendar-sync' } });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const events = extractBusy(await response.text(), { from, to, ownerZone: config.timezone || 'UTC' });
    fs.writeFileSync(OUT, `${JSON.stringify({ updated: new Date(now).toISOString(), events }, null, 2)}\n`);
    console.log(`Synced ${events.length} busy periods.`);
} catch (err) {
    // Don't take the site down because the calendar was unreachable: keep the last busy.json.
    // (The URL is a secret, so it's never printed.)
    console.log(`::warning title=Calendar sync failed::${err.message}. The site was built with the previous busy times.`);
}
