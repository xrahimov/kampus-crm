# The Kampus app for phones and tablets

One React Native project in [`mobile/`](../mobile) that builds for Android, iOS and the web. It talks
to the same server as the site (`/api/v1`), speaks the same three languages from the same message
files, and wears the same look. Decisions are recorded in [ASSUMPTIONS.md](ASSUMPTIONS.md) as A-203
(sign-in), A-204 (opening the site from the app), A-205 (the app itself), A-207 (the lesson room
inside the app), A-208 (screen sharing from Android and lessons behind other apps), A-209 (the
whiteboard), A-210 (shown files), A-211 (the teacher's polls and breakout rooms), A-212 (homework
answered in the app, files opened in the app), A-213 (a group's tests, materials, chat and
exercises in the app), A-214 (the teacher's side of a group: answers with their files and a
spoken reply, the group chat, materials added from the phone), A-215 (the student's course with
flashcards, the class stream, news, results and badges, rating a lesson), A-216 (the student's
schedule with booking, time zone, paying online, Telegram, invite code and certificates), A-217
(the teacher's homework set and checked from the phone, the class stream, the gradebook and the
notes), A-218 (the teacher's course plan, coins and tests of a group), A-219 (a group's exams, knowledge
by topic, comments on students and history), A-220 (Students for teachers: the list and one
student's page), A-221 (announcements), A-222 (the whiteboard saved from the app), A-223
(screen sharing from an iPhone or iPad) and A-224 (glass and smooth motion).

Why React Native and not the site in a wrapper: kai's choice on 2026-11-23 ("rewrite it in react
native"), with two requirements said the same day: one code base in the end, and teachers must be
able to work from an iPad or a phone.

## Where it stands

| Part                                                                                                                                                                                                                         | State                                                                                                                                       |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| Sign-in: phone and password, a code from Telegram, the waiting list, choosing a password                                                                                                                                     | Built                                                                                                                                       |
| Sign-in: who approves a new account, the how-to video, the tiled wall with its drops (A-229)                                                                                                                                 | Built; the video row shows once the videos recorded in the app are on the server                                                            |
| Teacher: today, a lesson (attendance, grades, topic, homework, lesson room), groups, checking                                                                                                                                | Built, phone and tablet                                                                                                                     |
| Teacher: an answer's file and spoken answer in the app, a spoken reply; group chat; group materials                                                                                                                          | Built, phone and tablet (A-214)                                                                                                             |
| Teacher: a group's homework (set with a file, checked with rubric points), class stream, gradebook, notes                                                                                                                    | Built, phone and tablet (A-217)                                                                                                             |
| Teacher: a group's course plan (when students get a topic), coins given, test results                                                                                                                                        | Built, phone and tablet (A-218)                                                                                                             |
| Teacher: a group's exams with scores, knowledge by topic, comments on students, history                                                                                                                                      | Built, phone and tablet (A-219)                                                                                                             |
| Teacher: Students (search, a student's page with calls, groups, progress, tests, notes)                                                                                                                                      | Built, phone and tablet (A-220)                                                                                                             |
| Staff: announcements read, and posted to one group                                                                                                                                                                           | Built, phone and tablet (A-221)                                                                                                             |
| Student and parent: home, a group's page (lessons, marks, grades, payments), password                                                                                                                                        | Built, phone and tablet                                                                                                                     |
| Pages the app does not have (staff)                                                                                                                                                                                          | Open on the site in the phone's browser, already signed in (A-204); a student's side has none left                                          |
| Android app file                                                                                                                                                                                                             | Built by GitHub on every change; starts on an emulated phone                                                                                |
| iPhone and iPad build                                                                                                                                                                                                        | A manual GitHub job (simulator only); a real device needs Apple's account                                                                   |
| Google Play and App Store                                                                                                                                                                                                    | Not published: needs kai's accounts (below)                                                                                                 |
| Push notifications                                                                                                                                                                                                           | Next                                                                                                                                        |
| The lesson room inside the app: camera, microphone, chat, hands, reactions, the teacher's tools                                                                                                                              | Built, phone and tablet (A-207)                                                                                                             |
| In the lesson room: whiteboard; files shown to everyone (PDF pages, pictures, video, audio, YouTube)                                                                                                                         | Built, phone and tablet (A-209, A-210)                                                                                                      |
| In the lesson room: sharing the screen; a lesson that keeps running behind other apps                                                                                                                                        | Built: Android (A-208); iPhone and iPad (A-223): builds; Apple's sheet does not open in a simulator, needs a real device                    |
| In the lesson room: the teacher's polls and breakout rooms                                                                                                                                                                   | Built, phone and tablet (A-211)                                                                                                             |
| In the lesson room: a photo or file from the phone added to the lesson and shown                                                                                                                                             | Built, phone and tablet (A-214)                                                                                                             |
| In the lesson room: saving the whiteboard                                                                                                                                                                                    | Built, phone and tablet (A-222)                                                                                                             |
| The look: glass bars and panes, smooth motion (iPhone, iPad and Android)                                                                                                                                                     | Built (A-224, A-228); seen on the iPhone, iPad and Android simulators, not yet on a real phone                                              |
| Student and parent: homework answered in the app (text, photo, file, voice); files open in the app                                                                                                                           | Built, phone and tablet (A-212)                                                                                                             |
| Student and parent: tests, materials with lesson recordings, the group chat, exercises                                                                                                                                       | Built, phone and tablet (A-213)                                                                                                             |
| Student and parent: the course with flashcards, the class stream, news, results, rating a lesson                                                                                                                             | Built, phone and tablet (A-215)                                                                                                             |
| Student and parent: the schedule with booking, the time zone, paying online, Telegram, invite code, certificates                                                                                                             | Built, phone and tablet (A-216)                                                                                                             |
| Office: Home (figures, setup list, forecast, rooms, money), notifications, search, the menu, My salary (A-230)                                                                                                               | Built, phone and tablet                                                                                                                     |
| Office: students list with the site's filters, Add student, Make a payment, a student's payments (A-231)                                                                                                                     | Built, phone and tablet                                                                                                                     |
| Office: leads board, a lead's card, Calls today, waiting list, inbox, sign-in requests, absences (A-232)                                                                                                                     | Built, phone and tablet                                                                                                                     |
| Office: every group with filters, New group and edit, change times and teachers, days off, finish and archive, the students of a group, Add to a group, Timetable (A-233)                                                    | Built, phone and tablet; the form, the filters and Timetable need the server update with A-233                                              |
| Office: teachers (two lists, New teacher, a teacher's page, hours for 1:1 booking), the Settings list, courses with syllabus and grade weights, rooms (A-234)                                                                | Built, phone and tablet                                                                                                                     |
| Office: exams (group and mock exams with filters, Add exam and edit, finish and reopen, the grading sheet, a mock exam's registrations) (A-235)                                                                              | Built, phone and tablet                                                                                                                     |
| Office: debtors (figures, filters, a contact written down, a Telegram reminder, history) and the cash desk (day closes, Close the day, Accept) (A-236)                                                                       | Built, phone and tablet; the Excel file and the sheet to print stay on the site                                                             |
| Office: finance (key figures, plan, categories, the entries of each kind with add, edit and delete) and a month's payroll (approve, recalculate, save) (A-237)                                                               | Built, phone and tablet; the payroll's Excel file stays on the site                                                                         |
| Office: reports (the list, Payments, Student payments, Left students with Set up reasons, Lead statements, Referral programme, Students, Center statistics) (A-238)                                                          | Built, phone and tablet; Excel files stay on the site                                                                                       |
| Office: the last three reports: Graduates (record result, certificates), Staff attendance (five tabs, check-in/out, work schedules), Coins (rating, marketplace, purchase requests) (A-239)                                  | Built, phone and tablet; a certificate's page to print opens on the site                                                                    |
| Office: the rest of a student's page, first half: SMS with Send SMS, calls, history, parents, family with the parents' page, app sign-in, extra information, blacklist (A-240)                                               | Built, phone and tablet; the badge to print opens on the site                                                                               |
| Office: the rest of a student's page, second half: group cards with the lesson calendar, change of status, split fee, move, back to leads, remove; refunds, balance corrections, receipts, the old system's payments (A-241) | Built, phone and tablet; a receipt to print opens on the site                                                                               |
| Office: settings, step 1: Days off, Schools, SMS templates, Receipt settings with its sample, Coin settings with the reasons (A-242)                                                                                         | Built, phone and tablet                                                                                                                     |
| Office: settings, step 2: General settings in five tabs: Center settings, Branches, Payment methods, Grading systems, Auto SMS settings (A-243)                                                                              | Built, phone and tablet                                                                                                                     |
| Office: settings, step 3: Staff (search, role chips, archive, the staff form with roles) and Roles (the permission ticks) (A-244)                                                                                            | Built, phone and tablet; Excel export and import of staff stay on the site                                                                  |
| Office: settings, step 4a: Login log, Action log, Sent SMS, Calls and Payments, each with the site's filters and Show more (A-246)                                                                                           | Built, phone and tablet; the Excel file and receipts open on the site                                                                       |
| Office: settings, step 4b: Bot notifications (add and remove a Telegram recipient) and Forms (add, change, delete, share the link) (A-247)                                                                                   | Built, phone and tablet                                                                                                                     |
| Office: settings, step 5a: Integrations (the nine services, the waiting jobs), AmoCRM and FaceID (A-249)                                                                                                                     | Built, phone and tablet; the owner's "Shared with every centre" tick needs the server update                                                |
| Office: settings, step 5b: Tests and the question bank, a test's page with its results and Enter result (A-250)                                                                                                              | Built, phone and tablet                                                                                                                     |
| Office: settings, step 5c: Import from SOFF CRM (choose a file on the device, see how it is read, preview, import) (A-251)                                                                                                   | Built, phone and tablet; every settings section is now in the app                                                                           |
| Office: Help, the manual with its how-to videos: search, articles by role, pictures that enlarge, videos (A-252)                                                                                                             | Built, phone and tablet; needs the server update                                                                                            |
| Office: the assistant: Summary (figures and a conclusion for yesterday, today, 7 days) and Ask (the conversation), the button on Home (A-253)                                                                                | Built, phone and tablet; needs the server update                                                                                            |
| Office: a group's Discounts (give one, end one) and, in a package group, Packages (offers, students' lessons, sell a package, packages sold) (A-254)                                                                         | Built, phone and tablet; no server update needed                                                                                            |
| Office: a person's photo: chosen in the staff and student forms, shown in the lists, on a teacher's and a student's page and on More (A-255)                                                                                 | Built, phone and tablet; no server update needed                                                                                            |
| Office: the site's Excel files: every list, report, the payroll and the payments log as a file on the phone (A-256)                                                                                                          | Built, phone and tablet; no server update needed                                                                                            |
| Office: importing from an Excel sheet: rooms, courses, staff, groups, a group's students and the five imports of the Students page (A-257)                                                                                   | Built, phone and tablet; the app's part needs no server update                                                                              |
| Office: leads boards and columns (new, rename, delete) and the Sources report (A-258)                                                                                                                                        | Built, phone and tablet; no server update needed                                                                                            |
| Office: several leads ticked on the board (move, SMS, add to a group, archive, restore) and an SMS to a whole column (A-259)                                                                                                 | Built, phone and tablet; no server update needed                                                                                            |
| Office: several students ticked on the Students list (add to a group, discount, SMS, Excel, archive, restore), an SMS to the whole filtered list, and Activate (A-260)                                                       | Built, phone and tablet; no server update needed                                                                                            |
| Staff: My account: the password, the Telegram sign-in code, the devices signed in with sign out (A-261)                                                                                                                      | Built, phone and tablet; no server update needed                                                                                            |
| Staff: a group's lessons: an extra lesson, the plan topic, note and link on a lesson, students' ratings, students' own lesson links (share, new link, SMS), seats offered to the waiting list (A-262)                        | Built, phone and tablet; no server update needed                                                                                            |
| Staff: a topic's content for self-study (text, video, file, link), its words for the trainer, and self-check exercises of six kinds with results, on a topic and on a homework (A-263)                                       | Built, phone and tablet; no server update needed                                                                                            |
| Staff: attendance by badge (the camera, a hand scanner or the keyboard), from Today and from a lesson; a student's earned badges on the student's page (A-264)                                                               | Built, phone and tablet; needs a new build of the app (camera module); no server update needed                                              |
| Office: the rest of the student form (password, source, invited by, time zone, status in the group, own price, charged from, school; gender, zone and school on an edit) and the School filter (A-265)                       | Built, phone and tablet; no server update needed                                                                                            |
| Repairs from the simulator run of the finished app, run 17: a badge code sent with Enter, time zone offsets, the Owner filter on Leads, small labels (A-266)                                                                 | Built; needs a new build of the app; no server update needed                                                                                |
| Deleting one's own account, and the privacy policy the stores ask for (A-267)                                                                                                                                                | Built, phone and tablet; needs the server update (one migration) and a new build of the app                                                 |
| Ready for Google Play: a bundle signed with kai's upload key, the 16 KB check, the store page's texts and pictures (A-268)                                                                                                   | Built; waits for kai's Play Console account and key: [PLAY-STORE.md](PLAY-STORE.md)                                                         |
| The store accounts: Google Play (personal, "Kampus CRM", identity check running) and Apple (individual, approved); the iPhone app names its signing team (A-269)                                                             | Accounts open; the Mac signs once kai's Apple ID is in Xcode                                                                                |
| The first signed iPhone and iPad build, 1.0.0 (1), in TestFlight; the App Store page's texts in English and Russian as drafts (A-270, [APP-STORE.md](APP-STORE.md))                                                          | Uploaded; no testers, nothing sent for review                                                                                               |
| The App Store pictures for iPhone and iPad; a long tile name on Finance is shrunk, not cut; the sign-in wall on a tablet starts under the status bar (A-271)                                                                 | Pictures on the Mac; the two repairs need a new build of the app; no server update needed                                                   |
| A sign-in for Apple's and Google's reviewers that needs no Telegram code, made by the site owner on Settings → Organisations (A-272)                                                                                         | Built on the site; needs the server update (one migration)                                                                                  |
| "My next lesson", "Start my lesson" and "My homework" said to Siri on iPhone and iPad, and under the app's picture on Android's home screen (A-273)                                                                          | Built, tried on the iPhone, iPad and Android simulators; needs a new build of the app; Siri's voice itself is to be tried on a real iPhone  |
| The same three as functions Gemini can call on Android 16 and later (A-274)                                                                                                                                                  | Built; waits for Google: its preview programme for assistants and the app's Play record ([PLAY-STORE.md](PLAY-STORE.md#gemini))             |
| What stays on the site                                                                                                                                                                                                       | The organisations page with the server's status, the print layouts (receipt, badge, cash desk sheet, certificate), recording a video lesson |
| The site running on the app's code                                                                                                                                                                                           | Part by part, the student side first; wide tables, Excel and print last                                                                     |

## What kai needs to do

None of this blocks building; each item unlocks one step.

1. **Google Play Console** account: opened 25 November 2026, personal, developer name "Kampus CRM"
   (A-269). Google is verifying kai's identity; until its e-mail comes no app can be created there.
   A personal account must run a closed test with 12 testers for 14 days before it may publish.
   Everything else for Google Play (the upload key, the store page, the forms and Claude's answers
   for them) is in [PLAY-STORE.md](PLAY-STORE.md).
2. **Apple Developer Program**: enrolled 25 November 2026 as an individual, $99 a year, renews 26
   November 2027 (A-269). The app's two names, `center.kampus.app` and its screen-share extension
   `center.kampus.app.broadcast`, and the app group `group.center.kampus.app` are registered in the
   account. In App Store Connect the app's record exists under the name **Kampus: learning centre**
   ("Kampus" alone was taken there; on the phone the app is still called Kampus), and the first
   build, 1.0.0 (1), is in TestFlight with kai as its only tester (A-270, A-271). What kai still
   does there, in order, is in [APP-STORE.md](APP-STORE.md).
3. **Xcode** on the Mac is installed and has kai's Apple ID since 25 November 2026, so the Mac
   signs builds for a real iPhone and for TestFlight.
4. Later, for push: a free **Firebase** project (Android) and a push key from the Apple account.

Claude never handles the passwords of these accounts. Signing keys are created by kai's accounts and
kept there (Play App Signing, App Store Connect). Android's upload key is made by kai on the Mac with
`mobile/scripts/play-upload-key.sh` (A-268); Claude never sees it or its password.

## How it is put together

```
mobile/
  app.config.ts          name, identifier (center.kampus.app), icons, splash; native folders are generated from it
  src/app/               the routes (expo-router): sign-in, staff/, student/, set-password, the lesson room
  src/features/          the screens: sign-in, staff (today, lesson, groups, checking, more), student, room, shared
  src/components/        the few building blocks: Text, Button, Field, Card, Header, the navigation bar and rail
  src/api/               types of the server's answers and the data hooks (TanStack Query)
  src/lib/               the API client, session, languages, theme, layout (phone or tablet), days
  modules/kampus-call/   the app's own native code: the Android service that keeps a lesson running (A-208)
  plugins/               changes to the generated native projects: with-screen-share.js (A-208)
  scripts/               serve-web.mjs (the web build beside a local server), android-smoke.sh (CI)
  jest.setup.js          stand-ins for the native views a test cannot load (PDF, video, web view)
```

- **One server, one API.** The app calls the same `/api/v1` routes as the site's pages. The types in
  `src/api/types.ts` mirror the services' DTOs; when a service's answer changes, they change with it.
- **Sign-in.** The app sends `x-kampus-app` and gets the session token in the answer; it keeps it in
  the phone's protected storage and sends it as `Authorization: Bearer` (A-203).
- **First sign-in on the sign-in screen (A-229).** `HowToVideo`
  (`src/features/sign-in/how-to-video.tsx`) is a card under the form: the line that a new account is
  approved by the centre's staff, always, and above it the row "How to sign in for the first time"
  where the server has the video. The app asks for the videos recorded in the app itself
  (`app-sign-in` for staff, `app-student` for students and parents; files
  `help-videos/<language>/app/01-sign-in.mp4` and `app/02-student.mp4`), not the site's, which say
  there is nothing to install. It asks for the first byte of `/api/v1/help-videos/<language>/<id>`
  and shows the row only where that answers; the film is fetched only when the row is pressed.
- **The tiled wall (A-229).** `TileWall` (`src/components/tile-wall.tsx`) is the lapis panel of the
  tablet's sign-in screen, the same wall as the site's. Every star is placed by `starCentres`; do
  not go back to an SVG `Pattern` with `patternTransform`: iOS draws it unturned and cut off. Each
  star has a lit face whose opacity follows the light on it: a band of daylight, up to three drops
  (a touch; `litByDrop`) and the finger resting on the wall. All of it runs on the UI thread.
- **The office's side (A-230).** `src/features/office/` holds the centre's home (`home-screen.tsx`),
  the bell's list, the search, "My salary" and the menu under More (`menu.tsx`); `src/api/office.ts`
  has their calls, the same ones the site makes. `hasHome(me)` in `site-paths.ts` says who starts at
  Home (the full view with `dashboard.view`); the tabs and the front door follow it. `nativeRoute`
  there maps a site path to the app's screen, or to nothing, and `useOpenPath` then opens the site
  already signed in. **When a part adds a screen, add its path to `nativeRoute`**: the menu, the
  home's figures, notifications and search all start opening it in the app at once. Charts use
  `PairBars` (`pair-bars.tsx`) and the two series colours of the theme (`series1`, `series2`); run
  new chart colours through the palette check before adding any.
- **Students for the office (A-231).** The list's filters live in `student-filters.tsx` and travel as
  route params, so `nativeRoute("/students?paymentStatus=DEBTOR")` opens the list narrowed. Forms
  are sheets (`src/components/sheet.tsx`) with `Select` for one of many and `DateField` for a day
  typed as day.month.year; they show the server's field errors under the fields
  (`ApiError.fields`). `payment-sheet.tsx` is the site's Payment dialog, `student-form.tsx` the
  short Add student form, `student-payments.tsx` the Payments part of a student's page.
- **Teachers, courses and rooms (A-234).** `src/features/catalog/` and `src/api/office-catalog.ts`.
  `TeachersScreen` and `TeacherScreen` are the site's Teachers pages; `TeacherFormSheet` is its
  drawer without the password (its photo field came with A-255). `HoursCard` shows a teacher's hours for 1:1 booking and
  opens the sheet that changes them; it is also on the More screen for a teacher's own hours.
  `SettingsScreen` draws `SETTINGS_SECTIONS`, a copy of the site's `settings-nav.ts` that
  `tests/unit/app-settings-sections.test.ts` keeps equal to it. `CoursesScreen` with
  `CourseFormSheet` and `SyllabusSheet`, and `RoomsScreen`, are the two sections the app has.
  `Fact` and `ActionRow` in `src/components/rows.tsx` are the label-and-value row and the row of a
  menu of things to do. `Glass` takes `dense` for a pane people read and type on (every `Sheet`).
- **Reports (A-238).** `src/features/reports/` and `src/api/office-reports.ts`. `ReportsScreen` is
  the site's list (`REPORTS`; `NATIVE_REPORTS` are the ones `nativeRoute` keeps in the app), and
  each report is a screen of its own under `/staff/reports/`. `parts.tsx` has what they share:
  `useReportPeriod` with `PeriodFilters` (branch, year, month), `OptionFilter` (a filter that says
  what it filters by while nothing is chosen, through `Select`'s `emptyLabel`), `useDays` (two
  typed days, asked for only when both are days in the right order), `Kpis`, `Section`, `Pair`,
  `CountBars` (a name, a count and a bar to scale), `SeriesBars` (one to three series over time,
  the pressed step read out under the plot; `series3` in the theme is its third colour), `Stats`
  and `Rows` (a table row as a card), and `ReportExcel` (A-256). The Left students filters come from
  `GET /reports/churn/options`, the one call made for the app: `useChurnOptions` does not retry.
- **The last three reports (A-239).** `graduates-report.tsx` (`api/office-graduates.ts`),
  `staff-attendance-report.tsx` (`api/office-staff-attendance.ts`) and `coins-report.tsx` with
  `coins-sheets.tsx` (`api/office-coins.ts`), all on calls the site already had. `Tabs` in
  `parts.tsx` is for tabs that do not fit `Segmented` (five of them, or long names). The
  attendance chart (`DayStacks`) stacks three states in the theme's status colours with a legend
  and the pressed day in words. A product's picture goes through `choosePhoto({ smallSquare })`
  and `POST /uploads`, and shows with `fileSource` (the session's header).
- **The rest of a student's page, first half (A-240).** `api/office-student-page.ts` holds the
  calls; every query key starts with `["students", id]`, so a change to the student reads them
  again. `features/office/sms-sheet.tsx` is the one **Send SMS** sheet (give it a target:
  a student, a student's parents or a group); `lib/sms-parts.ts` counts as the site's
  `sms-counter.ts` does. `student-record.tsx` has the SMS, Calls and History sections,
  `student-family.tsx` the Family card with its sheets, `student-people.tsx` the Parents card,
  the sign-in card and the extra-information sheet. The parents' page link goes to the phone's
  share sheet (`Share.share`): the app carries no clipboard package. The office's cards show
  only when `me.view.current === "FULL"`.
- **The rest of a student's page, second half (A-241).** `api/office-student-money.ts` holds the
  calls (calendar, instalments, to-lead, refund, adjustments, the old system's payments, the
  fiscal retry). `StudentDetail.groups` is typed `StudentGroupCard`: the server always sent the
  card's facts, the app now reads them. `features/office/student-groups.tsx` has the cards, the
  calendar, the menu sheet, the split-fee sheet and the back-to-leads sheet, and reuses
  `TransferSheet` and `RemoveSheet` from `features/groups/members-screen.tsx` and the
  `PaymentSheet` with one group. `student-money.tsx` has the refund and adjustment sheets and
  the two lists under the payments; `student-payments.tsx` is the section. A student's payments
  live under `["payments", "student", id]`, so every money step invalidates `["payments"]` as
  well as `["students"]`. `GET /students/:id/payment-history` is new on the server: the hook
  does not retry, and a "not found" simply shows no list.
- **Settings, step 1 (A-242).** `features/settings/` and `api/office-settings.ts`: one screen per
  section (`days-off-screen.tsx`, `schools-screen.tsx`, `sms-templates-screen.tsx`,
  `receipt-screen.tsx`, `coins-settings-screen.tsx`), each a route under
  `app/staff/settings/`. A section becomes the app's by adding the last part of its path to
  `NATIVE_SETTINGS` in `features/office/site-paths.ts`; the Settings list then drops the arrow.
  `parts.tsx` has `RowPress` (a line of a list that opens its form) and `Bin`. Lists that can
  grow (days off, schools) are infinite queries of fifty with **Show more**. A form that stays
  open after saving (receipt, coin rules) shows "Saved." from the mutation and resets it on the
  next change. In a screen test, wait for the page's own text before pressing a header button:
  the header is drawn twice (while loading and after), and a press on the first one is lost.
- **Settings, step 2 (A-243).** General settings is one route (`app/staff/settings/general.tsx`,
  `general-screen.tsx`) with five tabs (`Tabs` from `features/reports/parts`); the calls are in
  `api/office-general-settings.ts`. `general-org.tsx` is the centre's form: one draft object
  with the numbers as typed text, `problemsOf` for what the server would refuse, and **Save**
  enabled only while `toInput(draft)` differs from what the server has. `general-lists.tsx` has
  the three list cards (branches, payment methods, grading systems) over a shared `ListCard`,
  `FormSheet` and `useRowForm`. `general-auto-sms.tsx` opens one event at a time and saves the
  whole list with that event changed. The server answers `/branches`, `/payment-methods` and
  `/grading-systems` as `{ items }`, and names a refused field by its path
  (`levels.0.maxScore`, `settings.3.template`): play both that way in tests. Check a new call's
  answer against its route before writing the hook; a test that plays the wrong shape passes.
- **Settings, step 3 (A-244).** `staff-screen.tsx` and `roles-screen.tsx` with
  `api/office-staff.ts`. The staff form is `features/catalog/teacher-form.tsx` with the `staff`
  prop: it then shows the roles, saves through `/staff`, starts a new person on a monthly
  salary and names its test ids `staff-…` instead of `teacher-…`. `onArchive` puts **Archive**
  under Save; the screen owns the question. `permissions.ts` is the app's copy of the site's
  permission list, kept in step by `tests/unit/app-permissions.test.ts` on the site's side.
- **One sheet at a time (A-245).** iOS shows one window over a screen. `Sheet` counts the sheets
  that are sliding away or being taken down, and a sheet asked for meanwhile waits for them: a
  form opened from a menu comes after the menu has left. So a screen may close one sheet and open
  the next in the same press, and a test waits for the second with `findByTestId`. A sheet
  inside an open sheet (a `Select` in a form) does not wait. Android is left as it was.
- **Settings, step 4a (A-246).** The five lists that only show: `login-log-screen.tsx`,
  `action-log-screen.tsx`, `sms-log-screen.tsx`, `calls-screen.tsx` and
  `payments-log-screen.tsx`, with `api/office-logs.ts`. `log-parts.tsx` has what they share:
  `useLogDays` and `DayFilters` (From and To, empty at first), `useLogSearch` and `SearchField`,
  and `LogBody`, which draws waiting, the error with **Try again**, the empty words, the rows
  and **Show more**. Every list is one `useLog` (an infinite query, thirty rows a page; the
  filters go into the address only when set). The logs live under `settings/logs/…`, so
  `nativeRoute` knows that one three-part path. `useLogActors` asks `GET /logs/actors`, the one
  call made for the app here; on "not found" it answers an empty list and the screens leave the
  choice out. The payments log's key starts with `payments`, so a payment taken or a fiscal
  receipt sent again asks for it anew.
- **Settings, step 4b (A-247).** `bot-screen.tsx` and `forms-screen.tsx` with
  `api/office-forms-bot.ts`. A form's address is `API_ORIGIN` + `/<language>/forms/<slug>`;
  it goes to `Share.share` and `Linking.openURL` (no clipboard package in the app). `slugify`
  is the site's, copied. The form sheet takes its columns and sources from `useLeadOptions`.
- **Small repairs from run 16 (A-248).** `isTaken(error, field)` in `lib/form.ts` tells a
  "this value is taken" refusal from the others; the three sheets that put a student into a
  group say "This student is already in the group." with it. `GroupScreen` builds its page
  links, facts, month and students apart: on a phone someone with `groups.update` gets links
  (with **Manage students** first), facts, month, students; everyone else and every tablet
  keep the old order.
- **Settings, step 5a (A-249).** `integrations-screen.tsx`, `amocrm-screen.tsx` and
  `face-id-screen.tsx` share `IntegrationForm` (`integration-form.tsx`) and the field list in
  `integration-fields.ts` (compared with the server's schemas by a site test). The form keeps
  every value as text and sends numbers and ticks in their own kind; it is not remounted when a
  save brings the list anew, so "Saved." stays, and it takes its values from the save's answer,
  which masks a secret again. `MASKED` is the site's eight dots. `state.mayShare` on the Telegram
  service says whether to show the owner's tick.
- **Settings, step 5b (A-250).** `tests-settings-screen.tsx` is the site's Settings → Tests with
  its two tabs; `test-screen.tsx` one test's page with `AttemptSheet` for a student's answers;
  `test-form.tsx` and `question-sheet.tsx` the two forms; `src/api/office-tests.ts` the calls. The
  test form is given the whole test (`OfficeTestDetail`) and never a row of the list, because a
  row has no questions and a save sends the questions; that is why a test is changed from its own
  page. A change invalidates the office's tests, the student side's test and a group's tests.
- **Settings, step 5c (A-251).** `import-screen.tsx` is the site's Import from SOFF CRM;
  `src/api/office-import.ts` its one call, sent three ways (which export, preview, import) with
  `apiForm`. `chooseSheet` and `checkSheet` in `features/files/pick.ts` pick and check the file. A
  preview is kept per file and branch; an import's answer stays until another file is chosen.
  `reasonOf` turns the server's "field: key" into words. In a screen test the upload is stood in
  for by mocking `apiForm` (the test runner's form cannot carry a file named by its address).
- **The manual (A-252).** `src/features/help/` and `src/api/office-help.ts`. `useManual` asks
  `GET /help?locale=` once and keeps the answer for the day; `HelpHomeScreen`, `HelpArticleScreen`
  and `HelpVideosScreen` all read from it. `useManualSearch` asks `GET /help/search`, the site's
  own search, from two letters. `help-parts.tsx` has the pieces: `Markup` (`**Save**` marked),
  `Blocks`, `Picture` (the room is kept from the size the server says; a press opens `/file`) and
  `VideoCard`. An article is opened at a section with `articleRoute(slug, section)`; it measures
  where its sections start and asks `Screen` to go there through `scrollRef`. In a screen test
  draw one screen per test: an `unmount()` that is not awaited leaves the next render hanging.
- **The assistant (A-253).** `src/features/assistant/` and `src/api/office-assistant.ts`.
  `AssistantScreen` has the two tabs; `?tab=summary` opens it on the summary. `BriefingPanel`
  asks `POST /assistant/briefing` for the figures first and, when the answer says `pending`, a
  second time for the model's conclusion. `assistant-store.ts` keeps one conversation outside
  React for as long as the app runs, per signed-in person; `forgetAssistantChat()` empties it in a
  test. `Conversation` and `QuestionBar` are the thread and the box to write in; the box is the
  screen's footer with `footerField`, and the page follows a new line with the `end()` of
  `Screen`'s `scrollRef`. `summary-seen.ts` remembers per person the day the summary was last on
  the screen; `HeaderActions` shows the dot from it.
- **A group's discounts and packages (A-254).** `features/groups/discounts-screen.tsx` and
  `packages-screen.tsx`, with `src/api/office-group-money.ts`. Both are pages of a group
  (`/staff/discounts/[id]`, `/staff/packages/[id]`) listed by `GroupPages` in
  `features/staff/group-screen.tsx`; Packages only where `billingMode` is `PACKAGES`. A form asks
  for the group's students (and the ways to pay) when it is first opened. `Fact` and `Facts` in
  `group-money-parts.tsx` are a table's columns as they read on a phone: the name of a figure
  above the figure, several in a row that wraps.
- **A person's photo (A-255).** `features/files/photo-field.tsx` is the photo field of the staff
  form (`catalog/teacher-form.tsx`) and the student form (`office/student-form.tsx`): it sends the
  chosen photo with `uploadPhoto` and hands the form the address; `onBusy` lets the form hold its
  Save meanwhile. `Avatar` in `components/surface.tsx` takes `photo` and falls back to the initials.
  `lib/file-source.ts` and `lib/local-file.ts` are where `fileSource` and `useLocalFile` live now;
  `features/room/file-source.ts` and `features/files/local-file.ts` re-export them.
- **Excel files (A-256).** `features/files/excel-button.tsx`: `ExcelButton` takes the call under
  /api/v1 and the list's filters, and `excelPath` makes the address the way the site's Excel link
  does. `lib/save-file.native.ts` fetches the file with `react-native-blob-util` into the cache
  and hands it to the phone (`open.file`: a preview on iOS, the reading app on Android, after a
  copy to Downloads with `media.copyToMediaStore`); `lib/save-file.ts` is the browser build's
  download; `lib/save-file-parts.ts` reads the file's name and the server's refusal. A screen's
  test mocks `@/lib/save-file` and checks the path it was asked for.
- **Imports from a sheet (A-257).** `features/files/import-sheet.tsx` is the site's import dialog
  as a sheet: the template through `saveFile`, the file through `chooseSheet`, the sheet sent with
  `apiForm` (`dryRun=1` first for an import that previews). `features/files/import-button.tsx` has
  `ImportButton` (one import), `ImportMenu` (several behind one button) and `ImportKind` (title,
  hint, the two calls, `toBranch`, `preview`); both add the person's branch and ask every list
  again after rows came in. The test IDs start with the kind's `id` (`rooms-import-open`,
  `-template`, `-choose`, `-submit`, `-done`). The staff import's passwords are only ever tested
  with made-up values.
- **Leads boards, columns and sources (A-258).** `features/leads/board-setup.tsx`: `NameSheet` (one
  name asked in a sheet; `onSubmit` throws to keep it open), `BoardSetup` (the board's menu and what
  it opens; the screen holds `BoardDoing`), `ColumnSetup` (a column's menu). `sources-screen.tsx` is
  the site's Sources report at `/staff/leads/sources`. The server's refusals are shown as they come.
- **Ticked leads (A-259).** `features/leads/leads-bulk.tsx` has `LeadsBulkBar`; the screen keeps the
  set of ticked ids and hands the bar only those still on the screen. `LeadRow` shows a tick box
  when it is given `onTick`. The SMS sheet takes the targets `leads` and `leadColumn`.
- **Ticked students (A-260).** `features/office/students-bulk.tsx` has `StudentsBulkBar` and
  `mayBulkStudents`; the Students list keeps the set of ticked ids and hands the bar only those
  still listed. `Tick` in `components/check.tsx` is the tick box at the start of a row, for any
  list. The list's own SMS uses the target `studentFilter` (the search and the filters), so it
  reaches students the app has not loaded yet.
- **My account (A-261).** `features/account/account-screen.tsx` with `api/account.ts`. The password
  itself is changed on the shared `features/shared/password-screen.tsx` (`/set-password`, with
  `current=1` when the current password is asked for), which invalidates `["account"]` after.
- **A group's lessons (A-262).** `api/group-lessons.ts` holds the calls. `ExtraLessonSheet` and
  `OfferSeatsSheet` are in `features/groups/group-lesson-parts.tsx`; `LessonExtras`
  (`features/staff/lesson-extras.tsx`) reads the lesson's row from the group's month, as the grades
  do, and saves through `useSetTopic`. `GroupLinksScreen` (`/staff/links/[id]`) builds a student's
  address with `classLink`, which uses the page's own address in a browser build.
- **A topic's content, words and exercises (A-263).** `api/topic-content.ts` holds the calls and `features/topics/` the screens: `TopicContentScreen` (`/staff/topic/[id]`, from **Content** on a group's plan) with `ExercisesPanel` and `WordsPanel`, `ExerciseEditorScreen` (`/staff/exercise/[id]`, `new` for a new one, with `topic` or `homework` saying where it belongs) and `HomeworkExercisesScreen` (`/staff/exercises/[id]`). The rules are the site's own, imported from `@kampus/lib/validation/` (`topic-content`, `exercises`, `vocab`): do not copy them into the app. A block is drawn with the students' own `Block` from `features/student/course-screen.tsx`.
- **Attendance by badge (A-264).** `features/scan/scan-screen.tsx` (`/staff/scan`, with `lesson`, `group` and `time` when it is for one lesson) and `badge-camera.tsx`, the only place that uses `expo-camera`. `expo install` cannot reach Expo from the cloud container: take a module's version from `node_modules/expo/bundledNativeModules.json` and `npm install` it. In a browser the module reads codes with the browser's `BarcodeDetector`, which the headless test browser lacks; the screen check gives it one made of the site's `jsqr`, and a still picture as the camera (`--use-file-for-fake-video-capture`). In tests `expo-camera` is mocked in `jest.setup.js`: `CameraView` is a tag a test hands a code to with `fireEvent(camera, "barcodeScanned", { data })`. A student's badges are `BadgeTiles` (`features/badges/badge-tiles.tsx`), shared with the student's own Results.
- **The student form (A-265).** `features/office/student-form.tsx` is the site's whole form. `student-form-parts.tsx` has the two fields that choose from a long list: `StudentPickField` (a student found with `useStudentSearch`) and `TimeZoneField` (a zone found by its city in `lib/time-zone-names.json`, as the student's own card does). Source and School are shown only when `GET /students/options` lists any.
- **What run 17 taught (A-266).** On a phone `onSubmitEditing` can arrive before the last `onChangeText`: a field that a hand scanner types into takes its text from the event (`event.nativeEvent.text`), not from state. The app's engine answers `timeZoneName: "shortOffset"` with a bare "GMT": work an offset out from the zone's clock (`timeZoneLabel` in `src/lib/time-zones.ts` does). A child with `flex: 1` makes its auto-width parent take the whole row on a phone (a browser sizes it by its content), so a `Check` beside another control gets `inline`. A row with `alignItems: "baseline"` did not wrap on the iPad although `flexWrap` was set: put what may not fit in a row that already wraps. With the keyboard open, a phone shows the focused field just above it and nothing below, so what must be seen while typing goes above the field. The iOS simulator has no camera: the preview is black after Allow, and only a real phone shows a badge being read. For a run, the iPad Pro 13-inch simulator carries the live build and the iPhone 18 Pro the test student: use the iPhone 17 and the iPad Air.
- **Deleting an account (A-267).** `useDeleteStudentAccount`, `useAskDeletion` and `useWithdrawDeletion` are in `api/account.ts`. The student's button is at the foot of `features/student/home-screen.tsx` and signs the app out when the server has answered; the staff card is in `features/account/account-screen.tsx`. Both open the site's `/delete-account` page for the longer explanation, so its text lives in one place.
- **The Play build (A-268).** `plugins/with-release-signing.js` edits the generated `android/app/build.gradle` and throws when the template's lines are not where it expects them, so an Expo upgrade that moves them fails loudly in the **Google Play bundle** trial run and not silently with a test-signed file. `scripts/check-page-size.sh` and `scripts/check-play-bundle.sh` need only `readelf`, `unzip`, `keytool` and `jarsigner`. `scripts/play-upload-key.sh` is for kai's own hand: never run it in a check or from a Remote Control session. Store texts are in `store/listing.json`; change them there and paste into Play Console. On a phone a track's `stop()` does not end its capture: a screen share's foreground service and notice stay until `release()`, which `releaseWhenStopped` in `features/room/platform.native.tsx` hangs on `stop()` because the call engine is the site's and knows no `release()`. An auto-width `Text` on Android can be laid out a hair narrower than measured and lose its last letter or word: use `RoomyText` (`components/roomy-text.tsx`) for a one-line text beside something that takes the rest of the row, as `Check` with `inline` and the gradebook's figures do: its width comes from an unseen copy one space longer; padding or `flexShrink: 0` do not help. A `Confirm` has two buttons in half a phone's width each: keep the confirming label to one word. Screenshots for Play may not be longer than twice their width: take them at 1080 × 1920 (`adb shell wm size 1080x1920`), not at the emulator's own size.
- **Signing for iPhone and iPad (A-269).** The team is `ios.appleTeamId` in `app.config.ts`; `plugins/with-screen-share.js` gives the extension the same team, and `scripts/check-ios-project.mjs` fails when the two differ. Signing is automatic: Xcode makes the certificates and profiles itself once the Apple ID is added in Xcode on the Mac, which is kai's own step. In Apple's page for a new App Group the field already holds `group.`: type only the rest.
- **The App Store build (A-270).** The commands, and why a new team's first archive fails until one real device is registered, are in [APP-STORE.md](APP-STORE.md#how-it-is-built). The store build has no `EXPO_PUBLIC_API_URL` and a higher `APP_BUILD` each time. Apple's store texts are in `store/app-store.json` (English and Russian; Apple has no Uzbek page) and the description in `store/listing.json`; change them there, then in App Store Connect. Never press **Add for Review** there: that is kai's word.
- **Dark surfaces at the top of a tablet (A-271).** iPadOS draws the clock and date at the top left in one colour for the whole bar, the page's ink. Anything dark that reaches the top edge there (the menu rail, the sign-in wall) hides them in light mode, so both start under the status bar with `paddingTop: insets.top` on a wrapper in the page's colour. A new dark panel on the left needs the same.
- **Shortcuts from outside the app (A-273).** `features/shortcuts/` is the app's side:
  `snapshot.ts` makes the note (names and hours only; never put a class link or a token in it),
  `native.ts` hands it to the phone, `shortcuts-bridge.tsx` (drawn once in `app/_layout.tsx`) writes
  it whenever the day or the student's home is loaded and wipes it at sign-out, and
  `/shortcut/[what]` (`shortcut-screen.tsx` with `targets.ts`) turns a wish into a screen from the
  server's own answer. Siri's side is Swift in `mobile/app-intents/`, compiled into the app itself
  (`experiments.inlineModules` in `app.config.ts`) with the package `expo-app-intents`: the three
  intents, `AppShortcuts.swift` with the English phrases, `KampusNote.swift` reading the note and
  `KampusAnswers.swift` making the sentence. The words are not in Swift: titles come through
  `locales` in `app.config.ts`, the answers from `mobile.shortcuts.say` of the message files
  (written as `Kampus.strings` by `plugins/with-voice-shortcuts.js`), the Russian phrases from
  `plugins/voice/siri-phrases.ru.json`. A title in Swift must equal the English message letter for
  letter, and every phrase needs its Russian line: `plugins/__tests__/voice-shortcuts.test.ts`
  fails otherwise. Apple allows ten shortcuts for an app and every phrase must hold
  `\(.applicationName)`. Android's list is plain files written by the same plugin
  (`res/xml/kampus_shortcuts.xml`), each a link `kampus://shortcut/<wish>`; a fourth shortcut is
  one more line in `SHORTCUTS` there and in `targets.ts`. A screen a person reaches by hand calls
  `useDonation` so the iPhone learns the hour.
- **Functions for Gemini (A-274).** The Kotlin is `plugins/gemini/KampusFunctions.kt`, copied into
  the generated project's app module by `plugins/with-gemini-functions.js`, which also adds Google's
  library `androidx.appfunctions`, its code generator (KSP) and the service's manifest entry. The
  comments above each function and field are what the assistant reads: keep them short, what the
  thing is for first. The generator's version must be the one Expo pairs with the app's Kotlin
  (`ksp` in `app.config.ts`; a test compares it with Expo's own table after an upgrade). Try a
  function on an Android 16 emulator with
  `adb shell cmd app_function list-app-functions --package center.kampus.app` and
  `adb shell "cmd app_function execute-app-function --package center.kampus.app --function 'center.kampus.app.functions.BaseKampusAppFunctionService#getNextLesson' --parameters '{}'"`.
- **Finding what is missing.** The last sweep listed every `route.ts` under `src/app/api/v1` with
  its methods and looked for each path's last fixed part in `mobile/src`: a call nobody names is a
  feature the app lacks. Worth repeating after the site gains a feature.
  Next free number: A-275.
- **Finance and payroll (A-237).** `src/features/finance/` and `src/api/office-finance.ts`.
  `FinanceScreen` is the site's Finance page; `EntriesScreen` the entries of a kind or of a
  category (`entries-routes.tsx` reads which from the address), with `EntrySheet`, the site's one
  form for every money row; `PayrollScreen` a month's payroll. `period.tsx` has the year and month
  fields the three share. The sums on the Finance page's cards come from `GET /finance/totals`,
  the one call made for the app: `useFinanceTotals` does not retry, and the cards show without sums
  when the server answers "not found". The payroll's Excel file comes to the phone (A-256).
- **Debts and the cash desk (A-236).** `src/features/money/` and `src/api/office-money.ts`.
  `DebtsScreen` is the site's Debtors page with `DebtContactSheet` and `DebtHistorySheet`;
  `CashDeskScreen` the site's Cash desk page with `CloseDaySheet`. The debts list reads `status`,
  `branchId` and `q` from its address, which is how a notification opens it filtered. The day's
  figures (`useCashDay`) are never kept: they are asked for again each time the sheet opens, and
  while they are on their way nothing of an earlier count is shown or acted on.
- **Exams (A-235).** `src/features/exams/` and `src/api/office-exams.ts`. `ExamsScreen` is the
  site's Exams page, `ExamFormSheet` its form (also opened from a group's Exams page with the group
  given), `ExamScreen` an exam's own page with the grading sheet and a mock exam's registrations.
  The route of one exam is `/staff/exam/[id]`; `/staff/exams/[id]` was already a group's exams, by
  the group's id. What is typed on the sheet is kept per student apart from the server's rows, so
  an answer that arrives meanwhile does not wipe it.
- **Groups for the office (A-233).** `src/features/groups/` and `src/api/office-groups.ts`.
  `GroupsTab` picks the office's list (`OfficeGroupsScreen`) in the full view and the teacher's cards
  otherwise. `GroupFormSheet` is the site's group drawer in two modes, "full" and "schedule"; the
  clash warning belongs to one exact state of the form (its JSON), so any change hides it and
  "Save anyway" can only resend what was shown. `GroupOffice` is the office's card on a group's page
  with its sheets; `MembersScreen` (`/staff/members/[id]`) the students of a group; `TimetableScreen`
  one room's or teacher's week. `TimeField` (`src/components/time-field.tsx`) is a time typed as
  "19:30", `Chip` an on-off choice. The lists the form chooses from come from
  `GET /groups/options`, the week from `GET /groups/timetable`: both were added for the app, since
  the site reads them on its pages. A sheet that is mounted already open takes its first values from
  its props (the tests do that); one that opens later resets when it opens.
- **Leads and the people to call (A-232).** `src/features/leads/` and `src/api/leads.ts`. `LeadFlow`
  (`lead-flow.tsx`) is everything done with one lead: the board, Calls today and a chat hand it the
  lead that was pressed and it shows the card, then one sheet at a time. `ContactSheet`
  (`features/office/contact-sheet.tsx`) is the "Log a contact" form of both leads and absences;
  `JoinGroupSheet` the last step of a lead or a waiting-list entry joining a group; `Confirm`
  (`src/components/confirm.tsx`) the question before an archive, a delete or a decline. The inbox
  chat reuses the group chat's thread (`features/shared/chat-thread.tsx`). A `Select` whose list has
  an "all" row must not have an option valued `none`: that is the row's own key.
- **Languages.** `messages/uz.json`, `ru.json` and `en.json` are the app's texts too. Texts only the
  app has live under the `mobile` key of the same files, so the key-parity test covers them.
- **Look.** `src/lib/theme.tsx` holds the site's colours as plain values (light and dark), Onest in
  four weights, and the 4-point spacing scale.
- **Phone and tablet.** `useLayout()` answers "wide" from 768 points. A phone gets a bar of four
  places at the bottom; a tablet gets the lapis rail on the left and two columns. A screen is written
  once and places its two halves side by side or one under the other.
- **Changes feel instant.** Attendance and grades are shown at once and sent behind; a refusal puts
  the screen back and shows the server's reason.
- **The site from the app.** `openOnSite(path)` asks for a one-minute link and opens it in the
  phone's browser (A-204), for pages the app does not have yet.
- **The lesson room is the site's own (A-207).** The call engine (who is in the room, the
  connections, chat, hands, the teacher's tools) and the rules for who is on the stage live in
  `src/lib/video/` and are imported by the site and by the app, so both are in one room and a fix
  lands in both. The app adds the drawing (`src/features/room/call-screen.tsx`, `tile.tsx`), the
  waiting screen and joining (`room-flow.tsx`) and the one file that differs by device:
  `platform.native.tsx` on phones (`react-native-webrtc` gives the engine the browser's names,
  `RTCView` draws a picture, `react-native-incall-manager` chooses the loudspeaker and keeps the
  screen awake) and `platform.tsx` in the web build. Camera and microphone wording for the phone's
  permission question comes from the message files (`mobile.permissions`) through `app.config.ts`.
- **Screen sharing and the lesson's notice on Android (A-208).** The call engine is given the
  device's own way to open a screen (`screenShare.open` in `platform.native.tsx`). The plugin
  `plugins/with-screen-share.js` switches on the WebRTC library's screen-capture service in the
  generated `MainApplication`, adds its notification icon and translates its notice. The lesson's
  own foreground service lives in `modules/kampus-call` (an Expo module found by autolinking):
  `callAudio.start()` starts it when someone joins and `callAudio.stop()` ends it. On iOS a call
  keeps running by itself (the "audio" background mode).
- **Glass (A-224).** `src/components/glass.tsx` has the one component, `Glass`. It draws
  Apple's Liquid Glass on iOS 26 and later (`expo-glass-effect`), a blur on older iPhones and in
  a browser (`expo-blur`), a blur on Android 12 and later, and a nearly solid pane where nothing
  can be blurred; a device set to "Reduce transparency" gets a solid pane. Android can only blur
  a part of the screen that is named: `GlassScope` holds the name, `Backdrop` is the page, and
  glass inside the scope (never inside the backdrop) blurs it. `Screen` does this for every
  screen: the page is the backdrop, the header and the save bar float over it, and the page
  leaves room for them at the top and bottom. The staff tabs do it for the navigation bar and
  tell the screens how much of the bottom the bar covers (`BottomBarSpace`). Only things that
  float are glass; cards, rows and the tablet's rail are solid. Learned on the simulators
  (A-228): Android blurs only what the backdrop's CHILDREN draw and fills the rest with the
  window's light background, so `Backdrop` paints the page's colour with a view of its own inside
  it (a colour on the backdrop itself is outside what the blur reads; a dark header came out
  grey twice). Android's blur brings a tint that grows with its strength, so the strength and
  the pane's own veil are lower there. On an iPhone the room under the header is the scroll
  view's `contentInset`, not padding. Reloading by pulling down: Android uses the
  system's refresh control, moved below the header (`progressViewOffset`). An iPhone and iPad
  do not: on the iOS 27 simulators the system's spinner drew nowhere under a floating header,
  whatever was tried. There the pull is measured by the app (`onScrollEndDrag`: the page moved 40 points,
  which is a drag of about 80 because an iPhone's page resists) and the app draws its own sign
  (`ReloadSign`: a small pane of glass under the header, pale while the pull is short, clear
  and turning once it is far enough and while the page reloads). Both are in
  `usePullToReload` (`surface.tsx`), which `Screen` uses; a list that scrolls by itself (the
  tablet's lessons of the day) calls it too. The sign belongs to the person's pull: it shows
  from the pull until the page has reloaded and at least 0.7 s; a reload nobody pulled shows
  none.
- **Motion (A-224).** `src/components/motion.tsx`, on `react-native-reanimated` (it was already
  in every build, the router brings it). `Press` is anything pressable: it sinks under the
  finger and springs back. `useArrival` gives cards the cascade in which they appear (the first
  two dozen; a long list is simply there). `SPRING` and `SPRING_FIRM` are the app's two springs.
  The navigation's highlight slides (`nav.tsx`), a chosen place fades up (`tab-fade.tsx`: the
  start of that motion is set when the place is left, never when it comes back, or it blinks;
  and it starts pale, not empty), the segmented choice's fill slides (`surface.tsx`). The library follows the device's "Reduce
  motion" by itself. In a browser an arrival must use the library's own animation unchanged:
  with values of its own, the library leaves the element pinned out of the page's flow.
  Tests run with the library's resolver (`jest.resolver` in `package.json`).
- **Screen sharing on iPhone and iPad (A-223).** iOS captures the screen in an app extension, a
  second small program inside the app. Its code is `plugins/broadcast/SampleHandler.swift`: it
  sends each frame as a JPEG through a socket in the app group's folder
  (`group.center.kampus.app`), in the form `react-native-webrtc` reads. `plugins/with-screen-share.js`
  copies it into the generated project, adds the target `KampusBroadcast`
  (`center.kampus.app.broadcast`), embeds it in the app before the script steps, and gives both
  the app group. `modules/kampus-call/ios/KampusBroadcastModule.swift` opens the system's sheet
  (`showPicker`) and passes on the extension's "started" and "stopped", which arrive as Darwin
  notifications. `src/features/room/ios-broadcast.ts` waits for "started" (or reads a closed sheet
  from the app coming back to the front) and only then asks the library for the screen's track.
  `scripts/check-ios-project.mjs` checks the generated project on any computer; GitHub runs it on
  every change. The app's workflow can also be started by hand with **ios_extension** ticked: a Mac
  runner then compiles only the extension, in a few minutes. The iPhone simulator cannot capture a screen, so the share itself can only be
  tried on a real iPhone or iPad, which needs Apple's account (below).
- **Whiteboard and shown files (A-209, A-210).** `board.tsx` draws the engine's strokes with
  `react-native-svg` and sends new ones; `material-stage.tsx` draws a shown file by its kind and
  `files-panel.tsx` is the teacher's list. Files that differ by device come in pairs:
  `pdf-page.native.tsx` (`react-native-pdf`) and `pdf-page.tsx` (the web build: a card),
  `youtube.native.tsx` (a web view) and `youtube.tsx` (an iframe). `file-source.ts` turns the
  server's file address into one the app can ask for, with the session for staff files.
- **Polls and breakout rooms (A-211).** `poll-panel.tsx` (the teacher's form and results, the
  student's card) and `breakout-panel.tsx` sit in the lesson's side panel like the chat; both only
  call the shared engine. `panel-parts.tsx` holds the chips, buttons and inputs the panels share.
- **Homework and files (A-212).** `src/features/student/homework-screen.tsx` is the page;
  `src/features/files/` is shared by anything that sends or opens a file: `pick.ts` (camera, photos,
  documents, with the server's size and kind rules checked on the phone), `recorder.tsx` and
  `audio-clip.tsx` (`expo-audio`), `file-screen.tsx` (the `/file` route) with
  `pdf-document.native.tsx` and `pdf-document.tsx` (the web build: the browser's own viewer).
  `apiForm` in `src/lib/api.ts` sends a form with a file through `src/lib/send-form`: on a phone
  that is React Native's own request (`send-form.native.ts`, XMLHttpRequest), because Expo's
  `fetch` refuses a file given by its address on the phone ("Unsupported FormDataPart
  implementation"), which the web build and the tests never show; the web build and the tests use
  `send-form.ts` (`fetch`). Never send a form with a file through `fetch` in the app. Photos from
  an iPhone's library are asked for in the compatible form (JPEG), since the server takes no HEIC.
  On iOS the type the app names for a file does not reach the server: React Native names the part
  by the file's ending (`audio/x-m4a` for a recording), so the server knows those names (A-226).
  `pick.ts` puts the keyboard away before a picker opens (on an iPad the first tap did nothing
  while a text box had the cursor) and does not open a camera the device does not have: the iPhone
  simulator closes the app when asked ("Source type 1 not available"). The tests run as a real
  phone (`expo-device` in `jest.setup.js`).
- **`flex: n` on a `ScrollView`.** A `ScrollView` brings `flexGrow: 1` of its own, and that wins
  over the `flex: n` in its style: two scrolling columns with `flex: 4` and `flex: 7` share the
  width evenly. A plain `View` with `flex: 4` beside one of them takes four fifths. Write
  `flexGrow`, `flexShrink` and `flexBasis` out for columns (Today's two columns do: two parts for
  the list, three for the lesson).
- **Text on Android.** A label exactly as wide as its words can lose its last word on Android:
  the line fits when measured and breaks when drawn, and the second line is outside the view
  ("Turn everyone's microphone off" in the lesson's People panel, on a tablet). Letting the
  label shrink and `textBreakStrategy="simple"` (still set in `src/components/text.tsx`) did not
  help. A button that fills its row gives its label the room that is left (`flexGrow: 1`,
  centred), as `RoomButton` in the lesson does.
- **The keyboard.** Android draws the app edge to edge here, so the window does not shrink for the
  keyboard. `Screen` (`src/components/surface.tsx`), the chat thread and the lesson's side sheet
  sit in a `KeyboardAvoidingView` with `padding` on Android as well as iPhone; a new screen with
  its own text box at the bottom needs the same. That view works out the keyboard's overlap from
  its place in its parent, not on the screen: one that does not start at the top of the screen
  must be told how far down it starts (`keyboardVerticalOffset`, measured with
  `measureInWindow`; `SidePanel` in the lesson room does this), or it makes too little room.
- **A group's pages for students (A-213).** `src/api/portal.ts` holds the calls (the personal
  link's token is the key, no session). `tests-screen.tsx` is the list, the run and the result;
  `materials-screen.tsx` lists files, links and recordings and hands a recording to the file page
  with its streaming copy and the place to continue from; `chat-screen.tsx` is the thread;
  `exercise-screen.tsx` does one exercise; `answer-parts.tsx` holds the answer rows and word chips
  that tests and exercises share.
- **The rest of a group's pages for students (A-215).** The calls sit with the others in
  `src/api/portal.ts`. `course-screen.tsx` shows the progress, the topics and their blocks
  (`ExerciseRows` in `exercise-rows.tsx` lists a topic's exercises the way a homework task does);
  `vocab-card.tsx` runs the flashcards (a missed word goes to the end of the run);
  `stream-screen.tsx` is the class stream (every change answers with the whole post, which
  replaces the one in the cache); `news-screen.tsx` marks what was unread as read once;
  `results-screen.tsx` shows the grade, badges, exams and tests; `lesson-rating.tsx` is the stars
  under a lesson on the group's screen. `PendingScreen` (`src/features/shared/`) is the waiting
  and try-again state these pages share.
- **What a student arranges for themselves (A-216).** `src/api/portal-own.ts` holds the calls.
  `schedule-screen.tsx` shows the weekly times and the next lessons, and for a one-to-one student
  the moving, cancelling, rebooking and booking: every change answers with the whole schedule,
  which replaces the one in the cache; `PickTime` offers the teacher's free times when they keep
  booking hours and a day-and-start grid otherwise. `time-zone-card.tsx` searches
  `src/lib/time-zone-names.json` (written once with
  `node -e "console.log(JSON.stringify(Intl.supportedValuesOf('timeZone')))"`, because Hermes
  cannot list zones). `pay-screen.tsx` starts a payment, opens the provider's page with
  `expo-web-browser` and asks `pay/:id` until the payment is confirmed. `telegram-screen.tsx`
  opens the bot with `Linking` and looks for the new chat. `invite-screen.tsx` and the
  certificates in `results-screen.tsx` use the phone's share sheet (`Share`).
- **A teacher's homework, stream, gradebook and notes (A-217).** `src/api/staff-group.ts` holds
  the calls. `task-form.tsx` is the one form a task is written in (the lesson's card and the
  group's homework page both show it; whoever shows it decides where the task is saved);
  `features/files/attach.tsx` is the file part of any teacher's form (a new photo, a photo, a
  file; a saved file opened, replaced or removed). `group-homework-screen.tsx` lists the tasks and
  shows a waiting answer with `AnswerCard` from `checking-screen.tsx`, which also gives the points
  of a rubric. `features/shared/stream-post.tsx` draws a post for the student's and the teacher's
  stream; `group-stream-screen.tsx` adds the teacher's tools. A lesson's homework is always sent
  whole (`saveLessonHomework`): the server replaces what it has.
- **A teacher's course plan, coins and tests (A-218).** The calls are in `src/api/staff-group.ts`
  too. `group-plan-screen.tsx` reads `/groups/:id/syllabus` and `/groups/:id/progress` and saves
  only a topic's release (`PUT /groups/:id/syllabus/:topicId/release`); `group-coins-screen.tsx`
  gives coins through `POST /coins/give`; `group-tests-screen.tsx` only reads, and asks for a
  test's results when its card is opened.
- **A group's exams, knowledge, comments and history (A-219).** Four reading pages over the
  site's own calls (`/groups/:id/exams`, `/exams/:id/results`, `/groups/:id/knowledge`,
  `/groups/:id/student-comments`, `/groups/:id/history`); only a comment is written. The name of a
  history entry comes from `src/lib/group-history.ts`, which the site's history tab uses too.
  `GroupPages` in `group-screen.tsx` shows the first six pages and folds the rest; a new page goes
  into its list, before or after the fold by how often a teacher needs it.
- **Students for teachers (A-220).** `src/api/staff-students.ts` holds the calls; the list is an
  infinite query over `/students?sort=fullName:asc` (30 a page, `q` for the search).
  `students-screen.tsx` is the tab, `student-screen.tsx` the page of one student; its parts ask
  for their data when opened. A call is `Linking.openURL("tel:…")`.
- **Announcements (A-221).** `src/api/staff-announcements.ts` and `announcements-screen.tsx`, at
  `/staff/announcements`, opened from **More**. A new notice always has the audience `GROUP`.
- **Saving the whiteboard (A-222).** The teacher's toolbar on the whiteboard has a save button
  (`board-save` in `src/features/room/board.tsx`). The picture is a PNG of 1600 by 900 and goes
  as plain bytes to `POST /video/rooms/:roomId/board`, the address the site uses, through
  `apiBytes` in `src/lib/api.ts` (it travels the way a form does, so a phone can send it).
  Who makes the picture differs: `board-picture.native.ts` asks the drawn board itself
  (`toDataURL` of react-native-svg; an iPhone is asked in points, so the size is divided by the
  screen's density), `board-picture.ts` paints the strokes on a canvas with the site's own
  painter, which now lives in `src/lib/video/board-paint.ts`. Tests swap the picture maker out.
- **The teacher's side of a group (A-214).** `src/api/group-pages.ts` holds the calls (behind the
  session): the group's chat and materials, storing a file (`uploadDocument`) and adding it
  (`addGroupFile`). `src/features/shared/` holds what the student's and the teacher's side draw the
  same way: `chat-thread.tsx` (the thread, the box, asking for new messages) and
  `material-list.tsx` (materials under their lessons, with an optional bin). The staff screens are
  `group-chat-screen.tsx`, `group-materials-screen.tsx` and the reply part of
  `checking-screen.tsx`. `useLocalFile` (`src/features/files/local-file.ts`) is how the web build
  shows a file that sits behind the session: a browser's picture or player cannot send the session,
  so the file is fetched first; a phone sends the session with its own request.
- **A plain-http test build.** With `EXPO_PUBLIC_API_URL` starting with `http://` the Android build
  allows plain http (for a server on the desk); every other build refuses it. The address must be
  set when `expo prebuild` runs, not only for the build after it: without it the manifest says
  `usesCleartextTraffic="false"` and the app shows "No connection to Kampus".
- **Shared code and its packages.** A file under `../src/lib` that the app imports may use only
  packages `mobile/` has installed too (today: `zod`). GitHub installs only `mobile/`'s packages for
  the app's checks, so anything else fails there first.
- **Native folders are generated.** `android/` and `ios/` are not in git; `npx expo prebuild` makes
  them from `app.config.ts`.

## Run it

Everything below runs in `mobile/` after `npm ci`. Node 22.

**In a browser, beside a local server** (the quickest way to see a change):

```bash
# in the repository root: the server with seed data on http://localhost:3000
npm run dev
# in mobile/: build the web version and serve it with /api passed through to the server
npm run export:web && node scripts/serve-web.mjs      # http://localhost:8090
```

Seed sign-ins: `+998900000004` (teacher) and `+998900000001` (director), with the seed password
from `.env`. Choose **Staff** on the sign-in screen.

**On a phone, while developing:** `npx expo run:android` (needs Android Studio) or `npx expo run:ios`
(needs Xcode), with `EXPO_PUBLIC_API_URL` pointing at the server, for example
`EXPO_PUBLIC_API_URL=http://10.0.2.2:3000` for the Android emulator. Without it the app talks to
`https://kampus.center`.

**The lesson room** needs a camera: a browser and a real phone have one, the Android emulator shows
a moving test picture, the iOS simulator has none (people there join with the microphone only). To
try a lesson alone, open the teacher in the app and a student's lesson link in a browser on the same
server.

**Checks:** `npm run typecheck`, `npm run lint`, `npm test`.

## Builds

`.github/workflows/mobile.yml` runs when `mobile/`, the message files or the shared code under
`src/lib` change:

1. **Typecheck, lint, tests, web build.**
2. **Android app file.** Generates the Android project and builds a release `.apk` for phones and
   tablets (arm64) and the emulator. It is kept with the run for 30 days under **Artifacts** as
   `kampus-android`. It is signed with a test key, so it installs by hand ("install unknown apps")
   and each newer build installs over the older one; it is not the file for Google Play.
3. **Android app starts.** Installs that file on an emulated phone, opens it and waits for the
   sign-in screen; a picture of the screen is kept with the run.
4. **iPhone simulator build**, only when started by hand with the box ticked (**Actions → Mobile app
   → Run workflow**): it uses a macOS machine, which counts ten times the minutes. It proves the app
   compiles for iOS; it does not make a file for a real iPhone.

To install the Android file on a phone: open the run on GitHub, download `kampus-android`, unzip it,
send the `.apk` to the phone and open it.

## Adding a screen

1. The route file in `src/app/…` re-exports a screen from `src/features/…`.
2. The screen reads data through a hook in `src/api/hooks.ts` and types in `src/api/types.ts`.
3. Texts: reuse the site's keys where the words are the same; add app-only ones under `mobile` in
   all three message files (the key sets must match).
4. Lay it out for both widths: `useLayout().wide`. Check it at 390×844 and at 1180×820.
5. A test beside it in `__tests__/`, and a row in ASSUMPTIONS.md.
