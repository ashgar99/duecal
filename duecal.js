// Duecal: put every Moodle deadline in your calendar
// Collects assignment, quiz and other activity deadlines from your Moodle 4
// modules and downloads them as one calendar file (.ics) for Apple, Google
// or Outlook Calendar. Run it on any Moodle page while logged in. On a module
// page it covers that module only; anywhere else it covers every module.
// https://github.com/ashgar99/duecal (MIT licence)

(async () => {
  if (document.getElementById('duecal-root')) return;

  // Panel UI, kept in a shadow root so Moodle's styles cannot affect it
  const host = document.createElement('div');
  host.id = 'duecal-root';
  host.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .panel { width: 320px; padding: 20px; border-radius: 18px; background: #111; box-shadow: inset 0 0 0 1px rgba(255,255,255,0.08), 0 20px 50px rgba(0,0,0,0.45); color: #f5f5f7;
        font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
      .title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 15px; }
      .dot { width: 18px; height: 18px; border-radius: 50%; background: linear-gradient(135deg, #5fd0ff, #1f7dff); }
      .x { background: none; border: 0; color: #8b8b94; font-size: 22px; line-height: 1; cursor: pointer; padding: 0 2px; }
      .x:hover { color: #f5f5f7; }
      .module { color: #a1a1aa; font-size: 13px; margin-bottom: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .status { font-weight: 500; margin-bottom: 10px; }
      .bar { height: 6px; border-radius: 3px; background: #262626; overflow: hidden; }
      .fill { height: 100%; width: 0; background: #5caeff; border-radius: 3px; transition: width 0.3s ease; }
      .meta { display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; font-size: 12px; color: #8b8b94; min-height: 17px; }
      .file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
      .action { margin-top: 16px; width: 100%; padding: 10px; border: 0; border-radius: 999px; background: #1d1d1d; color: #f5f5f7; font: inherit; font-weight: 500; cursor: pointer; }
      .action:hover { background: #262626; }
      .panel.done .action { background: #5caeff; color: #000; }
      .panel.error .fill { background: #f87171; }
    </style>
    <div class="panel" role="status" aria-live="polite">
      <div class="head"><div class="title"><span class="dot"></span>Duecal</div><button class="x" aria-label="Close">&times;</button></div>
      <div class="module"></div>
      <div class="status">Getting ready...</div>
      <div class="bar"><div class="fill"></div></div>
      <div class="meta"><span class="count"></span><span class="file"></span></div>
      <button class="action">Cancel</button>
    </div>`;

  const $ = s => shadow.querySelector(s);
  const ui = {
    status: t => { $('.status').textContent = t; },
    progress: p => { $('.fill').style.width = Math.max(0, Math.min(100, p)) + '%'; },
    count: t => { $('.count').textContent = t; },
    file: t => { $('.file').textContent = t; },
    scope: t => { $('.module').textContent = t; }
  };
  let cancelled = false;
  let finished = false;
  const close = () => host.remove();
  const finish = (message, state) => {
    finished = true;
    ui.status(message);
    ui.file('');
    if (state) $('.panel').classList.add(state);
    $('.action').textContent = 'Close';
  };
  $('.x').onclick = () => { cancelled = true; close(); };
  $('.action').onclick = () => {
    if (finished) return close();
    cancelled = true;
    ui.status('Cancelling...');
  };
  const check = () => { if (cancelled) throw new Error('cancelled'); };

  // Helpers
  const clean = s => (s || '').replace(/\s+/g, ' ').trim().replace(/[\\/:*?"<>|]/g, '-').slice(0, 80) || 'Untitled';
  const text = el => {
    if (!el) return '';
    const c = el.cloneNode(true);
    c.querySelectorAll('br').forEach(b => b.replaceWith('\n'));
    c.querySelectorAll('p, div, li, tr, h1, h2, h3, h4').forEach(b => b.append('\n'));
    return c.textContent.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  };

  // Moodle's own web service, called with the session you are already logged in with
  const ajax = async (methodname, args) => {
    const url = `${M.cfg.wwwroot}/lib/ajax/service.php?sesskey=${M.cfg.sesskey}&info=${methodname}`;
    const res = await fetch(url, {
      method: 'POST', credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify([{ index: 0, methodname, args }])
    });
    const out = await res.json();
    if (!Array.isArray(out) || out[0].error) throw new Error((out[0] && out[0].exception && out[0].exception.message) || 'Moodle did not respond');
    return out[0].data;
  };

  const DAY = 86400;
  const pad = n => String(n).padStart(2, '0');
  const stamp = secs => {
    const d = new Date(secs * 1000);
    return `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;
  };
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fold = line => {
    const out = [];
    while (line.length > 74) { out.push(line.slice(0, 74)); line = ' ' + line.slice(74); }
    out.push(line);
    return out.join('\r\n');
  };
  const plain = html => {
    const d = new DOMParser().parseFromString(`<div>${html || ''}</div>`, 'text/html');
    return text(d.body.firstChild);
  };
  const KEEP = new Set(['due', 'close', 'expectcompletionon']);

  try {
    if (!window.M || !M.cfg || !M.cfg.wwwroot) {
      ui.progress(100);
      return finish('Open any page on your Moodle site while logged in, then click the bookmark again.', 'error');
    }

    // Work out which modules to cover: this one, or all of them
    let courses = [];
    const here = new URLSearchParams(location.search).get('id');
    ui.status('Finding your modules');
    ui.progress(10);
    if (/\/course\/view\.php/.test(location.pathname) && here) {
      courses = [{ id: Number(here), fullname: clean(document.querySelector('h1')?.innerText || document.title), shortname: '' }];
      ui.scope(courses[0].fullname);
    } else {
      const seen = new Set();
      for (const classification of ['all', 'hidden']) {
        try {
          const data = await ajax('core_course_get_enrolled_courses_by_timeline_classification', { classification, limit: 0, offset: 0, sort: 'fullname' });
          (data.courses || []).forEach(c => { if (!seen.has(c.id)) { seen.add(c.id); courses.push(c); } });
        } catch (e) { if (classification === 'all') throw e; }
      }
      ui.scope(`All modules (${courses.length})`);
    }
    if (!courses.length) {
      ui.progress(100);
      return finish('No modules were found on your account.', 'error');
    }
    const byId = new Map(courses.map(c => [Number(c.id), c]));

    // Ask Moodle's calendar for deadlines from a month ago to a year ahead
    check();
    ui.status('Collecting deadlines');
    ui.progress(40);
    const now = Math.floor(Date.now() / 1000);
    const from = now - 30 * DAY;
    const to = now + 365 * DAY;
    let events = [];
    try {
      const data = await ajax('core_calendar_get_calendar_events', {
        events: { eventids: [], courseids: courses.map(c => Number(c.id)), groupids: [], categoryids: [] },
        options: { userevents: false, siteevents: false, timestart: from, timeend: to, ignorehidden: true }
      });
      events = data.events || [];
    } catch (e) {
      // Fallback: the timeline service used by the Dashboard
      let after = 0;
      for (let page = 0; page < 20; page++) {
        const data = await ajax('core_calendar_get_action_events_by_timesort', { timesortfrom: from, timesortto: to, limitnum: 50, aftereventid: after });
        const batch = (data.events || []).map(ev => ({ ...ev, courseid: ev.course ? ev.course.id : ev.courseid, timestart: ev.timesort || ev.timestart }));
        events.push(...batch);
        if (batch.length < 50) break;
        after = data.lastid;
      }
    }
    events = events.filter(ev => KEEP.has(ev.eventtype) && byId.has(Number(ev.courseid)));
    events.sort((a, b) => a.timestart - b.timestart);

    if (!events.length) {
      ui.progress(100);
      return finish('No upcoming deadlines were found in your modules.', 'error');
    }

    // Build the calendar file
    check();
    ui.status('Creating calendar file');
    ui.progress(80);
    const host_ = location.hostname;
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Unikit//Duecal 1.0//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', 'X-WR-CALNAME:Moodle deadlines'];
    for (const ev of events) {
      const course = byId.get(Number(ev.courseid));
      const short = course ? (course.shortname || course.fullname) : '';
      const due = Number(ev.timestart);
      const when = new Date(due * 1000).toLocaleString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric', hour: '2-digit', minute: '2-digit' });
      const link = ev.url || `${M.cfg.wwwroot}/course/view.php?id=${ev.courseid}`;
      const desc = [`Deadline: ${when}`, course ? `Module: ${course.fullname}` : '', plain(ev.description), `Open on Moodle: ${link}`].filter(Boolean).join('\n\n');
      lines.push('BEGIN:VEVENT',
        `UID:moodle-event-${ev.id}@${host_}`,
        `DTSTAMP:${stamp(now)}`,
        `DTSTART:${stamp(due - 1800)}`,
        `DTEND:${stamp(due)}`,
        fold(`SUMMARY:${esc(short ? `${ev.name} (${short})` : ev.name)}`),
        fold(`DESCRIPTION:${esc(desc)}`),
        fold(`URL:${link}`),
        'BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(ev.name)}`), 'TRIGGER:-P1D', 'END:VALARM',
        'BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(ev.name)}`), 'TRIGGER:-PT2H', 'END:VALARM',
        'END:VEVENT');
      ui.count(`${events.length} deadline${events.length === 1 ? '' : 's'}`);
    }
    lines.push('END:VCALENDAR');

    check();
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${courses.length === 1 ? courses[0].fullname : 'Moodle deadlines'} (Duecal).ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    ui.progress(100);
    const next = events.find(ev => ev.timestart >= now);
    if (next) ui.file(`Next: ${next.name}`);
    finish(`Done. ${events.length} deadline${events.length === 1 ? '' : 's'} saved. Open the file to add them to your calendar.`, 'done');
  } catch (e) {
    if (cancelled) {
      finish('Cancelled. Nothing was downloaded.');
    } else {
      console.error(e);
      finish(`Something went wrong: ${e.message}`, 'error');
    }
  }
})();
