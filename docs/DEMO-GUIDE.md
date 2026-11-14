# Kampus demo guide

A script for showing all of Kampus to a learning-centre owner in about 45 minutes, or the teaching
part to teachers in 15. Each stop says what to open, what to show and what to say.

The pictures are the in-app help's own screenshots (`public/help/en/`), taken from the demo seed by
`npm run help:screenshots`, so they are renewed together with the manual. Last taken: 2026-11-12.

## Before you start

Show only the demo centre, **Kampus Demo Learning Center**. A server may host centres with real
students; never open one of those in front of anyone.

1. Open the site and press **Log in with Telegram**. Come in as the demo CEO, who sees everything.
2. Open the group **GE-Morning A1** in a second tab. It is the group for the teaching and video part.
3. On your phone open Demo Student One's personal link (group page → **Students' links** → copy).
   The phone is the student for the whole demo.
4. On the home page press **Show numbers**, so the cards are not asterisks when you start.
5. Pick the language the room reads best with the language button at the top: Uzbek, Russian or
   English. Everything, the help included, follows it.

Three things to check before you promise them on screen:

- **Pay online** shows on a student's page only after Payme or Click merchant details are entered
  (Settings → Integrations). Without them, describe it and show the picture in stop 8.
- Automatic coins are a switch (Settings → Coin settings). When it is off, only coins given by hand
  appear.
- A video lesson needs the camera and microphone allowed in the browser on both devices. Start one
  test call before people arrive.

## The route

The whole route takes about 45 minutes. For teachers do stops 1, 5, 6 and 7 only, about 15 minutes.
If time is short for an owner, never cut stops 6 and 8: the video lesson and the money are what
people remember.

| Stop | What it shows                                 | Minutes | For              |
| ---- | --------------------------------------------- | ------- | ---------------- |
| 1    | Signing in and the first look                 | 2       | Everyone         |
| 2    | Home page                                     | 3       | Owners           |
| 3    | From a lead to a student                      | 4       | Owners, admins   |
| 4    | Groups, timetable, lesson packages            | 4       | Owners, admins   |
| 5    | A teacher's day                               | 4       | Everyone         |
| 6    | The video lesson                              | 7       | Everyone         |
| 7    | The student's and parents' side               | 4       | Everyone         |
| 8    | Money                                         | 6       | Owners, cashiers |
| 9    | Exams, tests and coins                        | 3       | Owners, teachers |
| 10   | Reports, announcements, absences              | 2       | Owners           |
| 11   | Staff, roles, settings, logs                  | 2       | Owners           |
| 12   | Integrations and the AI assistant             | 3       | Owners           |
| 13   | Several centres, moving from an old CRM, help | 2       | Owners           |

## 1. Signing in and the first look

**Open:** the sign-in page, then the home page.

**Show:**

- One button, **Log in with Telegram**. Telegram confirms the phone number, and Kampus opens the
  account of the staff member with that number.
- The layout: the menu on the left, search at the top, the saffron **Payment** button that is on
  every page.
- Type `Demo` in the search box. Students, leads and groups come up in one list.
- The language button and the bell with notifications.

**Say:** "Nobody has a password to forget or to share. A teacher who leaves is switched off in one
place. It works in a browser on a computer, a tablet or a phone, with nothing to install."

![The sign-in page](../public/help/en/login.jpg)
![The home page and the menu](../public/help/en/dashboard.jpg)
![Search](../public/help/en/search.jpg)

## 2. Home page

**Open:** Home.

**Show:**

- **Set up your centre**: the checklist a new centre follows, from branches and courses to the
  Telegram bot and online payments.
- The twelve numbers: active leads, groups, remaining debt, debtors, payments due soon, active
  students, trial lessons, students who left this month, upcoming exams. They stay hidden until
  **Show numbers**, so nobody reads them over a shoulder.
- The room schedule for the day, and the revenue forecast below it.
- The branch picker at the top: one branch or all of them.

**Say:** "This is the owner's morning. Who owes, who left, which rooms are free, in one screen."

![The twelve numbers](../public/help/en/dashboard-numbers.jpg)
![Room schedule](../public/help/en/dashboard-schedule.jpg)

## 3. From a lead to a student

**Open:** Leads.

**Show:**

- The board with columns. Drag Demo Lead One from New leads to Contacted.
- **Add lead**: name, phone, source, the days and time they want, who owns the lead and when to
  call next.
