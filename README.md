# Will-McEniery.github.io

Personal website: research notes, projects, CV, and a "Book a meeting" page, built with Jekyll and
hosted on GitHub Pages. The background is a small interactive simulation of a sheet of "spacetime".

## Editing content

| What | Where |
|---|---|
| Home page text | `index.html` |
| Projects | one Markdown file per project in `_projects/` |
| Research & interests | one Markdown file per note in `_interests/` |
| CV | `_data/cv.yml` (the page `cv.html` is generated from it) |
| Footer links, email, site title | `_config.yml` |
| Meeting availability | `_data/booking.yml` (see below) |

A project or note looks like this:

```markdown
---
title: Raman scattering in quantum spin liquids
date: 2026-06-22
categories: [Research]
description: One sentence shown in the list.
---
Body text in Markdown. Maths works: $E = mc^2$ inline, or $$\int_0^1 f(x)\,dx$$ on its own line.
```

The newest item is listed first. Add `published: false` to hide an item without deleting it (the
"Test animation" project is hidden this way). Interactive pages can load extra scripts with
`libraries:` (external URLs) and `scripts:` (files in `assets/js/`); see `_projects/test.md`.

## Book a meeting

Everything about availability lives in `_data/booking.yml`, written in **your** time zone:

- `timezone`: change it if you move (any IANA name, e.g. `Europe/London`)
- `weekly`: your usual hours per weekday, e.g. `mon: ["09:00-12:30", "13:30-17:00"]`
- `blocked`: holidays and one-off clashes, e.g. `- { start: "2026-12-24", end: "2026-12-28" }`
- `extra`: one-off openings outside your usual hours
- `min_notice_hours`, `horizon_weeks`, `durations`, `meeting_types`

Visitors see the timetable converted to their own time zone (they can switch zones, including to yours).
Nothing is booked automatically: each request reaches you by email, and you confirm by replying.

### How requests reach you

Out of the box (`provider: email`), pressing **Send request** opens the visitor's own email app with the
request filled in, addressed to you. To have requests arrive directly without that step, use either of
these free form services:

- **Web3Forms** (250 requests/month free, no account needed): go to <https://web3forms.com>, enter the
  address requests should go to, and you'll be emailed an access key. In `_data/booking.yml` set
  `provider: web3forms` and `key: "<that key>"`.
- **Formspree** (50/month free, needs an account): create a form at <https://formspree.io>, then set
  `provider: formspree` and `key: "<form id>"` (the part after `/f/` in its URL).

Both keys are designed to sit in public web pages. Each request includes both time zones and the UTC
time, so it's never ambiguous.

### Blocking out your existing meetings automatically

Busy times come from `_data/busy.json` (start and end times only). You can leave it empty and use
`blocked` instead, or let GitHub keep it in sync with your calendar every 30 minutes:

1. **Settings → Pages → Build and deployment → Source:** choose **GitHub Actions**.
2. **Settings → Secrets and variables → Actions → Variables:** add `PAGES_DEPLOY` with the value `actions`.
3. **Settings → Secrets and variables → Actions → Secrets:** add `CALENDAR_ICS_URL` with your calendar's
   *secret* iCal address:
   - Google Calendar: Settings → your calendar → *Integrate calendar* → *Secret address in iCal format*
   - Outlook: Settings → Calendar → *Shared calendars* → *Publish a calendar* → choose
     *Can view when I'm busy* → copy the ICS link
4. Push any change (or run the workflow from the Actions tab).

Only start/end times are published (the same as sharing your free/busy status). Events marked as "free",
and cancelled events, are ignored. GitHub pauses scheduled workflows after 60 days with no commits; the
Actions tab has a button to re-enable it.

## Running it locally

```bash
npm install
npm run preview
```

That serves an approximate preview at http://localhost:4000 without needing Ruby. Its Markdown
rendering differs slightly from GitHub's. For an exact build, use Ruby and `bundle exec jekyll serve`,
or Docker:

```bash
docker run --rm -it -p 4000:4000 -v "$PWD:/srv" -w /srv ruby:3.3 bash -c "bundle install && bundle exec jekyll serve --host 0.0.0.0"
```

`npm test` runs the unit tests: the FFT and wave physics, time zones and slots, and calendar parsing.
GitHub Actions runs them, does a real Jekyll build and checks for broken links on every push.

## The spacetime background

`assets/js/spacetime/` simulates linear water waves on the sheet (dispersion ω² = gk). Your cursor is a
pressure patch that sits in a 1/r well and leaves a Kelvin wake when it moves. A click sets off a
ringing source that sends out rings. The constants at the top of `main.js` control the look: well depth,
ripple strength and grid spacing. The animation sleeps when nothing is moving, and visitors who
prefer reduced motion get a still grid.
