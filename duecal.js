// Duecal: put every Moodle deadline in your calendar
// Collects assignment, quiz and other activity deadlines from your Moodle 4
// modules and downloads them as one calendar file (.ics) for Apple, Google
// or Outlook Calendar. Run it on any Moodle page while logged in, then choose
// what to cover: the activity you are on, the module you are in, or every module.
// Each deadline is marked high priority, with reminders before it is due.
// https://github.com/ashgar99/duecal (MIT licence)

(async () => {
  if (document.getElementById('duecal-root')) return;

  // Settings you can change. See "Customising" in the README.
  const REMINDERS = ['P14D', 'P1D', 'PT2H']; // alerts before each deadline: 14 days, 1 day and 2 hours
  const PRIORITY = 1; // 1 is high, 5 is normal and 9 is low

  // Panel UI, kept in a shadow root so Moodle's styles cannot affect it
  const host = document.createElement('div');
  host.id = 'duecal-root';
  host.style.cssText = 'position:fixed;right:24px;bottom:24px;z-index:2147483647;';
  document.body.appendChild(host);
  const shadow = host.attachShadow({ mode: 'open' });
  shadow.innerHTML = `
    <style>
      .panel { width: 320px; padding: 20px; border-radius: 18px; background: #fff; box-shadow: 0 0 0 1px rgba(0,0,0,0.06), 0 12px 40px rgba(0,0,0,0.16); color: #1d1d1f;
        font: 14px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; }
      .head { display: flex; justify-content: space-between; align-items: center; margin-bottom: 14px; }
      .title { display: flex; align-items: center; gap: 8px; font-weight: 600; font-size: 15px; }
      .dot { width: 18px; height: 18px; border-radius: 50%; background: linear-gradient(135deg, #ff7a6b, #e5383b); }
      .x { background: none; border: 0; color: #86868b; font-size: 22px; line-height: 1; cursor: pointer; padding: 0 2px; }
      .x:hover { color: #1d1d1f; }
      .module { color: #6e6e73; font-size: 13px; margin-bottom: 14px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
      .status { font-weight: 500; margin-bottom: 10px; }
      .bar { height: 6px; border-radius: 3px; background: #ececf0; overflow: hidden; }
      .fill { height: 100%; width: 0; background: #e5483b; border-radius: 3px; transition: width 0.3s ease; }
      .meta { display: flex; justify-content: space-between; gap: 12px; margin-top: 10px; font-size: 12px; color: #6e6e73; min-height: 17px; }
      .file { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; text-align: right; }
      .action { margin-top: 16px; width: 100%; padding: 10px; border: 0; border-radius: 999px; background: #f2f2f5; color: #1d1d1f; font: inherit; font-weight: 500; cursor: pointer; }
      .action:hover { background: #e8e8ed; }
      .panel.done .action { background: #f2f2f5; color: #1d1d1f; }
      .panel.error .fill { background: #e5484d; }
      .ask { font-weight: 500; margin-bottom: 14px; }
      .opt { display: block; width: 100%; margin-top: 8px; padding: 10px; border: 0; border-radius: 999px; background: #f2f2f5; color: #1d1d1f; font: inherit; font-weight: 500; cursor: pointer; }
      .opt:hover { background: #e8e8ed; }
      .opt:focus-visible { outline: 2px solid #e5483b; outline-offset: 2px; }
      .opt.first { background: #e5483b; color: #fff; }
      .opt.first:hover { background: #d33a2e; }
      .note { margin-top: 10px; font-size: 12px; color: #6e6e73; }
      [hidden] { display: none !important; }
    </style>
    <div class="panel" role="status" aria-live="polite">
      <div class="head"><div class="title"><span class="dot"></span>Duecal</div><button class="x" aria-label="Close">&times;</button></div>
      <div class="module"></div>
      <div class="choose" hidden><div class="ask">Which deadlines would you like?</div><div class="opts"></div></div>
      <div class="work">
        <div class="status">Getting ready...</div>
        <div class="bar"><div class="fill"></div></div>
        <div class="meta"><span class="count"></span><span class="file"></span></div>
        <p class="note next" hidden></p>
      </div>
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
    if (finished || !$('.choose').hidden) return close();
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
  const esc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
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

  // Turn a reminder such as P14D or PT2H into words, for the panel
  const words = r => {
    const m = r.match(/^P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?)?$/);
    if (!m) return r;
    const parts = [[m[1], 'week'], [m[2], 'day'], [m[3], 'hour'], [m[4], 'minute']].filter(x => x[0]).map(([n, u]) => `${n} ${u}${n === '1' ? '' : 's'}`);
    return parts.join(' ');
  };
  const list = a => a.length < 2 ? a.join('') : `${a.slice(0, -1).join(', ')} and ${a[a.length - 1]}`;

  // Ask what to cover, offering only the choices that make sense on this page
  const choose = options => new Promise(ok => {
    $('.work').hidden = true;
    $('.choose').hidden = false;
    $('.action').hidden = true;
    $('.opts').innerHTML = '';
    options.forEach((o, i) => {
      const b = document.createElement('button');
      b.className = 'opt' + (i === 0 ? ' first' : '');
      b.textContent = o.label;
      b.onclick = () => { $('.choose').hidden = true; $('.work').hidden = false; $('.action').hidden = false; ok(o.value); };
      $('.opts').appendChild(b);
    });
  });

  try {
    if (!window.M || !M.cfg || !M.cfg.wwwroot) {
      ui.progress(100);
      return finish('Open any page on your Moodle site while logged in, then click the bookmark again.', 'error');
    }

    // Where are we? Moodle tells every page which module it belongs to
    const bodyCourse = (document.body.className.match(/\bcourse-(\d+)\b/) || [])[1];
    const courseId = Number(M.cfg.courseId || bodyCourse || 0);
    const inModule = courseId > 1; // 1 is the site's front page
    const pageId = Number(new URLSearchParams(location.search).get('id'));
    const activity = (location.pathname.match(/\/mod\/(\w+)\/view\.php/) || [])[1];
    const pageTitle = clean(document.querySelector('#region-main h1, .page-header-headings h1, h1')?.innerText || document.title);

    ui.status('Finding your modules');
    ui.progress(10);
    const enrolled = [];
    const seen = new Set();
    for (const classification of ['all', 'hidden']) {
      try {
        const data = await ajax('core_course_get_enrolled_courses_by_timeline_classification', { classification, limit: 0, offset: 0, sort: 'fullname' });
        (data.courses || []).forEach(c => { if (!seen.has(c.id)) { seen.add(c.id); enrolled.push(c); } });
      } catch (e) { if (classification === 'all' && !inModule) throw e; }
    }
    let thisModule = null;
    if (inModule) {
      thisModule = enrolled.find(c => Number(c.id) === courseId) || { id: courseId, fullname: document.title, shortname: '' };
      thisModule = { ...thisModule, id: courseId, fullname: clean(thisModule.fullname) };
    }

    const options = [];
    if (activity && pageId && thisModule) options.push({ value: 'activity', label: /^(assign|turnitintooltwo)$/.test(activity) ? 'This assignment' : 'This activity' });
    if (thisModule) options.push({ value: 'module', label: 'This module' });
    if (enrolled.length) options.push({ value: 'all', label: 'All modules' });
    if (!options.length) {
      ui.progress(100);
      return finish('No modules were found on your account.', 'error');
    }
    const scope = await choose(options);
    check();

    let courses;
    let only = null; // the activity's instance, when you chose a single assignment
    if (scope === 'all') {
      courses = enrolled;
      ui.scope(`All modules (${courses.length})`);
    } else {
      courses = [thisModule];
      ui.scope(scope === 'activity' ? pageTitle : thisModule.fullname);
      if (scope === 'activity') {
        try {
          const data = await ajax('core_course_get_course_module', { cmid: pageId });
          only = { modname: data.cm.modname, instance: Number(data.cm.instance) };
        } catch (e) {
          only = { modname: activity, instance: null };
        }
      }
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
    if (only) {
      events = events.filter(ev => ev.modulename === only.modname &&
        (only.instance ? Number(ev.instance) === only.instance : (ev.name || '').toLowerCase().includes(pageTitle.toLowerCase())));
    }
    events.sort((a, b) => a.timestart - b.timestart);

    if (!events.length) {
      ui.progress(100);
      const where = only ? `for ${pageTitle}` : courses.length === 1 ? 'in this module' : 'in your modules';
      return finish(`No upcoming deadlines were found ${where}.`, 'error');
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
        `PRIORITY:${PRIORITY}`,
        `X-MICROSOFT-CDO-IMPORTANCE:${PRIORITY <= 4 ? 2 : PRIORITY >= 6 ? 0 : 1}`,
        'CATEGORIES:Deadline',
        ...REMINDERS.flatMap(r => ['BEGIN:VALARM', 'ACTION:DISPLAY', fold(`DESCRIPTION:${esc(`${ev.name} (in ${words(r)})`)}`), `TRIGGER:-${r}`, 'END:VALARM']),
        'END:VEVENT');
      ui.count(`${events.length} deadline${events.length === 1 ? '' : 's'}`);
    }
    lines.push('END:VCALENDAR');

    check();
    const blob = new Blob([lines.join('\r\n') + '\r\n'], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${only ? `${courses[0].fullname} - ${pageTitle}` : courses.length === 1 ? courses[0].fullname : 'Moodle deadlines'} (Duecal).ics`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
    ui.progress(100);
    const next = events.find(ev => ev.timestart >= now);
    if (next) ui.file(`Next: ${next.name}`);
    finish(`Done. ${events.length} deadline${events.length === 1 ? '' : 's'} saved. Open the downloaded file to add ${events.length === 1 ? 'it' : 'them'} to your calendar.`, 'done');
    $('.next').hidden = false;
    $('.next').textContent = REMINDERS.length
      ? `Each one is marked high priority, with reminders ${list(REMINDERS.map(words))} before it is due.`
      : 'Each one is marked high priority.';
  } catch (e) {
    if (cancelled) {
      finish('Cancelled. Nothing was downloaded.');
    } else {
      console.error(e);
      finish(`Something went wrong: ${e.message}`, 'error');
    }
  }
})();
