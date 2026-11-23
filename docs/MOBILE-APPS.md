# The Kampus app for phones and tablets

One React Native project in [`mobile/`](../mobile) that builds for Android, iOS and the web. It talks
to the same server as the site (`/api/v1`), speaks the same three languages from the same message
files, and wears the same look. Decisions are recorded in [ASSUMPTIONS.md](ASSUMPTIONS.md) as A-203
(sign-in), A-204 (opening the site from the app), A-205 (the app itself) and A-207 (the lesson room
inside the app).

Why React Native and not the site in a wrapper: kai's choice on 2026-11-23 ("rewrite it in react
native"), with two requirements said the same day: one code base in the end, and teachers must be
able to work from an iPad or a phone.

## Where it stands

| Part                                                                                                    | State                                                                     |
| ------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| Sign-in: phone and password, a code from Telegram, the waiting list, choosing a password                | Built                                                                     |
| Teacher: today, a lesson (attendance, grades, topic, homework, lesson room), groups, checking           | Built, phone and tablet                                                   |
| Student and parent: home, a group's page (lessons, marks, grades, payments), password                   | Built, phone and tablet                                                   |
| Pages the app does not have                                                                             | Open on the site in the phone's browser, already signed in (A-204)        |
| Android app file                                                                                        | Built by GitHub on every change; starts on an emulated phone              |
| iPhone and iPad build                                                                                   | A manual GitHub job (simulator only); a real device needs Apple's account |
| Google Play and App Store                                                                               | Not published: needs kai's accounts (below)                               |
| Push notifications                                                                                      | Next                                                                      |
| The lesson room inside the app: camera, microphone, chat, hands, reactions, the teacher's tools         | Built, phone and tablet (A-207)                                           |
| In the lesson room: screen sharing from Android and iOS, whiteboard, shown files, polls, breakout rooms | Next (a teacher who needs them teaches from a computer)                   |
| Answering homework, tests and chat inside the app                                                       | Next (today they open the personal page in the browser)                   |
| The office's pages: students, payments, leads, reports                                                  | Later; on the site until then                                             |
| The site running on the app's code                                                                      | Part by part, the student side first; wide tables, Excel and print last   |

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
  scripts/               serve-web.mjs (the web build beside a local server), android-smoke.sh (CI)
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
