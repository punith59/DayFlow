# DayFlow changelog

## v26 — Google Drive backup and restore (manual)
- **More → Backup & restore → Google Drive:** "Back up to Drive" and "Restore from Drive…". Nothing runs on its own; no auto-sync.
- **One-time setup:** paste your own Google OAuth client ID into the app (steps are in the app, under "How to get a client ID"). The ID stays on this device and is not part of backup files.
- **Narrow access:** only the "drive.file" scope, so DayFlow sees just the file it made ("DayFlow backup.json"). Drive keeps earlier versions of it.
- **Restore** from Drive uses the same preview, "Replace my data" confirmation and Undo as restoring from a file.
- **Sign out** clears the client ID and the Drive status from this device.
- The service worker now ignores other websites' requests, so Google scripts and Drive downloads are never cached.

## v25 — Note editing fixes
- **Enter after a style:** a Title, Subtitle or Heading line goes back to Body on the next line. A Note line carries on for one Enter, and a second Enter turns the empty line into Body.
- **To-do boxes** now line up with the first line of text, at any text size.
- **Format applies to the line and what comes next:** with just a cursor, bold / italic / strikethrough / underline / text colour / size apply to the whole current line and to what you type next. With text selected they apply to the selection.
- **Typing "1. "** (or "2)", "5. " …) at the start of a line starts a numbered list; a number other than 1 starts the list at that number.
- **Overview:** each note in the Diary list shows just one line of its body.
- **Indent has limits:** a plain line moves in 28px at a time, at most 5 steps (about a third of the page), and never to the left of where lines normally start. A top-level list item stays in its list when you outdent, and lists nest at most 5 deep.
- **Highlight only works on selected text.** With just a cursor the button explains this. Typing after a highlighted word is not highlighted.
- **Sizes:** Title 24, Subtitle 20, Heading 18, Note 14, Body 16. Title, Subtitle and Heading are always bold. A− / A+ step through real sizes (10, 12, 14, 16, 18, 20, 24, 28, 32, 40, 48) and the box shows the actual size.
- **Divider** adds a line and puts the cursor on a new line below it.
- **"/" menu:** typing /subtitle (or any name) and pressing Enter now picks it, including on phone keyboards that send Enter differently. "/todo" also finds To-dos.
- Service worker cache `dayflow-cache-v25`.

