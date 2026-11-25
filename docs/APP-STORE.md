# Kampus on the App Store

What is ready for putting the iPhone and iPad app (`center.kampus.app`) on the App Store, what kai
does in App Store Connect, and the answers for Apple's forms. Written 26 November 2026 (A-269 to
A-272). The Android side is in [PLAY-STORE.md](PLAY-STORE.md).

Claude never handles the passwords of kai's accounts. Signing is Xcode's: the keys stay in the
Mac's keychain and with Apple, none is in the repository.

## Where things stand

| What Apple asks                                     | State                                                                                                                                      |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Apple Developer Program                             | kai's, individual, since 25 November 2026, renews 26 November 2027                                                                         |
| The app's names and app group                       | Registered: `center.kampus.app`, `center.kampus.app.broadcast`, `group.center.kampus.app`                                                  |
| A record in App Store Connect                       | Made. Store name **Kampus: learning centre** ("Kampus" alone was taken); under the icon the app is called Kampus                           |
| A signed build                                      | **1.0.0 (1)** uploaded from the Mac on 25 November 2026, in TestFlight; kai is its only tester, an outside group waits for its first build |
| Name, subtitle, description, keywords, category     | Entered as drafts in English (U.S.) and Russian. Apple has no Uzbek store page                                                             |
| Privacy policy and account deletion links           | Entered. The pages are live since the server update of 25 November 2026                                                                    |
| Screenshots (iPhone 6.9-inch, iPad 13-inch)         | Made on the Mac (A-271), English and Russian, final; not yet in App Store Connect                                                          |
| App Privacy answers, age rating, content rights     | Answers below; not entered                                                                                                                 |
| Price and countries                                 | Not set. Free; the countries are kai's choice                                                                                              |
| A sign-in and contact details for Apple's reviewers | Contact saved in TestFlight; the sign-in is made on the site (A-272) and typed by kai                                                      |
| Copyright line, trader status for the EU            | kai's                                                                                                                                      |
| Sent for review                                     | No. Nothing is sent before kai says so                                                                                                     |

## kai's steps, in order

1. **"deploy it"**: done on 25 November 2026. The privacy and delete-account pages are on the live
   site; Apple opens both links during review, and the store build talks to the live site.
2. **Try the app on a phone.** kai is in the internal test group "Owner" since 25 November 2026:
   Apple's e-mail to the Apple ID's address has the button and the code for the TestFlight app.
   Teachers and students come in as **outside testers** (see below), not through this group.
3. **Read the answers below** and say "fill the forms"; Claude enters them in App Store Connect as
   drafts. They are declarations in kai's name, so they are not entered before that.
4. **Give the reviewers a way in.** Apple's reviewers cannot get a Telegram code, so they need a
   phone number and password that work by themselves. On the live site open Settings →
   Organisations, **Sign-ins for app store reviewers** (A-272, after the server update that brings
   it): add one for a demo teacher and one for a demo student of the demo centre, each with a
   password kai chooses. Never kai's own sign-in: it is the site owner's and opens every centre.
   The same phone and password go under **App Review Information** on the version's page, and
   for outside testers under TestFlight → Test Information → **Sign-in required**. kai types them;
   the passwords are not sent to Claude. kai's contact details are already saved in TestFlight.
5. **Copyright**: the line Apple prints on the page, for example the year and the owner's name.
6. **Countries.** Apple offers every country by default. For a start Uzbekistan and its neighbours
   are enough. Selling in the European Union needs kai's **trader status** (an address and phone
   that Apple shows to the public); leaving the EU out avoids that. China mainland asks for filings
   Kampus does not have: leave it out.
7. **Say "send it for review"** when the pictures are in and the forms are filled.

## Testers

- **Inside testers** (up to 100) must be users of kai's developer account in App Store Connect, each
  with a role. Right for kai and a co-developer, wrong for teachers and students. Claude does not
  give another address access to the account; kai presses **Invite** under Users and Access.
- **Outside testers** (up to 10,000) get no access to the account: a public link or an invitation
  by e-mail, and the app installs through TestFlight. Apple looks at a build once before outside
  testers get it, and asks for a text on what to test, kai's contact details and a sign-in with a
  password. On "set up outside testers" Claude makes the group and drafts the text; kai types the
  contact details and the sign-in and sends it in.
- A TestFlight build stops working 90 days after its upload.
- State on 26 November 2026: the outside group **Teachers and students** exists with no testers and
  no build. TestFlight → Test Information has the description testers see, the site and privacy
  links, kai's contact details and feedback address, and the notes for the reviewer. Left for kai:
  the reviewer's sign-in there, then **Add Builds** (build 1) in the group with this text under
  "What to test", and **Submit for Review**:

  > Sign in with the phone number your learning centre has for you. Teachers: open today's lessons,
  > mark attendance, check homework and start a video lesson. Students: look at your lessons and
  > homework, join a lesson and open your payments. Tell us about anything that looks wrong.

  After Apple's answer the group's public link can be switched on and sent in Telegram.

## The pictures

On kai's Mac in `~/Desktop/kampus-appstore/screenshots/` (A-271): `iphone-6.9/en` and `ru`, six
pictures each at 1320 by 2868 (Today, grading sheet, a student, Finance, Leads, a group), and
`ipad-13/en` and `ru`, four each at 2048 by 2732 (Today, a group, Students, Finance). App Store
Connect takes them by drag and drop on the version's page, per language and per device size.

They are taken on the simulators "iPhone 18 Pro Max" and "iPad Air 13-inch (M4)" from a Release
build against the local server with the seed data, the clock set to 9:41 with
`xcrun simctl status_bar`, the language switched in the app (for the Russian tablet set the
simulator itself was in Russian, so the date in its status bar is too). A simulator's picture carries an
alpha channel, which Apple refuses: each file is flattened (checked with `sips`, `hasAlpha: no`).

