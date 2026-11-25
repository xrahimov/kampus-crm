# Kampus on Google Play

What is ready for putting the Android app (`center.kampus.app`) on Google Play, what kai does in
Play Console, and the answers for Google's forms. Written 25 November 2026 (A-267, A-268). The
iPhone side is in [APP-STORE.md](APP-STORE.md).

Claude never handles the passwords of kai's accounts and never sees the upload key or its password.

## Where things stand

| What Google asks                                                    | State                                                                                                                              |
| ------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| The app targets Android 16 (API 36), asked since 31 August 2026     | Ready: target 36, built with 37, runs from Android 7 (API 24)                                                                      |
| An Android App Bundle (`.aab`) signed with the app's own upload key | Ready to build: the **Google Play bundle** workflow. Waits for the key (step 3)                                                    |
| Native libraries work with 16 KB memory pages                       | Ready: all 62 libraries of the build pass; checked on every build from now on                                                      |
| A privacy policy on a public address                                | Written: `https://kampus.center/en/privacy` (also `/ru/`, `/uz/`). Goes live with the next server update                           |
| A way to delete one's account, in the app and on a public address   | Built: **Delete my account** in the app and on the site, `https://kampus.center/en/delete-account`. Goes live with the same update |
| Store page: name, texts, icon, banner, screenshots                  | Ready: `mobile/store/` and `~/Desktop/kampus-play/screenshots/` on the Mac                                                         |
| Data safety form, content rating, target audience, permissions      | Answers below; kai enters them                                                                                                     |
| A sign-in for Google's reviewers                                    | kai makes it (step 7)                                                                                                              |
| A Play Console developer account                                    | Open since 25 November 2026 (personal, "Kampus CRM"); Google is verifying kai's identity, and **Create app** is locked until then  |

