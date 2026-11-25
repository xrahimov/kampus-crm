# Kampus on the App Store

What is ready for putting the iPhone and iPad app (`center.kampus.app`) on the App Store, what kai
does in App Store Connect, and the answers for Apple's forms. Written 26 November 2026 (A-269,
A-270). The Android side is in [PLAY-STORE.md](PLAY-STORE.md).

Claude never handles the passwords of kai's accounts. Signing is Xcode's: the keys stay in the
Mac's keychain and with Apple, none is in the repository.

## Where things stand

| What Apple asks                                     | State                                                                                                            |
| --------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Apple Developer Program                             | kai's, individual, since 25 November 2026, renews 26 November 2027                                               |
| The app's names and app group                       | Registered: `center.kampus.app`, `center.kampus.app.broadcast`, `group.center.kampus.app`                        |
| A record in App Store Connect                       | Made. Store name **Kampus: learning centre** ("Kampus" alone was taken); under the icon the app is called Kampus |
| A signed build                                      | **1.0.0 (1)** uploaded from the Mac on 25 November 2026, in TestFlight                                           |
| Name, subtitle, description, keywords, category     | Entered as drafts in English (U.S.) and Russian. Apple has no Uzbek store page                                   |
| Privacy policy and account deletion links           | Entered. The pages are live only after the server update with #168                                               |
| Screenshots (iPhone 6.9-inch, iPad 13-inch)         | Not made yet                                                                                                     |
| App Privacy answers, age rating, content rights     | Answers below; not entered                                                                                       |
| Price and countries                                 | Not set. Free; the countries are kai's choice                                                                    |
| A sign-in and contact details for Apple's reviewers | kai's                                                                                                            |
| Copyright line, trader status for the EU            | kai's                                                                                                            |
| Sent for review                                     | No. Nothing is sent before kai says so                                                                           |

## kai's steps, in order

1. **Say "deploy it"** so the privacy and delete-account pages exist on the live site. Apple opens
   both links during review, and the store build talks to the live site.
2. **Try the app on a phone.** Say "add me to testflight": Claude makes an internal test group with
   only kai in it, and the app installs through Apple's TestFlight app.
3. **Read the answers below** and say "fill the forms"; Claude enters them in App Store Connect as
   drafts. They are declarations in kai's name, so they are not entered before that.
4. **Give the reviewers a way in.** Under **App Review Information**: a sign-in that works with a
   password (the reviewers cannot get a Telegram code), best one staff member and one student of the
   demo centre, and kai's own name, phone and e-mail as the contact. kai types these; the passwords
   are not sent to Claude.
5. **Copyright**: the line Apple prints on the page, for example the year and the owner's name.
6. **Countries.** Apple offers every country by default. For a start Uzbekistan and its neighbours
   are enough. Selling in the European Union needs kai's **trader status** (an address and phone
   that Apple shows to the public); leaving the EU out avoids that. China mainland asks for filings
   Kampus does not have: leave it out.
7. **Say "send it for review"** when the pictures are in and the forms are filled.

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