## The store page's texts

Apple's own fields are in [`mobile/store/app-store.json`](../mobile/store/app-store.json): name,
subtitle, promotional text and keywords, in English and Russian. The long description is the one in
[`listing.json`](../mobile/store/listing.json), the same as on Google Play. A test holds all of them
to Apple's lengths (name and subtitle 30, keywords 100, promotional text 170, description 4000) and
keeps the name equal to Google Play's title. Change a text there first, then in App Store Connect.

- Category: **Education**, second **Business**.
- Support and marketing address: `https://kampus.center`. Apple expects the support page to say how
  to reach someone, so the public contact address (A-267, still open) matters here too.

## Answers for Apple's forms

These are Claude's reading of what the app does; kai is the one who declares them.

**App Privacy.** "Do you or your third-party partners collect data from this app?": **Yes**. No data
is used to track people, and none goes to advertisers or data brokers. Every type below is collected
for **App Functionality** only and is **linked to the person's identity**.

| Apple's data type                | What it is in Kampus                                    |
| -------------------------------- | ------------------------------------------------------- |
| Contact Info: Name               | The name the centre holds for the person                |
| Contact Info: Phone Number       | The sign-in                                             |
| Identifiers: User ID             | The Telegram ID, when the person connects Telegram      |
| Purchases: Purchase History      | What a student paid the centre and what they owe        |
| User Content: Emails or Messages | A group's chat                                          |
| User Content: Photos or Videos   | Homework photos, profile pictures, lesson recordings    |
| User Content: Audio Data         | Voice answers to homework                               |
| User Content: Other User Content | Homework answers, files, test and poll answers, ratings |
| Other Data                       | Birth date and gender, when the centre fills them in    |

Not collected: payment card details (Payme and Click take them on their own pages), location,
contacts, browsing or search history, usage data, diagnostics, health, advertising data.

**Age rating.** Every content question (violence, sexual content, profanity, drugs, gambling,
horror, medical information, contests): **None**. Capabilities: **messaging and chat: yes**,
**user-generated content: yes** (both only between the people of one learning centre),
advertising: no, unrestricted web access: no. Apple works out the rating from these.

**Content rights.** "Does your app contain, show, or access third-party content?": **No**. What
people see is their own centre's material.

**Export compliance.** Already answered in the build: it uses only the encryption every app gets
from the system (https and the video call's own), `ITSAppUsesNonExemptEncryption` is `false`.

**Price.** Free, no in-app purchases.

**Notes for the reviewer** (App Review Information, Notes), a draft:

> Kampus is used by learning centres and their students. An account is made by the learning centre,
> so the app has no sign-up; please use the two sign-ins given here. Sign in as the teacher and open
> one of today's lessons to see the video lesson with camera, whiteboard and screen sharing. A
> student deletes their account with "Delete my account" at the bottom of their home page; a staff
> member asks for it on their account page. Payments in the app are tuition a student pays to their
> learning centre for classes, through the local providers Payme and Click.

## Read before publishing

- **Payments and Apple's rules.** The student's Pay page opens Payme or Click for a centre's
  tuition. Apple lets apps take payment outside its own purchase system for goods and services used
  outside the app, which classes in a classroom are. For teaching that happens online to a group,
  Apple's guideline 3.1.3 asks for its own in-app purchase. Kampus's centres teach in rooms and
  online. A reviewer may ask about it; if Apple refuses the build over this, the way out is to hide
  the Pay button in the iPhone app and leave paying to the site. Not built, because it may not be
  needed.
- **No sign-up in the app.** Apple accepts that for apps of organisations, when the review notes
  say so and a working sign-in is given.
- **The privacy policy, where the data is kept, and children**: the same three points as in
  [PLAY-STORE.md](PLAY-STORE.md#read-before-publishing).

## Each later version

Each upload needs a higher build number than the last (`APP_BUILD`), and a new store version (1.0.1,
1.1.0) once 1.0.0 has been released. The build is made on kai's Mac, by Claude through the Mac
session, on kai's word; kai has nothing to type unless macOS asks for the Mac's password.

## How it is built

On the Mac, in the worktree, from the commit to release:

1. `cd mobile`, then `APP_BUILD=<number> npx expo prebuild --platform ios --clean` with **no**
   `EXPO_PUBLIC_API_URL` (the store build talks to `https://kampus.center`), pods, and
   `node scripts/check-ios-project.mjs`.
2. `xcodebuild -workspace ios/Kampus.xcworkspace -scheme Kampus -configuration Release -destination
'generic/platform=iOS' -archivePath <path> -allowProvisioningUpdates archive`.
3. `xcodebuild -exportArchive` with an options file: method `app-store-connect`, team
   `3Z948P849A`, automatic signing, first with destination `export` to look at the result, then
   `upload`.

**A new team's first archive fails** with "Your team has no devices from which to generate a
provisioning profile": an archive signs with a development profile first, and Apple makes none for
a team without a device. Adding `-allowProvisioningDeviceRegistration` to the archive does not
help, because an archive is for "any iOS device". What registers a phone is one ordinary build with
that phone as the destination (cable, unlocked, trusted, **Developer Mode** on, both
`-allowProvisioning…` switches); it can be stopped as soon as the profiles exist. kai's team has
its device since 25 November 2026, so this does not come back unless the team changes.

What exists in the Apple account for signing: one device (kai's iPhone), an "Apple Development"
certificate whose key is in the Mac's keychain, an "Apple Distribution" certificate that Apple
keeps, and two team and two store profiles made by Xcode. Four prebuilt frameworks ship without
debug symbols (React, Hermes and two more), which Apple reports as warnings on upload.
