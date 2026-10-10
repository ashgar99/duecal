<p align="center"><img src="docs/logo.svg" width="72" height="72" alt=""></p>
<h3 align="center">Duecal</h3>
<p align="center">Put every Moodle deadline into Apple, Google or Outlook Calendar with one click.</p>

<p align="center">
  <a href="LICENSE"><img alt="MIT licence" src="https://img.shields.io/github/license/ashgar99/duecal?color=brightgreen" /></a>
  <img alt="Moodle 4.x" src="https://img.shields.io/badge/Moodle-4.x-orange" />
  <img alt="No installation required" src="https://img.shields.io/badge/install-not%20required-blue" />
</p>

<p align="center"><a href="https://ashgar99.github.io/duecal/"><b>Get Duecal</b></a></p>


## Features ✨

- Collects assignment, quiz and other activity deadlines from Moodle, and asks whether you want the assignment you are on, the module you are in, or every module.
- Covers deadlines from a month ago to a year ahead.
- Downloads one standard calendar file (`.ics`) that works with Apple Calendar, Google Calendar and Outlook.
- Each deadline is a half-hour block ending at the exact due time, named with the module code.
- Every deadline is marked high priority, with reminders two weeks, one day and two hours before it is due. You can change these (see [Customising](#customising-)).
- Running it again later updates deadlines that have moved, rather than duplicating them (in Apple Calendar and Outlook).
- Runs in your browser using your existing login. There is nothing to install.


## Usage 🛠

1. Go to the [install page](https://ashgar99.github.io/duecal/) and drag the **Duecal** button onto your bookmarks bar.
2. Log in to Moodle and click the bookmark, then choose which deadlines you want:
   - **This assignment** appears when you are on an assignment or other activity page.
   - **This module** appears anywhere inside a module.
   - **All modules** covers every module you are enrolled on. This is the one to use at the start of each term.
3. Open the downloaded file to add the deadlines to your calendar, as described below.

### Adding the file to your calendar

| Calendar | How |
| --- | --- |
| Apple Calendar | Double-click the file and choose a calendar. On iPhone, open it from Files or Mail. |
| Google Calendar | On a computer, go to **Settings > Import and export**, choose the file and a calendar. |
| Outlook | Double-click the file, or in Outlook on the web choose **Add calendar > Upload from file**. |

Tip: import into a separate calendar called "Deadlines", so you can hide or replace them all at once.

Not every calendar app keeps everything in the file:

- **Reminders:** Apple Calendar and Outlook keep all three. Google Calendar ignores reminders in imported files and uses your calendar's default notifications instead, so set those in Google Calendar's settings.
- **High priority:** Outlook shows deadlines as high importance. Apple Calendar and Google Calendar do not display priority for events, so in those apps the reminders do the work.


## Browser support 🌐

| Browser | Supported | Notes |
| --- | --- | --- |
| Chrome, Edge, Brave, Arc, Opera, Vivaldi | Yes | Fully tested. |
| Firefox | Yes | Drag the button to the bookmarks toolbar. |
| Safari | Yes | Show the Favourites bar first, and allow downloads if Safari asks. |
| Mobile browsers | Not recommended | Bookmarklets are difficult to add and run on phones and tablets. |


## Limitations ⚠️

- Only deadlines that Moodle puts in its calendar are included. Turnitin and some third-party activities may not appear.
- The file is a snapshot. Run Duecal again if your lecturers change dates.


## Troubleshooting 🔧

| Problem | Solution |
| --- | --- |
| `Open any page on your Moodle site` | Make sure you are logged in to Moodle before clicking the bookmark. |
| `No upcoming deadlines were found` | Your modules may not have dated activities yet, or use Turnitin for coursework. |
| Times look an hour out | Check your computer's time zone. Deadlines are saved in universal time, so calendars show them in your local time. |


## Privacy and security 🔒

The script is short and fully readable in [`duecal.js`](duecal.js). It only talks to your own Moodle site, using the login you already have, and creates the calendar file on your computer. No data is collected or sent anywhere else.


## Customising 🎛️

The reminders and priority are set at the top of [`duecal.js`](duecal.js):

```js
const REMINDERS = ['P14D', 'P1D', 'PT2H']; // alerts before each deadline: 14 days, 1 day and 2 hours
const PRIORITY = 1; // 1 is high, 5 is normal and 9 is low
```

Each reminder is a length of time before the deadline, written in the standard calendar format:

| Write | Means |
| --- | --- |
| `P2W` | 2 weeks |
| `P14D` | 14 days |
| `P3D` | 3 days |
| `PT12H` | 12 hours |
| `PT30M` | 30 minutes |
| `P1DT12H` | 1 day and 12 hours |

For example, `['P14D', 'P7D', 'P1D']` gives reminders two weeks, one week and one day before. Use `[]` for no reminders.

To use your own settings, fork this repository, edit those two lines, run `node build.js`, and drag the button from your own copy of the install page in `docs/`. If you only want to change the reminders for deadlines already in your calendar, you can edit them in your calendar app instead.


## Development 🧩

Edit [`duecal.js`](duecal.js), then run `node build.js` to regenerate `bookmarklet.txt` and the install page in `docs/`.


## Unikit 🎒

Duecal is part of Unikit, a set of free tools for students: [Modzip](https://ashgar99.github.io/moodle-module-downloader/), [Subzip](https://ashgar99.github.io/subzip/), [Termcal](https://ashgar99.github.io/termcal/), [Gradewise](https://ashgar99.github.io/gradewise/), [Wordfair](https://ashgar99.github.io/wordfair/) and [Readable](https://ashgar99.github.io/readable/).

Duecal is not affiliated with or endorsed by Moodle or any university.


## Licence 📑

[MIT](LICENSE)
