# The Kampus app for phones and tablets

One React Native project in [`mobile/`](../mobile) that builds for Android, iOS and the web. It talks
to the same server as the site (`/api/v1`), speaks the same three languages from the same message
files, and wears the same look. Decisions are recorded in [ASSUMPTIONS.md](ASSUMPTIONS.md) as A-203
(sign-in), A-204 (opening the site from the app), A-205 (the app itself), A-207 (the lesson room
inside the app), A-208 (screen sharing from Android and lessons behind other apps), A-209 (the
whiteboard), A-210 (shown files), A-211 (the teacher's polls and breakout rooms), A-212 (homework
answered in the app, files opened in the app) and A-213 (a group's tests, materials, chat and
exercises in the app).

Why React Native and not the site in a wrapper: kai's choice on 2026-11-23 ("rewrite it in react
native"), with two requirements said the same day: one code base in the end, and teachers must be
able to work from an iPad or a phone.

## Where it stands

| Part                                                                                                 | State                                                                     |
| ---------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Sign-in: phone and password, a code from Telegram, the waiting list, choosing a password             | Built                                                                     |
| Teacher: today, a lesson (attendance, grades, topic, homework, lesson room), groups, checking        | Built, phone and tablet                                                   |
| Student and parent: home, a group's page (lessons, marks, grades, payments), password                | Built, phone and tablet                                                   |
| Pages the app does not have                                                                          | Open on the site in the phone's browser, already signed in (A-204)        |
| Android app file                                                                                     | Built by GitHub on every change; starts on an emulated phone              |
| iPhone and iPad build                                                                                | A manual GitHub job (simulator only); a real device needs Apple's account |
| Google Play and App Store                                                                            | Not published: needs kai's accounts (below)                               |
| Push notifications                                                                                   | Next                                                                      |
| The lesson room inside the app: camera, microphone, chat, hands, reactions, the teacher's tools      | Built, phone and tablet (A-207)                                           |
| In the lesson room: whiteboard; files shown to everyone (PDF pages, pictures, video, audio, YouTube) | Built, phone and tablet (A-209, A-210)                                    |
| In the lesson room: sharing the screen; a lesson that keeps running behind other apps                | Built for Android (A-208); iPhone and iPad sharing is next                |
| In the lesson room: the teacher's polls and breakout rooms                                           | Built, phone and tablet (A-211)                                           |
| In the lesson room: showing a file straight from the phone, saving the whiteboard                    | Next                                                                      |
| Student and parent: homework answered in the app (text, photo, file, voice); files open in the app   | Built, phone and tablet (A-212)                                           |
| Student and parent: tests, materials with lesson recordings, the group chat, exercises               | Built, phone and tablet (A-213)                                           |
| Student and parent: the course, news, the stream, the schedule with booking, paying online           | Next (today they open the personal page in the browser)                   |
| The office's pages: students, payments, leads, reports                                               | Later; on the site until then                                             |
| The site running on the app's code                                                                   | Part by part, the student side first; wide tables, Excel and print last   |

## What kai needs to do

None of this blocks building; each item unlocks one step.

1. **Google Play Console** account, $25 once. A personal account must run a closed test with 12
   testers for 14 days before it may publish; an organisation account needs a D-U-N-S number.
2. **Apple Developer Program**, $99 a year. An individual account needs no D-U-N-S number. Without
   it no iPhone or iPad can install the app, not even kai's own for longer than a week.
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
  `callAudio.start()` starts it when someone joins and `callAudio.stop()` ends it. Nothing here
  exists on iOS, where a call keeps running by itself and screen sharing needs a broadcast
  extension that is not built yet.
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
  `apiForm` in `src/lib/api.ts` sends a form with a file.
- **A group's pages for students (A-213).** `src/api/portal.ts` holds the calls (the personal
  link's token is the key, no session). `tests-screen.tsx` is the list, the run and the result;
  `materials-screen.tsx` lists files, links and recordings and hands a recording to the file page
  with its streaming copy and the place to continue from; `chat-screen.tsx` is the thread;
  `exercise-screen.tsx` does one exercise; `answer-parts.tsx` holds the answer rows and word chips
  that tests and exercises share.
- **A plain-http test build.** With `EXPO_PUBLIC_API_URL` starting with `http://` the Android build
  allows plain http (for a server on the desk); every other build refuses it.
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