## v24 — "/" menu, text styles and lists fixed
- **"/" menu:** type **/** at the start of a line (or after a space) and a list opens under the line: Title, Subtitle, Heading, Body, Note, Bulleted list, Numbered list, To-dos, Increase / Decrease indent, Align left / centre / right, Divider. Keep typing to narrow it (for example "/head", "/num", "/todo"), tap an item, and the "/…" you typed is removed and the choice applied. A "/" in the middle of a word (and/or, a date, a link) doesn't open it. The **Aa** button and its panel stay as they were.
- **Text styles scale properly:** Title, Subtitle, Heading, Body and Note now each have one fixed size, whatever you did before. Choosing a style clears any size you set with A− / A+ on that line, so it can't fight the style. A style can be applied to several selected lines at once.
- **Lists keep going:** changing a numbered or bulleted item between Subtitle, Heading, Body and so on no longer splits the list. Item 3 stays item 3 and the numbering continues when you change it back. A line you style is labelled in place instead of being rebuilt.
- Pressing Enter at the end of a Title, Subtitle or Heading starts a normal body line.
- Dividers (a thin line) can be added from the "/" menu.
- Older notes that used the earlier heading tags are converted to the new styles the first time you restyle a line.
- Service worker cache `dayflow-cache-v24`.

## v23 — Note screen in dark cyan, highlight fixed
- **Note screen colours:** the note page is now mostly black with a dark cyan glow at the top, and the tool row, format panel, buttons, checklist boxes, notebook link and quote bar use the app's cyan tint. Only the note screen changed; every other screen is untouched.
- **Highlight fixed:** switching highlight on with just a cursor, typing, then pressing it again now turns it off, so the next words aren't highlighted. The button also lights up correctly when the cursor is in highlighted text, and pressing it on selected text that is already highlighted removes the highlight.
- Service worker cache `dayflow-cache-v23`.

## v22 — Notes app look: note page, notebook chips, formatting
- **Note page:** tapping a note (or +) opens a full-screen page: back arrow, undo / redo, a ⋮ menu and **Done** on top; the date and notebook under them; a big **Title** and a free body. A small row above the keyboard has checklist, bullets, numbered list and **Aa**. Your edits save as you type, so nothing is lost if you leave. A new note with nothing written isn't kept. If you write a body but no title, the first line becomes the header.
- **Formatting (Aa panel):** paragraph styles (Title, Subtitle, Heading, Body, Note), bold, italic, strikethrough, underline, highlight, checklist (tap the box to tick), bullets, numbered lists, indent / outdent, left / centre / right alignment, text size and text colour. The on-screen keyboard hides while the panel is open.
- **⋮ menu:** move the note to another notebook, change its day, or delete it (with Undo).
- **Notebook chips on top:** a scrolling row of **All notes**, **Default notebook** and your own notebooks; tap one to filter the list. In All notes each note shows which notebook it is in.
- **Notebooks button** (small square at the left of the chips): an overview of every notebook with its note count and last note, an Edit button for each custom notebook (rename, recolour, delete with Undo), and + New notebook.
- Notes are still grouped by day, newest day first. The built-in notebook is now called **Default notebook**. Your existing notes and notebooks are unchanged; older plain-text notes open in the new page as they were.
- Note bodies are cleaned on the way in and out, so a restored backup can't smuggle anything harmful into a note.
- The colours follow the app's green theme. Service worker cache `dayflow-cache-v22`.

## v21 — Diary becomes notebooks
- The Diary tab is replaced by **notebooks**. There is a built-in **Diary** notebook, and you can create your own (name + colour) from the + button or **+ New notebook**.
- Open a notebook to see its notes **grouped by day**, newest day first. Each note has a **header** (required) and a **body**; tap a note to edit it. A note can be moved to another notebook or another (past) day from its edit sheet. + inside a notebook adds a note to it.
- Edit a custom notebook (rename, recolour) from its page. Deleting a notebook also deletes its notes, with Undo; deleting a note has Undo too.
- Your existing diary notes are kept and appear in the **Diary** notebook as "Untitled" (give them a header when you next open them). Nothing is lost.
- The old Entries / Page toggle and day-by-day arrows are gone. Calendar still marks days with notes and shows each day's notes (with headers).
- Backups include notebooks (shown as "Notebooks" in the restore preview). Backups from before v21 restore fine; their notes go to the Diary notebook.
- Service worker cache renamed `dayflow-cache-v21`, with the two new files added.

## v20 — Goal weeks only from when the goal existed
- "Time logged by week" on a goal page no longer lists weeks that ended before the goal was created.
- Service worker cache renamed `dayflow-cache-v20`.

## v19 — Milestones, time target back, mix any targets
- **Targets are now three independent switches** on a goal: **Milestones**, **Time to log**, **A date**. Turn on any, all or none.
- **Milestones replace the count target.** A milestone is a mini target you name yourself (e.g. "Finish chapter 1"). On the goal page you tick each one off (Undo available), and the bar shows "1 of 3 milestones". Tasks no longer count toward progress. You can rename or delete a milestone with its ✎ button, add one with **+ Milestone**, or edit them all in the goal's Edit sheet.
- **Time to log is back:** set hours in total; time logged on linked tasks counts, and **+ Log time** adds minutes by hand (removable). Shows its own bar.
- **A date** works as in v18: "Target date Nov 19 · 20 days to go", no bar, nothing flagged.
- **Resuming a paused goal asks for a new target date** (and hours, if the goal has a time target). "Keep as is" or "Just resume" skips it; Undo restores the old values.
- Switching a target off keeps its data, so switching it back on loses nothing. Goals made with the old count target keep their data but no longer show a count; old time and date targets carry over.
- Everything else (custom icons, Today, Calendar, backups) is unchanged. Service worker cache renamed `dayflow-cache-v19`.

## v18 — Date targets, custom icons, quieter Today
- **Goal targets are now: No target / A count / A date.** The "Time" target (hours to log) is gone. A date target is the day you're aiming for; the goal page shows "Target date Nov 10 · 12 days to go" with no bar and nothing flagged when it passes. The separate optional "Target date" field was folded into this.
- Goals saved with the old Time target are converted when they load: with a date they become date goals, without one they become "No target". Nothing is deleted from your data.
- **Log progress** is now only for count targets (the minutes chips are gone). Time logged on linked tasks still shows as plain facts ("Time logged" tile and by-week list).
- **Custom goal icons:** the icon row has a ＋ that opens a bigger set of icons and a "Your own" box where you can type or paste any emoji. A custom icon stays in the row when you edit the goal.
- **Today:** the Planned / Time spent boxes (and the "plus … in events" line) are removed.
- Service worker cache renamed `dayflow-cache-v18`.

## v17 — Goals
- The Goals tab is now real. A goal is a container you link tasks, events and deadlines to, with an optional **target**. Nothing is scheduled, suggested or flagged; a target is never shown as missed.
- **New goal** (+ button on Goals): name, icon, colour, an optional "why it matters" line, an optional target date, and an optional target:
  - **A count** (e.g. 12 books): each finished linked task counts as one, and you can add to it by hand.
  - **Time** (e.g. 50 hours): time logged on linked tasks counts, and you can add time by hand.
  - **No target**: the goal is just a container with plain read-outs.
- **Goals list:** Active / Paused / Achieved groups. Each card shows one plain line (for example "12 of 50 books · 6 of 10 tasks done · 2 of 3 deadlines met"), a slim progress bar only when a target is set, and the next linked item coming up.
- **Goal page** (tap a card): the target and its bar, a **+ Log progress** button, tiles for tasks done / deadlines met / time logged, **Coming up**, **Earlier & finished** (6 shown, then "Show more"), progress you added by hand (removable), time logged by week as plain numbers, and Edit / Pause / Mark achieved / Delete. Everything has an Undo, and deleting a goal only detaches what was linked to it. The + button on a goal page adds a task, event or deadline already linked to that goal.
- Tapping a linked item opens its day in Today.
- **Linking:** tasks already had a goal picker; events and deadlines now have one too (a deadline linked to a goal works as a milestone). The Goal field in the forms appears once you have at least one goal, and achieved goals are no longer offered.
- Items that belong to a goal show a small coloured goal label on their cards in Today, and the overview sheet shows the goal for events and deadlines too.
- Repeating tasks, events and deadlines can be linked but are not counted or listed yet (a note on the goal page says so), because repeating items don't keep a done/skipped state per occurrence.
- Backups already included goals; the new goal fields and hand-added progress are part of them.
- Service worker cache renamed `dayflow-cache-v17`, with the two new files added to it.

## v16 — Calendar becomes a day snapshot
- Calendar's day screen no longer repeats Today. Removed: the timeline, the Planned/Time spent boxes, the task status sections, the time-block box and everything tappable in it.
- Now shows, in order: the relative-day chip; **counts** of tasks, events and deadlines; a **one-line summary** of how the day went; a compact names-only list (tasks, events, deadlines with their time, plus a ✓ / ⤫ / missed mark) and time blocks as slim lines (or "Off"); **Moved & skipped**; **View this day in Today →**; then the diary as before.
- The summary is plain facts, for example "4 of 5 done · 1h 20m logged · 1 skipped · 1 moved to Oct 9 · 1 left undone". Future days show what is planned. "Left undone" appears only for past days.
- **View this day in Today →** opens Today on that exact day.
- Month grid and its markers are unchanged. The + button on a Calendar day still adds to that day.
- Service worker cache renamed `dayflow-cache-v16`.

## v15 — Today becomes the rail timeline
- Today's day view is now a rail timeline: times down the left, a line with markers, items placed by time. Items with no time sit in an "Anytime" group above it.
- Time blocks now show on Today as coloured cards (dashed when switched off). Items attached to a block sit inside it. Tapping a block opens its sheet, where "No <block> on this day" lives.
- Filters still work. Time blocks stay visible whatever the filter, and only the items inside are filtered.
- Swipe right/left, tap menu and long-press overview are unchanged, including on items inside a time block.
- New: **Planned** and **Time spent** row at the top of Today (moved from Calendar's day screen, which is unchanged until v16).
- Slimmer time column and card padding so the item cards keep enough width on a phone.
- Service worker cache renamed `dayflow-cache-v15`.

## v14 — Backup & restore
- New: More → **Backup & restore**. Save all your data to a `dayflow-backup-YYYY-MM-DD.json` file, share it from the phone's share sheet (where supported), and restore from a file.
- Restore always asks first and shows, per section, how many items are in the file versus in DayFlow now. It replaces only the sections present in the file; everything else stays.
- Restore is safe: files are validated first, a failed or out-of-space restore rolls back to exactly what you had, and a restore can be undone (toast, plus an "Undo last restore" button for the rest of the session).
- Backups now carry `app`, `format version 2` and the app version. Older (v1) backup files still restore.
- More shows the last backup date and the app version.
- The app asks the browser to keep its data from being cleared automatically; the Backup page says plainly whether that was granted.
- Fix: the background photo path in `css/style.css` was wrong (it pointed at `css/img/bg.jpg`), so the photo did not load in the real project, only in the single-file preview.
- Fix: the service worker cache list was missing six files (time-block and palette screens, colour picker, popover, block sheet, `timeblocks.js`), so a first offline launch could fail. All files are now listed.
- Service worker cache renamed `dayflow-cache-v14` so installed copies refresh.

## v13
Time blocks, colour palette, Calendar month grid with in-app day screen, pause/resume time log, reschedule/skip history.