- **Calls today**: the list of people to phone today, overdue ones first.
- A lead's menu → **Book a trial lesson**, then tick a lead and press **Add leads to group**. The
  lead is now a student.
- **Waiting list** for people who want a group that does not exist yet, and **Sources**, which
  counts leads per source.
- The web form: a public page for your website or Instagram bio. Whoever fills it in lands on the
  board. People who write to the centre's Telegram bot land in **Inbox** the same way.

**Say:** "No lead is lost in a notebook. You see where each one came from and who must call them
today."

![The lead board](../public/help/en/leads.jpg)
![Booking a trial lesson](../public/help/en/trial-form.jpg)
![The public web form](../public/help/en/web-form.jpg)

## 4. Groups, timetable and lesson packages

**Open:** Groups, then GE-Morning A1, then Timetable.

**Show:**

- The groups list with course, teacher, days and time. **New group** asks for the course, the days,
  the room and the teacher with their share.
- The group page: the facts on the left, the students under them, and the tabs on the right.
  Attendance, grades, gradebook, homework, stream, chat, materials, syllabus, tests, exams,
  discounts, coins, history.
- **Timetable**: every room across the week. Kampus warns when a new group clashes with a room or a
  teacher.
- **Billing** in the group form: _Monthly_, or _Lesson packages_ for 1:1 and speaking clubs. On the
  **Packages** tab you sell 8 or 12 lessons at a price; each lesson attended uses one, and the list
  shows how many are left.

**Say:** "A monthly group and a pay-per-lesson student live in the same system. The student gets a
Telegram message when one lesson is left."

![The group page](../public/help/en/group-detail.jpg)
![Timetable](../public/help/en/timetable.jpg)
![Lesson packages](../public/help/en/group-packages.jpg)

## 5. A teacher's day

**Open:** Today, then the group page, then Checking.

**Show:**

- **Today**: the teacher's lessons in order of time, on a phone as well. One tap marks everyone
  present, and **Scan badges** marks a student by the QR code on their printed badge.
- The **Attendance** grid for the month and the **Grades** tab next to it.
- **Homework**: set it for a lesson, with a file, a link or a speaking task the student records.
  Students answer from their page.
- **Checking** in the menu: every answer waiting, oldest first. Accept or return with a comment.
- **Stream** for posts to the whole group, **Chat** for questions, **Materials** for files and
  recordings. Chat and posts also reach students in Telegram.

**Say:** "A teacher needs three pages: Today, the group and Checking. They see only their own
groups, and their salary if you allow it."

![Today](../public/help/en/today.jpg)
![Attendance](../public/help/en/attendance.jpg)
![Homework on the group page](../public/help/en/homework.jpg)
![The checking queue](../public/help/en/checking.jpg)

## 6. The video lesson

**Open:** GE-Morning A1 on the computer, and Demo Student One's link on your phone. Hold the phone
up so people see both sides.

1. On the group page press **Start video lesson**, check the camera preview and press **Join
   lesson**.
2. On the phone the student's page lets them in by itself: press **Join lesson**. No app, no
   account, no meeting code.
3. On the phone raise a hand and send a reaction. On the computer open **Chat** and write a line.
   The hand shows as a number on the student's picture.
4. Press **Show a file to everyone** and pick a PDF from the **Lesson** panel. The page appears on
   the phone. Turn the page, switch the pen on and underline something: the phone follows.
5. Open the **Whiteboard**, draw, press **Let students draw**, then **Save to materials**.
6. Open **Poll**, ask "Ready for the test?" with two answers, and answer on the phone. The count
   changes on the computer.