The rules were read on Google's own pages on 25 November 2026:
[target API level](https://support.google.com/googleplay/android-developer/answer/11926878),
[testing before production](https://support.google.com/googleplay/android-developer/answer/14151465),
[account deletion](https://support.google.com/googleplay/android-developer/answer/13327111),
[16 KB pages](https://android-developers.googleblog.com/2025/05/prepare-play-apps-for-devices-with-16kb-page-size.html),
[foreground services](https://support.google.com/googleplay/android-developer/answer/13392821).

## kai's steps, in order

1. **Open a Play Console account** at <https://play.google.com/console>, $25 once. Google checks
   your identity, which can take a few days.
   - A **personal** account (made after 13 November 2023) must first run a **closed test with at
     least 12 testers who stay opted in for 14 days in a row**; only then can it ask for production.
     Twelve teachers and students of the demo centre and Kingston are enough.
   - An **organisation** account skips that test and needs a D-U-N-S number for a registered company.
2. **Say which e-mail address the public may write to.** Google shows it on the store page, and the
   privacy policy names it. It goes into `/opt/kampus/.env` as `LEGAL_CONTACT_EMAIL` with the server
   update (Claude adds it to the deploy line once kai names the address). Until then the two pages
   send people to their learning centre.
3. **Make the upload key**, once, on the Mac. In Terminal:

   ```bash
   cd ~/Desktop/Projects/kampus-crm && git pull && bash mobile/scripts/play-upload-key.sh
   ```

   It makes a random password, keeps it in the Mac's Keychain (item `kampus-upload-key`), makes
   `~/Desktop/Private/kampus-upload-key.jks`, and puts both into the repository's GitHub secrets
   (`ANDROID_UPLOAD_KEYSTORE`, `ANDROID_UPLOAD_PASSWORD`). Nothing secret is shown; the last line is
   `UPLOAD_KEY_DONE`. Keep the file and the Keychain item. If both are ever lost, Google can register
   a new upload key (Play Console → Setup → App signing), so the app is not lost with them.

4. **Say "deploy it"** for the server update, so the privacy policy and the delete-account page are
   on the live site before Google looks at them.
5. **Get the app file.** Tell Claude "build the Play bundle": Claude starts the **Google Play
   bundle** workflow on GitHub and answers with the link. On that page, under Artifacts, download
   `kampus-play-<number>`, a zip with `kampus-play-<number>.aab` in it.
6. **Create the app in Play Console**: Create app → name `Kampus` → default language English (United
   States) → App → Free. Then:
   - **Main store listing**: the texts in the next section; icon `mobile/store/icon-512.png`; feature
     graphic `mobile/store/feature.png`; phone screenshots from
     `~/Desktop/kampus-play/screenshots/phone/en`, 7-inch from `tablet7`, 10-inch from `tablet10`.
   - **Add translations** Russian (`ru-RU`) and Uzbek (`uz`): their texts, and the phone screenshots
     from `phone/ru` and `phone/uz`.
   - Category **Education**; website `https://kampus.center`; the e-mail from step 2.
   - Under **App content**, the answers in "Answers for Google's forms" below.
   - On the first upload accept **Play App Signing** (Google keeps the app's final key; ours is only
     the upload key).
7. **Make a sign-in for Google's reviewers** (App content → App access → "All or some functionality
   is restricted"). They cannot receive a Telegram code, so they need a phone number and a password
   that already work:
   - in the demo centre add a staff member with the Teacher role and a student in a demo group, on
     two phone numbers you can reach in Telegram once;
   - sign in once with each by Telegram code and choose a password when Kampus offers it;
   - give Google both numbers and passwords in the form, with the note: "Choose Staff or Student on
     the first screen. Enter the phone number and the password. No code is needed."
     Do not send those passwords to Claude.
8. **Internal testing** first (Testing → Internal testing → upload the `.aab`, add your own Google
   address as a tester): the app installs from Play on your own phone within minutes. This is also
   the first time the camera can be seen reading a badge on a real phone.
9. **Closed testing** (personal accounts): the 12 testers for 14 days. Then **Apply for production**,
   answer Google's questions about the test, and send the release for review.

## The store page's texts

The three languages are in [`mobile/store/listing.json`](../mobile/store/listing.json), checked
against Google's limits by a test (name 30 characters, short description 80, full description 4000).

| Language | Name                    | Short description                                                              |
| -------- | ----------------------- | ------------------------------------------------------------------------------ |
| English  | Kampus: learning centre | Lessons, homework, attendance and payments of your learning centre in one app. |
| Russian  | Kampus: учебный центр   | Уроки, домашние задания, посещаемость и оплата вашего учебного центра.         |
| Uzbek    | Kampus: o‘quv markazi   | O‘quv markazingiz darslari, uy vazifalari, davomati va to‘lovlari bir ilovada. |

The full descriptions say who can sign in (people of a centre that uses Kampus), list what students
and parents, teachers and the office get, and end with the privacy policy's address.

The pictures were taken on the Android emulators from the local server's seed data (made-up people):
six phone pictures in each language at 1080 × 1920, four at 1200 × 1920 for 7-inch tablets and four
at 2560 × 1600 for 10-inch tablets. Google refuses a picture whose long side is more than twice its
short side, which is why they are not the emulator's own 1080 × 2400.

## Answers for Google's forms

These are Claude's reading of what the app does; kai enters them and is the one who declares them.

**Privacy policy**: `https://kampus.center/en/privacy`

**Ads**: No, the app contains no ads.

**App access**: restricted; the two sign-ins from step 7.

**Content rating questionnaire**: category "All other app types". No violence, sexual content,
profanity, drugs, gambling. "Does the app let users communicate with each other?": Yes (a group's
chat and video lessons, between people of one learning centre). "Does it share the user's location?":
No. "Does it allow purchases of digital goods?": No.

**Target audience**: Claude's recommendation is **13 and over** (13 to 15, 16 to 17, 18 and over),
and "No" to "could the store listing appeal to children". Ticking an age under 13 puts the app under
Google's Families rules, with more to prove. Younger pupils are reached through a parent's sign-in.
This choice is kai's.

**News app**: No. **Health**: No. **Government**: No. **Financial features**: none of the listed ones.

**Data safety**

- Does the app collect or share any of the required user data types? **Yes**.
- Is all of the data encrypted in transit? **Yes**.
- Do you provide a way for users to request that their data is deleted? **Yes**:
  `https://kampus.center/en/delete-account`.
- Account creation: the app lets people open an account ("Other": a phone number confirmed with a
  code from Telegram, then a password). Delete account URL: the same address.
- Shared with third parties: **No** for every type. (Google does not count as sharing what goes to a
  company that only works on our behalf, such as hosting, the SMS sender or the payment page.)

| Data type                                  | Collected | Why                                   | Required? |
| ------------------------------------------ | --------- | ------------------------------------- | --------- |
| Personal info: Name                        | Yes       | App functionality, Account management | Required  |
| Personal info: Phone number                | Yes       | App functionality, Account management | Required  |
| Personal info: User IDs (Telegram ID)      | Yes       | Account management                    | Optional  |
| Personal info: Other (birth date, gender)  | Yes       | App functionality                     | Optional  |
| Financial info: Purchase history           | Yes       | App functionality                     | Optional  |
| Financial info: card or bank details       | No        | Payme and Click take them, not Kampus |           |
| Messages: Other in-app messages            | Yes       | App functionality                     | Optional  |
| Photos and videos: Photos                  | Yes       | App functionality                     | Optional  |
| Photos and videos: Videos                  | Yes       | App functionality (video lessons)     | Optional  |
| Audio: Voice or sound recordings           | Yes       | App functionality                     | Optional  |
| Files and docs                             | Yes       | App functionality                     | Optional  |
| App activity: Other user-generated content | Yes       | App functionality                     | Optional  |
| App activity: App interactions, search     | No        | No analytics in the app               |           |
| App info and performance (crash logs)      | No        | No crash or diagnostics kit           |           |
| Device or other IDs                        | No        | No advertising ID is read             |           |
| Location, Contacts, Calendar, Web history  | No        |                                       |           |
| Health and fitness                         | No        |                                       |           |

"Purchase history" is what a student paid the centre and what they owe. "Other user-generated
content" is homework answers, test and poll answers, and ratings of lessons.

**Foreground service** (App content → Foreground service permissions). The app declares one type,
media projection:

- Use case: "Media or Content Projection and streaming or recording with MediaProjection API".
- Description: "In a live video lesson a teacher or a student presses Share screen to show their
  device's screen to the other people in the lesson. Android asks for consent each time. The service
  runs only while the screen is shared and shows a notification the whole time; it stops when the
  person presses Stop sharing or leaves the lesson."
- If the system interrupts it: "The other people in the lesson stop seeing the shared screen in the
  middle of the explanation; the lesson itself goes on."
- Video link: `~/Desktop/kampus-play/screen-share-demo.mp4` on the Mac shows the steps. Google wants
  a link, so put the file on Google Drive (anyone with the link can view) or YouTube as unlisted.

**Camera and microphone** need no form: Android asks the person when a lesson, a homework photo or
the badge reader first needs them, and the privacy policy says why.

**Payments.** The app's Pay page opens Payme or Click for a centre's tuition. That is money paid to
the learning centre for teaching, a real-world service, which Google does not put under its own
billing. If a reviewer asks, that is the answer.

## Read before publishing

- **The privacy policy is Claude's draft.** It says what the code does. kai should read it, and a
  lawyer should if the app is offered widely.
- **Where the data is kept.** The policy says Kampus rents a server from a hosting company and does
  not name the country. Uzbekistan's law on personal data has rules about where the data of its
  citizens is stored. Whether a rented server abroad meets them is a question for a lawyer, not one
  Claude can answer.
- **Children.** See "Target audience" above.

## Each later version

1. Raise `version` in `mobile/app.config.ts` when the change is one people should notice (1.0.0 →
   1.0.1). The build number rises by itself with every run of the workflow.
2. Tell Claude "build the Play bundle"; download the `.aab`; in Play Console create a release on the
   track you want and upload it.

Uploading by itself (no download and upload by hand) needs a Google Cloud service account that kai
creates in Play Console; it can be added later.

## How it is built

- `mobile/plugins/with-release-signing.js` adds the upload key to the generated Android project. The
  key is used when the build is given `KAMPUS_UPLOAD_STORE_FILE` and `KAMPUS_UPLOAD_STORE_PASSWORD`;
  without them the release is signed with the template's test key as before, which is what the
  everyday test file (`kampus-android`) still is.
- `.github/workflows/mobile-play.yml`, **Google Play bundle**: started by hand it takes the key from
  the secrets, builds `bundleRelease` for every kind of processor, and keeps the `.aab` for 30 days.
  On a pull request that touches the build it runs the same steps with a key made up for the run.
- `mobile/scripts/check-play-bundle.sh` fails the build when the bundle is not signed with the key it
  was given, and `mobile/scripts/check-page-size.sh` when a 64-bit library is not aligned to 16 KB.
  The page-size check also runs on the everyday test file.
- The store's app talks to `https://kampus.center` and refuses plain http; the workflow checks that.
- `mobile/store/make-graphics.cjs` draws the icon and the banner from the app's icon and the sign-in
  page's tile wall: `node mobile/store/make-graphics.cjs` from the repository root.
