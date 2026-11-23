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

| Part                                                                                                                                                          | State                                                                                                                    |
| ------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ |
| Sign-in: phone and password, a code from Telegram, the waiting list, choosing a password                                                                      | Built                                                                                                                    |
| Sign-in: who approves a new account, the how-to video, the tiled wall with its drops (A-229)                                                                  | Built; the video row shows once the videos recorded in the app are on the server                                         |
| Teacher: today, a lesson (attendance, grades, topic, homework, lesson room), groups, checking                                                                 | Built, phone and tablet                                                                                                  |
| Teacher: an answer's file and spoken answer in the app, a spoken reply; group chat; group materials                                                           | Built, phone and tablet (A-214)                                                                                          |
| Teacher: a group's homework (set with a file, checked with rubric points), class stream, gradebook, notes                                                     | Built, phone and tablet (A-217)                                                                                          |
| Teacher: a group's course plan (when students get a topic), coins given, test results                                                                         | Built, phone and tablet (A-218)                                                                                          |
| Teacher: a group's exams with scores, knowledge by topic, comments on students, history                                                                       | Built, phone and tablet (A-219)                                                                                          |
| Teacher: Students (search, a student's page with calls, groups, progress, tests, notes)                                                                       | Built, phone and tablet (A-220)                                                                                          |
| Staff: announcements read, and posted to one group                                                                                                            | Built, phone and tablet (A-221)                                                                                          |
| Student and parent: home, a group's page (lessons, marks, grades, payments), password                                                                         | Built, phone and tablet                                                                                                  |
| Pages the app does not have (staff)                                                                                                                           | Open on the site in the phone's browser, already signed in (A-204); a student's side has none left                       |
| Android app file                                                                                                                                              | Built by GitHub on every change; starts on an emulated phone                                                             |
| iPhone and iPad build                                                                                                                                         | A manual GitHub job (simulator only); a real device needs Apple's account                                                |
| Google Play and App Store                                                                                                                                     | Not published: needs kai's accounts (below)                                                                              |
| Push notifications                                                                                                                                            | Next                                                                                                                     |
| The lesson room inside the app: camera, microphone, chat, hands, reactions, the teacher's tools                                                               | Built, phone and tablet (A-207)                                                                                          |
| In the lesson room: whiteboard; files shown to everyone (PDF pages, pictures, video, audio, YouTube)                                                          | Built, phone and tablet (A-209, A-210)                                                                                   |
| In the lesson room: sharing the screen; a lesson that keeps running behind other apps                                                                         | Built: Android (A-208); iPhone and iPad (A-223): builds; Apple's sheet does not open in a simulator, needs a real device |
| In the lesson room: the teacher's polls and breakout rooms                                                                                                    | Built, phone and tablet (A-211)                                                                                          |
| In the lesson room: a photo or file from the phone added to the lesson and shown                                                                              | Built, phone and tablet (A-214)                                                                                          |
| In the lesson room: saving the whiteboard                                                                                                                     | Built, phone and tablet (A-222)                                                                                          |
| The look: glass bars and panes, smooth motion (iPhone, iPad and Android)                                                                                      | Built (A-224, A-228); seen on the iPhone, iPad and Android simulators, not yet on a real phone                           |
| Student and parent: homework answered in the app (text, photo, file, voice); files open in the app                                                            | Built, phone and tablet (A-212)                                                                                          |
| Student and parent: tests, materials with lesson recordings, the group chat, exercises                                                                        | Built, phone and tablet (A-213)                                                                                          |
| Student and parent: the course with flashcards, the class stream, news, results, rating a lesson                                                              | Built, phone and tablet (A-215)                                                                                          |
| Student and parent: the schedule with booking, the time zone, paying online, Telegram, invite code, certificates                                              | Built, phone and tablet (A-216)                                                                                          |
| Office: Home (figures, setup list, forecast, rooms, money), notifications, search, the menu, My salary (A-230)                                                | Built, phone and tablet                                                                                                  |
| Office: students list with the site's filters, Add student, Make a payment, a student's payments (A-231)                                                      | Built, phone and tablet                                                                                                  |
| Office: leads board, a lead's card, Calls today, waiting list, inbox, sign-in requests, absences (A-232)                                                      | Built, phone and tablet                                                                                                  |
| The office's other pages: the rest of a student's page (groups, discounts, refunds), debts, cash desk, timetable, teachers, exams, finance, reports, settings | Next, part by part (A-230 to A-232 are parts 1 to 3 of 6); they open on the site until then                              |
| The site running on the app's code                                                                                                                            | Part by part, the student side first; wide tables, Excel and print last                                                  |

## What kai needs to do

None of this blocks building; each item unlocks one step.

1. **Google Play Console** account, $25 once. A personal account must run a closed test with 12
   testers for 14 days before it may publish; an organisation account needs a D-U-N-S number.
2. **Apple Developer Program**, $99 a year. An individual account needs no D-U-N-S number. Without
   it no iPhone or iPad can install the app, not even kai's own for longer than a week. In that
   account the app needs two names, `center.kampus.app` and its screen-share extension
   `center.kampus.app.broadcast`, both with the app group `group.center.kampus.app` (Xcode
   creates them itself when it signs with the account).
3. **Xcode** on the Mac (free, from the App Store, about 12 GB): lets the Mac build the iPhone app
   and run it in the simulator.
4. Later, for push: a free **Firebase** project (Android) and a push key from the Apple account.

Claude never handles the passwords of these accounts. Signing keys are created by kai's accounts and
kept there (Play App Signing, App Store Connect).

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