7. Point at the rest of the bar: share screen (with the tab's sound in Chrome), record, mute
   everyone, focus mode, and **Rooms** for group work in 2 to 6 small rooms.
8. Press **End for everyone**. Back on the group page open **Last video lesson** → **Attendance
   from the call**: Kampus proposes who was present from who was online.

**Say:** "This is not a link to Zoom. The lesson, the file, the homework, the attendance and the
recording stay inside the group. It works on a phone and a tablet. On an iPad that cannot share its
screen, Show a file, the whiteboard and the back camera do the same job. Recordings are kept under
Materials for 90 days, and students rate the lesson afterwards."

![The video lesson card on the group page](../public/help/en/video-card.jpg)
![The room: chat and a raised hand](../public/help/en/video-room.jpg)
![Show a file to everyone, with the pen](../public/help/en/video-show-file.jpg)
![The same page on the student's phone](../public/help/en/portal-video-phone.jpg)
![Whiteboard](../public/help/en/video-whiteboard.jpg)
![Poll](../public/help/en/video-poll.jpg)

## 7. The student's and the parents' side

**Open:** Demo Student One's page on the phone, or in a private window on the computer.

**Show:**

- How a student gets in: a personal link the teacher sends, or **Log in with Telegram** on the
  student sign-in page. The phone number the centre already has is the account.
- The top of the page: the next lesson with **Join lesson**, attendance, average grade, coins and
  badges.
- The tabs: **Lessons** with marks and the teacher's note, **Homework** with the answer and the
  teacher's reply, **Chat**, **Materials** with recordings, **Stream**, **Tests**, **Payments** with
  the balance, **Results** with the grade so far, **Schedule**.
- **Connect Telegram**: reminders before each lesson, homework, payments, and a report to parents
  every Sunday evening. A parent connects their own phone as well.
- The family page: one link for parents with every child, their groups and what is owed.
- **Add to home screen**: the page installs on the phone as an app called My Kampus.

**Say:** "Parents stop phoning the office to ask about attendance and debts. They see it, and
Telegram tells them before they ask."

![Students sign in with Telegram](../public/help/en/student-login.jpg)
![The student's page](../public/help/en/portal.jpg)
![Homework on the student's page](../public/help/en/portal-homework.jpg)
![Results](../public/help/en/portal-results.jpg)
![The parents' page](../public/help/en/family-page.jpg)

## 8. Money

**Open:** a student's profile, then Debtors, Cash desk and Finance.

**Show:**

- The saffron **Payment** button: pick the student, the group, the month and the method. The
  balance updates and a receipt with a QR code is ready to print.
- Monthly fees are charged by themselves. Discounts, instalments in two or three parts, sibling
  discounts and refunds are on the student's profile.
- **Debtors**: who owes, how much and for how long, with the call, the promise to pay and automatic
  reminders by Telegram and SMS.
- **Cash desk**: the cashier closes the day, and expected cash is compared with counted cash.
- **Finance**: income, expenses, profit, the monthly plan, and **Payroll** worked out from each
  teacher's share. A teacher sees their own salary on **My salary**.
- **Pay online**: with Payme or Click connected, a student pays by card from their page and the
  payment appears in Kampus by itself.

**Say:** "Every sum has a name, a date and a cashier, and the action log shows who changed what. At
the end of the month payroll is already counted."

![Recording a payment](../public/help/en/payment-dialog.jpg)
![The receipt](../public/help/en/receipt.jpg)
![Debtors](../public/help/en/debtors.jpg)
![Cash desk](../public/help/en/cashdesk.jpg)
![Finance](../public/help/en/finance.jpg)
![Payroll](../public/help/en/payroll.jpg)

## 9. Exams, tests and coins

**Open:** Exams, then Settings → Test settings, then Reports → Coins.

**Show:**

- **Exams**: a group exam or a mock exam with a date, a room and an examiner. Enter the scores and
  Kampus gives the level and passed or failed.
- **Tests**: a question bank by subject and topic, tests built from it and given to groups. The
  group's **Knowledge analysis** tab shows which topics to repeat.
- **Coins**: rules that give coins for attendance, homework, test results and birthdays, plus coins
  a teacher gives by hand. Students collect badges too.
- **Reports → Coins**: the ranking for the week or month, and the marketplace where students spend
  coins on prizes.

**Say:** "Children come for the coins and the ranking. Parents see the result of every exam on the
same page as the payments."

![Exam results](../public/help/en/exam-results.jpg)
![Tests](../public/help/en/tests.jpg)
![Coins ranking](../public/help/en/coins-report.jpg)

## 10. Reports, announcements and absences

**Open:** Reports, then Announcements, then Absences.

**Show:**

- **Reports**: payments by teacher and by staff, student payments, left students with the reasons,
  graduates, leads, the referral programme, staff attendance and centre statistics. Each one exports
  to Excel.
- **Left students**: the churn rate, lost revenue per month and why people leave.
- **Announcements**: one notice to a group, a branch or the whole centre. It shows on every
  student's page and in Telegram, with a count of who has read it.
- **Absences**: students who miss lessons in a row land on a call list, so someone phones before
  they quit.

**Say:** "You learn that a student is slipping away after the missed lessons, not after a missed
payment."

![Reports](../public/help/en/reports.jpg)
![Left students](../public/help/en/report-churn.jpg)
![Announcements](../public/help/en/announcements.jpg)

## 11. Staff, roles, settings and logs

**Open:** Teachers, then Settings.

**Show:**

- **Teachers** and **Settings → Staff**: each person with their role, branches and salary method,
  which is a fixed sum, a percent, per lesson or per student.
- **Roles**: CEO, branch manager, admin, cashier, teacher and more, each a list of permissions you
  can change. You can add your own role.
- **General settings**: working hours, debt reminder days, the absence rules and switches such as
  "Teachers can add students" and "Staff sign in with Telegram only".
- Courses, rooms, days off, SMS templates and the receipt layout.
- **Logs**: every change with who made it and when, and every sign-in.

**Say:** "Each role sees only what you allow, and a teacher sees only their own groups. Whatever
anyone changes is in the log."

![Roles](../public/help/en/roles.jpg)
![General settings](../public/help/en/settings-general.jpg)
![The action log](../public/help/en/settings-logs.jpg)

## 12. Integrations and the AI assistant

**Open:** Settings → Integrations, then Assistant.

**Show:**

- The integrations page, one card each: SMS through Eskiz, the Telegram bot, Telegram login, Payme
  and Click, fiscal receipts, amoCRM, telephony, FaceID for staff attendance, Instagram direct
  messages, video lessons and the AI assistant. A centre fills in its own details; nothing is shared
  with other centres except the bot, if the site owner allows it.
- **Assistant**: ask "Who owes money this month?" and then "Draft a short SMS reminding a parent
  about an unpaid month". Then ask it for five exercises on the Present Simple.
- **The round button in the corner**: it is on every page. Open it to show the daily summary
  (figures of yesterday and a short conclusion) and switch to **Ask** to put a question without
  leaving the page. Sign in as a teacher to show that the same panel then covers only that
  teacher's groups.

**Say:** "The assistant reads the centre's own data with the rights of the person asking, and it
never changes anything. It answers about the centre and about teaching, and declines everything
else." "Every morning each person gets their own summary: the director for the whole centre, a branch
manager for the branch, a teacher for their groups."

![Integrations](../public/help/en/integrations.jpg)
![The assistant](../public/help/en/assistant.jpg)
![The daily summary](../public/help/en/assistant-summary.jpg)

## 13. Several centres, moving from an old CRM, and help

**Open:** Settings → Organisations (only the site owner sees it), Settings → Import from SOFF CRM,
then Help.

**Show:**

- **Organisations**: one server hosts many centres. Each has its own branches, staff, students,
  settings and integrations, and nobody in one centre sees another. Show the list only, and do not
  open another centre.
- **Import**: students and opening balances from Excel, and a built-in import from SOFF CRM that
  takes its Excel files for staff, groups, students and past payments, with a preview before
  anything is written.
- **Help**: a manual for every role in Uzbek, Russian and English, with pictures and a search box.
  Type "refund" to show the search.

**Say:** "A new centre is created in a minute and follows the checklist on its home page. Staff do
not need training from us: the manual is inside, in their language."

![Organisations](../public/help/en/organizations.jpg)
![Import from SOFF CRM](../public/help/en/soff-import.jpg)
![Help](../public/help/en/help.jpg)

## Questions you will get

| Question                        | Answer                                                                                                                |
| ------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| Can we bring our data?          | Yes. Students and balances come from Excel, and SOFF CRM has its own import.                                          |
| Does it work on phones?         | Yes. Staff install it from the browser, and students get their own app, My Kampus.                                    |
| What do students need?          | Telegram or their personal link. No password and nothing from an app store.                                           |
| Can other centres see our data? | No. Each centre is a separate organisation with its own staff and settings.                                           |
| Which languages?                | Uzbek, Russian and English, chosen per person.                                                                        |
| What if the internet is weak?   | A relay server on our side helps on networks that block calls, and a missed lesson can be watched from the recording. |
| What does it cost?              | Decide your answer before the demo.                                                                                   |

## What is not ready to show

- **Payme and Click** work once a centre enters its merchant details; until then **Pay online** is
  hidden. Uzum is not built.
- **Instagram direct messages** need Meta's review of the app before a centre can connect them.
- **Telephony and FaceID** receive events from a PBX or a terminal, but neither has been tried with
  real equipment yet.
- **Text of recordings** (speech to text) is not built.
- **Backups** run every night on the same server. Copies kept somewhere else are not set up yet.
