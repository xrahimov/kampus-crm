import type { HelpContent } from "./types";

export const en: HelpContent = {
  audiences: {
    CEO: {
      title: "CEO",
      summary: "Owns the learning centre and sees every branch, every number and every setting.",
      startHere:
        "You see everything: the money, every branch, every staff member and every setting. Start with the home page to read the day's numbers, then Finance and Reports for the month. Settings, Staff and Integrations are yours to set up once and adjust rarely.",
    },
    BRANCH_MANAGER: {
      title: "Branch manager",
      summary:
        "Runs one branch day to day: leads, groups, students, payments and the branch's finances.",
      startHere:
        "Your day runs through Leads, Groups and Students. You can also record payments, enter expenses, see your branch's finance figures and compute payroll. Switch branches in the header if you manage more than one.",
    },
    ADMIN: {
      title: "Admin",
      summary:
        "Works the front desk: answers leads, fills groups, registers students and takes payments.",
      startHere:
        "Most of your work is in Leads, Groups and Students, plus the payment button in the header. You can also run exams, send SMS, give coins and look after courses, rooms and schools in Settings.",
    },
    CASHIER: {
      title: "Cashier",
      summary: "Takes payments, prints receipts, records expenses and watches who owes money.",
      startHere:
        "Use the payment button in the header for every payment. The home page shows debtors and payments due soon; Finance holds expenses, income and payroll; Reports shows the month's payments.",
    },
    TEACHER: {
      title: "Teacher",
      summary:
        "Teaches groups: marks attendance, sets grades and homework, shares materials and runs video lessons.",
      startHere:
        "Everything you need is on your group's page: attendance, grades, homework, materials, tests, coins and the video lesson. Start with the article “Teaching a group”; it follows one lesson from start to finish.",
    },
    STUDENT: {
      title: "Student",
      summary:
        "Uses a personal link, without a password, to join lessons and follow progress, homework and payments.",
      startHere:
        "Your learning centre sends you a personal link. Open it on a phone or computer and keep it: it is your page for video lessons, homework, materials, marks and payments. Nothing to install and no password to remember.",
    },
  },
  articles: {
    gettingStarted: {
      title: "Getting started",
      summary: "Signing in, finding your way around and the controls every page shares.",
      sections: {
        signIn: {
          title: "Signing in",
          body: [
            "Your administrator creates your account and tells you the phone number and password to use. Open Kampus in a browser on a computer, tablet or phone; nothing needs to be installed.",
            {
              steps: [
                "Enter your phone number in the form +998 90 123 45 67.",
                "Enter your password and press **Sign in**.",
                "If the password is wrong, the page says so. After several wrong attempts in a row, sign-in pauses for a short while; wait and try again.",
              ],
            },
            "To sign out, open your name in the top right corner and choose **Sign out**. Do this on shared computers.",
            {
              note: "Forgot your password? Only an administrator can set a new one, under Settings → Staff.",
            },
          ],
        },
        layout: {
          title: "The layout",
          body: [
            "The dark sidebar on the left lists the modules you may use: Home, Leads, Teachers, Groups, Students, Exams, Settings, Finance and Reports. People with fewer rights see fewer items. On a phone the sidebar hides behind the menu button in the top left.",
            "The header carries the controls that work on every page: the search box, the **Payment** button, the branch selector, the language, the notifications bell and your name.",
            "Lists share the same habits everywhere: a search box filters as you type, column headers sort when clicked, filters sit above the table and long lists are paged at the bottom. Many lists have an **Excel** button that downloads what you see.",
          ],
        },
        search: {
          title: "Finding a student, lead or group",
          body: [
            "Type two or more letters of a name, or part of a phone number, into the search box in the header. Students, leads and groups that match appear as you type. Press Enter or click a result to open it.",
            "The search covers only the branches you have access to. Within a page, use that page's own search box to filter its list.",
          ],
        },
        branchAndLanguage: {
          title: "Branch and language",
          body: [
            "Every course, room, group and student belongs to a branch. The branch selector in the header decides which branch the pages show. People who may see the whole organisation can also pick **All branches**.",
            "The language button switches between Uzbek, Russian and English. The choice is yours alone and stays for your next visit. Dates, money and Excel files follow the language you pick.",
          ],
        },
        notifications: {
          title: "Notifications",
          body: [
            "The bell in the header shows how many notices you have not read: a payment received, a new lead from a web form, students who owe money today, birthdays. Click the bell for the latest ones, or **View all notifications** for the full list with an unread filter.",
          ],
        },
        roles: {
          title: "Who may do what",
          body: [
            "Your role decides what you see and what you may change. The CEO sees everything; a branch manager runs one branch; an admin works with leads, groups, students and payments; a cashier takes payments and keeps the finances; teachers see only their own groups.",
            "If you open a page your role may not use, it says **No access**. Ask your administrator if you need the right; roles are set under Settings → Roles.",
          ],
        },
        help: {
          title: "Using this help",
          body: [
            "Open **Help** at the bottom of the sidebar at any time. Pick your role to see the articles written for you, or search: type what you want to do, for example “refund” or “day off”, and the matching sections are listed. Each article has a link to the page it describes.",
          ],
        },
      },
    },
    dashboard: {
      title: "Home page",
      summary: "The day's figures, the room schedule and the money, on one screen.",
      sections: {
        kpis: {
          title: "The twelve numbers",
          body: [
            "The home page opens with twelve cards: active leads, groups, remaining debt, debtors, payments due soon, active students, students in groups, students in trial lessons, students who left this month, teachers, upcoming exams and new group admissions.",
            "The numbers are hidden behind asterisks when the page opens, so that nobody reads them over your shoulder. Press **Show numbers** to reveal them. Click any card to open the list behind it, already filtered: the debtors card opens the students list with the debtor filter on.",
            "The figures are for the branch chosen in the header. The utilisation badge shows how much of the centre's room time is in use and links to the centre statistics report.",
          ],
        },
        schedule: {
          title: "Room schedule",
          body: [
            "Below the cards is a grid of rooms against the working hours set in Settings → General. Each group's lessons appear in its room at its time; groups without a room sit in the last row. Switch weekdays with the tabs and the time step between 30 and 60 minutes.",
            "Use it to find a free room and time for a new group, or to see who is teaching right now. Rooms are added under Settings → Rooms; a group gets its room in its schedule.",
          ],
        },
        finance: {
          title: "Finance at a glance",
          body: [
            "People who may see finance get a third block: income by payment method for the chosen year and month, and a bar per month for the whole year. It is the same data as the Finance page, in short form. Pick the year, the month or **Whole year**, and a payment type to narrow it.",
          ],
        },
      },
    },
    leads: {
      title: "Leads",
      summary:
        "From a first phone call to a student in a group: boards, columns, forms and sources.",
      sections: {
        board: {
          title: "The lead board",
          body: [
            "A lead is a person who asked about a course but has not joined a group yet. Leads live on a board as cards in columns, for example New, Called, Came to a trial lesson, Enrolled. Each branch has its own boards; pick one with the **Board** selector.",
            "The first time, create a board with **New board** and add the columns your front desk works through with **Add column**. Column names can be changed later; a column can be deleted only when it is empty.",
            "The filters above the board narrow the cards by lesson time, teacher and days. Switch on **Archive** to see archived leads.",
          ],
        },
        addLead: {
          title: "Adding a lead",
          body: [
            {
              steps: [
                "Press **Add lead** in the column the lead belongs to, or the button at the top of the board.",
                "Enter the name and at least one phone number. **Add a phone number** takes a second one.",
                "Choose where the lead came from (**Source**), and if known the preferred teacher, days and lesson time. These help you pick a group later.",
                "Set a status (New, Contacted, Could not reach, Lost) and a temperature (Hot, Warm, Cold), and write a comment with what was agreed.",
                "Press **Save**. The card appears in the column.",
              ],
            },
            "Leads that came through a web form are marked on the card and already carry the source you set up for the form.",
          ],
        },
        workLeads: {
          title: "Working the board",
          body: [
            "Drag a card to another column when the conversation moves on, or open the card's menu and choose **Move to**. The menu also edits, archives or deletes the lead. Archiving keeps the record and hides it; deleting removes it for good.",
            "To send the same SMS to everyone in a column, open the column's menu and choose **SMS to the whole column**. Pick a template or write the text; each lead's name is filled in. Messages are sent only when the SMS gateway is set up; otherwise they are recorded, not delivered.",
            "The **Excel** button downloads the board as you see it, with the filters applied.",
          ],
        },
        toGroup: {
          title: "Turning leads into students",
          body: [
            {
              steps: [
                "Tick the leads that agreed to join, with the checkbox on each card.",
                "Press **Add to group** and choose the group and the join date. Choose the status New or Trial depending on whether they still have a trial lesson ahead.",
                "Press **Save**. A student record is created for each lead, the student is added to the group and the lead is marked as converted.",
              ],
            },
            "If a student later leaves a group, their row menu on the group page offers **Return to leads**, which puts them back on the board.",
          ],
        },
        sources: {
          title: "Sources",
          body: [
            "The **Sources** button opens the list of places leads come from: Instagram, Telegram, a friend, a banner. Each source shows how many leads it brought and how many became students, so you can see what advertising works. Create sources here before using them on cards; a source that is no longer used can be switched off without losing its history.",
            "**Referral programme.** Every student has an invite code, shown on their personal page and on their profile in Kampus. A friend who fills in the public form through the student's link, or a lead or student on whom the office picks **Invited by**, is tied to that student. When the friend joins a group, the student is credited once: the coins of the **Referral** coin rule and, if Settings → General names a bonus, that amount on their balance as a bonus payment. Leads from invite links take the centre's **Friend** source when it has one. **Reports → Referral programme** shows who invited whom in a month and what it earned them.",
            "**Public page.** Settings → General → Public page switches on a page with your courses and prices, the timetable of the groups that are running or recruiting, your teachers and the sign-up form, in the visitor's language. It opens at the root of your own address (Settings → Organisations) and at the link shown next to the page address on the server's address, so it can go in your Instagram bio. The sign-up form is one of your lead forms (the first active one unless you pick another), so every visitor who signs up lands on the leads board; a student's invite link (?ref=) works on it too.",
          ],
        },
        forms: {
          title: "Web forms",
          body: [
            "Under Settings → Forms you can create a public form that anyone can fill in on your website or from a link: name and phone number, nothing else. Each submission becomes a lead in the column you chose, with the source you chose, and the people who work with leads get a notification. Click a form's row to copy its link.",
          ],
        },
      },
    },
    groups: {
      title: "Groups",
      summary:
        "Creating groups with a schedule and teachers, adding students and everything on the group page.",
      sections: {
        list: {
          title: "The groups list",
          body: [
            "Groups lists every group of the branch with its course, teacher, days, time, number of students and dates. The tabs split them by status: active, archived, trial and frozen. Filter by course, teacher, days, time or room, or search by name. **Excel** downloads the list.",
            "Click a group's name to open its page.",
          ],
        },
        create: {
          title: "Creating a group",
          body: [
            {
              steps: [
                "Press **New group**.",
                "Give it a name and choose the course. The course brings its monthly price, its length and its grading system; set a different grading system only if this group is graded differently.",
                "Choose the days: odd days (Mon, Wed, Fri), even days (Tue, Thu, Sat), every day or a custom set. Set the start and end time and the room. Tick **Different time or room per day** if the days differ.",
                "Add up to three teachers. For each one choose the role (main teacher, assistant, co-teacher) and how they are paid for this group: a percent of the course price, a fee per lesson or a fee per student.",
                "Set the start date. Leave the end date empty to let Kampus compute it from the course length.",
                "Press **Save**. Kampus plans every lesson between the two dates, skipping the branch's days off.",
              ],
            },
            "Editing the schedule later re-plans the lessons that have not been held yet; marked lessons are kept.",
          ],
        },
        detail: {
          title: "The group page",
          body: [
            "The left card shows the course, price, grading system, branch, length, schedule, teachers, active students and lessons held. Under it is the video lesson card, see “Teaching a group”.",
            "The buttons at the top: **Edit** opens the same form as creating; **More** holds support teachers, changing the teacher, giving the group a day off, moving it to another branch, finishing it and archiving it.",
            "To the right are the group's students, and below them the tabs: attendance, grades, homework, materials, tests, knowledge analysis, exams, discounts, coins, comments, notes and history.",
          ],
        },
        members: {
          title: "Students in the group",
          body: [
            "Press **Add student** to add one: find an existing student by name or phone, or create a new one on the spot. Set the join date, and a custom monthly price if this student pays a different amount. **Charged from** is optional: leave it empty to charge from the join date, or set a later day for a student who comes over from another system where the earlier months are already settled; it can be changed later from the row menu. **Add from Excel** takes many at once; download the template first.",
            "Each student's row has a status: New, Trial, Active, Frozen, Removed or Graduated. New and trial students are not charged yet. **Activate students** turns every new and trial student active in one go; from then on their monthly fee is charged.",
            "The row menu holds the day-to-day actions: **Payment** opens the payment dialog for this group; **Change status**; **Graduate**; **Move to another group**, which closes the membership here and opens one there; **Remove from group**, which asks for the reason; **Return to leads**; **Message (SMS)**. Removed students stay in the history and can be shown with the **Removed** switch; balances appear with the **Balances** switch.",
          ],
        },
        tabs: {
          title: "What the tabs are for",
          body: [
            "**Attendance** and **Grades**: a month per tab, students in rows and lessons in columns. **Homework** and **Materials**: what students see on their personal page. **Tests** and **Knowledge analysis**: tests given to the group and how students did by topic. **Exams**: the group's exams, with a button to add one. **Discounts**: a lower monthly price for a student for a number of months. **Coins**: the ranking and giving coins. **Comments**: notes about individual students. **Notes**: notes about the group. **History**: every change, who made it and when.",
            "The teacher's view of attendance, grades, homework, materials and coins is described step by step in “Teaching a group”.",
          ],
        },
        changes: {
          title: "Days off, teacher changes and finishing",
          body: [
            "**Give a day off** removes one date's lesson for this group, for example a teacher's trip, and can tell the students and parents at once by Telegram and SMS (the SMS switches are in Settings → General → Auto SMS). Pick a new date and time to move the lesson instead of dropping it. The month's cancelled and moved lessons are listed above the attendance grid, where a day off can be undone. Branch-wide holidays go to Settings → Days off instead and apply to every group.",
            "**Change teacher** replaces the outgoing teacher with a new one from today; the new teacher's share of the pay counts from today, the old one's until yesterday. **Support teachers** attaches extra teachers who may mark attendance and see the group without a pay share.",
            "**Finish group** when the course is over: every active student becomes a graduate and the remaining lessons are removed. The graduates report lists them. **Archive** hides a group that was abandoned; its lessons and history stay. Archived groups are listed under the Archived tab.",
          ],
        },
        timetable: {
          title: "Timetable and clashes",
          body: [
            "When a group's schedule is saved, Kampus checks the other current groups of the centre: the same room at an overlapping time on the same day, or the same teacher in two places at once. The dialog lists what clashes (day, time, room or teacher, the other group) and the save waits; change the time, room or teacher, or press **Save anyway** when the overlap is intended, for example a shared hall. **Timetable** in the main menu shows a week of one room or one teacher: pick the branch, switch between rooms and teachers, and click a block to open the group. Teachers see their own week.",
          ],
        },
      },
    },
    today: {
      title: "Your day on a phone",
      summary:
        "Today shows the lessons of the day with one-tap attendance, the homework, the next lesson and the debtors of your groups; Kampus installs on a phone like an app.",
      sections: {
        day: {
          title: "What Today shows",
          body: [
            "Teachers land on **Today** after signing in. It lists the lessons of the day for the groups you teach or support, in order of time, with the course, the room and the topic. The arrows at the top move a day back or forward; the office sees every group of the branch here.",
            "Below the lessons sit the **next lesson** after now and the **debtors in your groups** with what they owe. A friendly word after the lesson helps; payments are taken by the office.",
          ],
        },
        attendance: {
          title: "One-tap attendance",
          body: [
            {
              steps: [
                "On the lesson's card tap a student's name once for present, again for absent, a third time for excused and once more to clear it.",
                "**All present** marks everyone who is not marked yet in one tap; then tap the ones who are missing.",
                "Marks are saved at once and count like marks made in the group's attendance grid: coins, auto-SMS and the attendance percentage follow them.",
              ],
            },
            {
              note: "If the centre has switched on “attendance only during the lesson”, marks are accepted only on the lesson's day.",
            },
          ],
        },
        homework: {
          title: "Homework from the card",
          body: [
            "Each lesson card shows its homework: the text, the due date, how many answers came in and how many wait for a check. **Set homework** writes one in two fields; to check answers or attach a file, open the group's Homework tab.",
          ],
        },
        install: {
          title: "Kampus on your phone",
          body: [
            {
              steps: [
                "Open Kampus in Chrome on Android, open the menu and choose **Install app** (or **Add to Home screen**).",
                "On an iPhone open it in Safari, tap **Share**, then **Add to Home Screen**.",
                "Kampus then opens from its own icon, full-screen, with Today as the first page for teachers.",
              ],
            },
          ],
        },
      },
    },
    teaching: {
      title: "Teaching a group",
      summary:
        "A teacher's lesson from start to finish: attendance, grades, homework, materials, video and coins.",
      sections: {
        day: {
          title: "Your groups",
          body: [
            "After signing in you land on **Today**, the day's lessons with one-tap attendance; Groups lists only the groups you teach or support. Open a group to find everything about today's lesson on one page. The sidebar shows you Groups, Students and Exams; the rest of Kampus is for the office.",
            "The exam schedule is visible only if the administrator switched it on for teachers. Payments and student balances are not yours to see unless the administrator set that up.",
          ],
        },
        attendance: {
          title: "Marking attendance",
          body: [
            {
              steps: [
                "Open the group and stay on the **Attendance** tab. Pick the month at the top if it is not the current one.",
                "Find today's column. Click a student's cell once for present, again for absent, a third time for excused, and once more to clear it.",
                "Write the lesson topic in the **Topic** row above the grid, and paste a link to the lesson's file if you have one. Students see the topic on their page.",
              ],
            },
            "If the centre has switched on “attendance only during the lesson”, the cells open only while the lesson is running; admins are exempt. To record a lesson that is not in the schedule, use **Extra lesson** and pick the date and time.",
            {
              note: "Attendance drives the student's attendance percentage, the auto-SMS to parents about an absent child, and the automatic coins for coming to the lesson, when those are switched on.",
            },
          ],
        },
        grades: {
          title: "Grades",
          body: [
            "The **Grades** tab has the same grid. Click a cell and enter the mark in the group's grading system: a CEFR level, an IELTS band, 1 to 5 or 0 to 100, depending on the course. The average per student is computed on the right. Marks appear on the student's personal page and in their progress tab.",
          ],
        },
        homework: {
          title: "Homework",
          body: [
            "One homework per lesson. Students answer from their personal link; you accept or return each answer here.",
            {
              steps: [
                "On the **Homework** tab press **Set homework**, choose the lesson and write the task. Add a link or a file and a due date if you want.",
                "Each homework card shows how many students answered and how many answers you accepted. Open a card to read the answers; each has the student's text and file.",
                "Press **Accept** or **Return**, with a comment for the student if useful. A returned answer goes back to the student as “to do”.",
              ],
            },
            "Students connected to Telegram get a message when homework is set, changed, accepted or returned. When automatic coins for homework are on, an accepted answer gives the coins by itself.",
          ],
        },
        materials: {
          title: "Materials",
          body: [
            "The **Materials** tab holds files and links for the group: a textbook chapter, a presentation, a recording. Add one for a particular lesson or for the whole group. Students open and download them from their page. Recordings of video lessons land here by themselves and are deleted after the number of days set in Settings → Integrations → Video lessons.",
          ],
        },
        video: {
          title: "Video lessons",
          body: [
            "The video lesson card on the group page shows whether a call is running and today's lesson time.",
            {
              steps: [
                "Press **Start video lesson**. Your browser asks for the camera and microphone; allow both, check the preview and press **Join lesson**.",
                "Students join from their personal link as soon as you start; their page lets them in by itself. Staff can join from the group page with **Join**.",
                "In the call you can share your screen, mute one person or everyone, see raised hands, chat and record the lesson. The recording is saved under the group's materials.",
                "Press **End for everyone** when you are done. Students can join again only after you start a new lesson.",
              ],
            },
            "If someone cannot connect, their network may block direct calls; the administrator can add a relay server under Settings → Integrations → Video lessons.",
          ],
        },
        links: {
          title: "Students' personal links",
          body: [
            "Each student has one personal link for this group; it opens their page with the video lesson, lessons, homework, materials, marks and payments. Press **Students' links** on the video card to see them all, copy one, copy all, or send them by SMS to every student with a phone number. If a link leaks, make a new one for that student; the old one stops working at once.",
          ],
        },
        coins: {
          title: "Giving coins",
          body: [
            "Coins reward students and feed the ranking and the marketplace. On the **Coins** tab press **Give coins**, pick the student and a reason from the list the centre set up; each reason has a maximum. Automatic coins for attendance, homework, test results and birthdays are set by the administrator and need nothing from you.",
          ],
        },
        tests: {
          title: "Tests",
          body: [
            "The **Tests** tab lists the tests assigned to your group. Students take them on paper or in class; you enter each student's result on the test's page under **Enter result**. The **Knowledge analysis** tab then shows how the group did by subject, test and date, so you see which topics to repeat.",
          ],
        },
      },
    },
    students: {
      title: "Students",
      summary:
        "The students list, a student's profile, their groups, parents, history and leaving.",
      sections: {
        list: {
          title: "The students list",
          body: [
            "Students lists everyone with their photo, grade, next payment date, phone, groups and balance. Filter by course, school, teacher, group, group status (active, new, frozen, left after trial, without a group) or payment status (due soon, debtor, not a debtor, overpaid). The **Archive** view shows students who left.",
            "The buttons at the top: **Add student**, **Excel** for the list, **Import from Excel**, **Send SMS** to the filtered students and **Badges**, which prints an ID badge with a QR code for each student in the list.",
          ],
        },
        add: {
          title: "Adding a student",
          body: [
            {
              steps: [
                "Press **Add student**. Enter the full name, phone and date of birth; add the gender, a note and where the student came from.",
                "Open **Add to a group** to put the student straight into a group: narrow the list by branch, teacher or course, pick the group, the join date and the status (New, Trial or Active).",
                "Open **Add a parent's phone** and **Add a school** if you have them. Parents can receive SMS about attendance and payments.",
                "Press **Save**. The profile opens.",
              ],
            },
            "Leads that agreed to join are better converted from the lead board, which creates the student and keeps the source; see “Leads”.",
          ],
        },
        profile: {
          title: "The student's profile",
          body: [
            "The top card shows the balance, grade, ID, phone, date of birth, whether the student uses the app and a QR code. Extra information, like a passport number or an allergy, goes under **Add extra information**.",
            "The buttons: **Add to group**, **Make a payment**, **Refund**, **Print badge**, **Edit** and **Blacklist**. Below are the tabs: groups, progress, test results, comments and notes, SMS, history, parents and calls.",
          ],
        },
        groupsTab: {
          title: "Groups and balance",
          body: [
            "The **Groups** tab shows a card per group with the student's status, join date, monthly price and balance in that group. The calendar in each card marks held lessons and attendance. From the card you can pay, move the student to another group or remove them. Under the cards is the payment history with every payment, refund and receipt.",
            "A student's balance is per group: each month the group's price (or the student's custom price, or a discount) is charged, and payments are subtracted. A negative balance means the student owes money; the home page counts such students as debtors.",
          ],
        },
        moreTabs: {
          title: "Progress, comments, parents and calls",
          body: [
            "**Progress** shows the attendance percentage, the average grade and exam results by month and by group. **Test results** shows attempts and accuracy by topic. **Comments and notes** keep what staff noticed; a comment can also be added from the group page. **SMS** lists every message sent to this student. **History** is a timeline of every change, from creation to the last payment. **Parents** holds parents with phones, who can get SMS. **Calls** shows calls recorded by the telephony integration and has a **Call** button for click-to-call.",
          ],
        },
        importExport: {
          title: "Excel import and export",
          body: [
            "**Import from Excel** adds many students at once: download the template, fill one row per student with the column headers kept, upload the file and read the result, which says how many rows were imported and which were skipped and why. The same works for adding many students to one group from the group page.",
            "**Excel** on any list downloads what you see with the current filters, in the language of the interface.",
            "Rooms, courses and staff have the same **Import from Excel** on their Settings pages, groups on the Groups page and parents under **Import** on the Students page, so a centre moving to Kampus is loaded from a few files. Each dialog has its own template and accepts CSV too. Staff rows without a password get a temporary one, shown once after the import.",
          ],
        },
        leaving: {
          title: "Archiving and blacklisting",
          body: [
            "**Archive** removes the student from every group and moves them to the archive; they can be restored later. **Blacklist** does the same and also prevents the student from being added to any group until removed from the blacklist; use it for people who must not come back. Both are in the row menu on the list and on the profile. Removing a student from one group while keeping the others is done on the group page.",
          ],
        },
      },
    },
    payments: {
      title: "Payments and receipts",
      summary:
        "Recording a payment, printing the receipt, refunds, discounts, the payment log and paying online.",
      sections: {
        balance: {
          title: "How charges work",
          body: [
            "Every active student in a group is charged the group's monthly price on the first day of each month, pro-rated for a partial first month. A custom price on the membership or a discount replaces the group price for that student. Payments reduce the balance; a negative balance is a debt. New and trial students are not charged until activated.",
            "The home page counts debtors and payments due soon; the students list filters by payment status; the Finance page lists students with debt.",
          ],
        },
        record: {
          title: "Recording a payment",
          body: [
            {
              steps: [
                "Press **Payment** in the header and find the student by name or phone, or press **Make a payment** on the student's profile, or **Payment** in the student's row on the group page.",
                "Choose the payment method (cash, card, transfer, as set up in Settings → General) and, if the student is in several groups, the group. The dialog shows the balance and the monthly price.",
                "Enter the amount, or press **Fill in** to take the monthly price. Choose which month the payment is for and the payment date, and write a comment if needed. A bonus payment is marked with **Bonus**.",
                "Press **Save**. The balance updates, the payment appears in the history and, if the centre prints receipts after each payment, the receipt opens for printing.",
              ],
            },
            "When an auto-SMS for payments is set up, the student (and parents) get a text with the amount. Staff listed under Bot notifications get a Telegram message.",
          ],
        },
        receipt: {
          title: "The receipt",
          body: [
            "Every payment has a receipt: open it from the **Receipt** link in the payment history and press **Print**. It shows the centre's name, address and phone, the student, the group, the amount, the month, the method and the cashier, with a QR code. What the receipt shows and where the logo sits is set under Settings → Receipt settings, with a live preview.",
          ],
        },
        refund: {
          title: "Refunds",
          body: [
            "Refunds are possible only when the switch **Refunds enabled** is on in Settings → General. On the student's profile press **Refund**, choose the payment, enter the amount (up to what is left of that payment) and the reason. The refund appears in the payment history and in the payments log, and the balance goes back up.",
          ],
        },
        openingBalances: {
          title: "Opening balances and corrections",
          body: [
            "A centre that moves to Kampus brings its students' debts and prepayments with it. On the student's profile press **Adjust balance**, pick the group, say whether the student owes or has credit, enter the amount, the type (**Opening balance** or **Correction**), the date and a comment. The amount counts in the balance like a payment: a debt shows at once in the debtor lists, the reminders and the reports, and the row appears under the payment history, where someone with the refund permission can remove it.",
            "Many students at once: on the Students page press **Import opening balances**, download the template and fill one row per student and group. The balance is negative for a debt and positive for money the student has; a column called debt (positive = owes) works too. Students are matched by Kampus ID, phone or exact name, the group by its name (not needed when the student is in one group), and a branch column may name another branch. The first upload only previews: it lists the rows that match and the rows that will be skipped, and nothing is written until you press **Import**. A group that already has an opening balance for the student is skipped, so the same file can be uploaded twice without doubling anyone's debt.",
          ],
        },
        discounts: {
          title: "Discounts",
          body: [
            "A discount is a lower monthly price for one student for a number of months. On the group page open the **Discounts** tab, press **Give a discount**, pick the student, the discounted price, the number of months and a comment. The tab shows how many months are left. Removing a discount ends it from the current month; past months stay as charged.",
          ],
        },
        log: {
          title: "The payments log",
          body: [
            "Settings → Payments lists every payment and refund across the organisation with the date, student, group, amount, method and the cashier who received it. Filter by dates, method and cashier; **Excel** downloads it. Reports → Payments and Student payments sum the same data by teacher, staff member and student.",
          ],
        },
        online: {
          title: "Paying online",
          body: [
            "When Payme or Click is set up under Settings → Integrations, students see **Pay online** on their personal page: they choose the month and the amount and pay with a card. The provider confirms the payment and it appears in Kampus by itself, with the method Payme or Click, in the student's history and in the log.",
          ],
        },
      },
    },
    debts: {
      title: "Debtors",
      summary:
        "Following a debt from the first short balance to the payment: the list, calls and promises, and the automatic reminders.",
      sections: {
        list: {
          title: "The debtor list",
          body: [
            "**Debtors** lists every student whose balance in the branch is short: the amount, how many days it has been short (counted from the first unpaid month), the promise made, and who last spoke to them and how it went. A student appears the moment a balance turns short and leaves the list when it is paid; nothing is opened or closed by hand.",
            "The cards above the list count the debtors, the total owed, how many promised to pay and how many wait for a call. **Show** narrows the list to open cases, promises, those needing a call or closed cases; the search box finds a name or phone. **Excel** downloads the list as shown.",
          ],
        },
        contact: {
          title: "Calls, promises and reminders",
          body: [
            {
              steps: [
                "Open the row's menu and choose **Call and log the outcome** (the phone numbers are links) or **Log a contact** for a visit, an SMS or a note.",
                "Pick how you reached the student and the outcome: no answer, promised to pay, refused, wrong number or other.",
                "For a promise, enter the day and, if agreed, the amount. The case shows **Promised** and automatic reminders pause until that day.",
                "**Send a Telegram reminder** messages the student right away through the centre's bot, when their Telegram is connected.",
              ],
            },
            "When the debt is paid the case closes as **Promise kept** or **Paid**. If the promised day passes with the debt still open, the case is open again with the promise marked as missed, the branch managers are told, and the row is flagged **Call**. **History** shows every contact and automatic message.",
          ],
        },
        cadence: {
          title: "Automatic reminders",
          body: [
            "Each centre sets its own cadence under Settings → Center settings → **Debt reminders**: after how many days a debtor gets a Telegram message, then an SMS (the debtor text from Auto SMS settings, when that switch is on), and after how many days without a call the branch managers get a task in the bell. Leave a field empty to switch that step off. A student with a promise is not reminded until the promised day.",
          ],
        },
      },
    },
    exams: {
      title: "Exams",
      summary: "Group exams and mock exams: scheduling, registrations, scores and results.",
      sections: {
        list: {
          title: "The exams list",
          body: [
            "Exams has two tabs: **Group exams**, held for one group, and **Mock exams**, open to students from several groups for a fee. Filter by status (not started, finished), group and dates. Each row shows the date, time, examiner, room and the number of students. The row menu opens the results sheet, finishes or reopens the exam, or deletes it.",
            "Teachers see the exam schedule only when the administrator switched that on in Settings → General.",
          ],
        },
        groupExam: {
          title: "A group exam",
          body: [
            {
              steps: [
                "Press **Add exam** and keep the type **Group exam**. Name it, pick the group and tick **Retake** if it repeats an earlier exam.",
                "Set the date and the start and end time. Under **Additional details** pick the examiner and the room.",
                "Choose the grading system (the course's by default) or **Custom** with a pass score and a maximum score.",
                "Press **Save**. Every active student of the group is on the sheet.",
              ],
            },
            "The same exam can be created from the group's **Exams** tab with the group already chosen.",
          ],
        },
        mockExam: {
          title: "A mock exam",
          body: [
            "Choose the type **Mock exam**. Besides the date and grading, set the price and the capacity, then pick which groups may register: filter by course, branches and the minimum months a student has studied, and select the groups. Students register from the results page with **Register a student**; the sheet shows registrations against the capacity.",
          ],
        },
        grading: {
          title: "Entering results",
          body: [
            {
              steps: [
                "Open the exam's **Results**. Each student has a presence switch, a score field and a comment.",
                "Mark absent students; enter the score for the rest. The level and the pass or fail result are computed from the grading system or the pass score.",
                "Press **Save results**. You can come back and change scores while the exam is open.",
                "Press **Finish** when the scores are final. Finishing sends the result SMS if that auto-SMS is on, and locks the sheet; **Reopen** unlocks it.",
              ],
            },
            "Results show in the student's progress tab and on their personal page under Results.",
          ],
        },
      },
    },
    testsAndCoins: {
      title: "Tests and coins",
      summary:
        "The question bank, tests and results; coin rules, giving coins, the ranking and the marketplace.",
      sections: {
        bank: {
          title: "The question bank",
          body: [
            "Settings → Test settings holds the question bank: multiple-choice questions with a subject and a topic. Press **Add question**, write the question, add the answer options and mark the correct one. Questions can be searched and filtered by subject and topic. A question used in a test cannot be deleted.",
          ],
        },
        tests: {
          title: "Creating a test",
          body: [
            {
              steps: [
                "On the **Tests** tab press **Create test**. Name it and pick the subject.",
                "Set the time limit, the pass mark in percent and a deadline if there is one.",
                "Tick the groups that take it and choose the questions from the bank, with points per question.",
                "Save as a draft, then **Activate** when it is ready. A test with submissions keeps its questions locked; **Close** it when the period is over.",
              ],
            },
          ],
        },
        attempts: {
          title: "Entering results",
          body: [
            "Students take the test in class; staff enter the outcome. Open the test and press **Enter result**, pick the student and the group and enter the score. The test row shows the number of submissions and the average accuracy. Results appear on the group's **Knowledge analysis** tab, in the student's **Test results** tab and on the student's personal page. When automatic coins for test results are on, a passed test gives coins by itself.",
          ],
        },
        coinRules: {
          title: "Coin rules",
          body: [
            "Settings → Coin settings turns the automatic coin system on or off and sets how many coins each event gives: coming to a lesson, an accepted homework, a passed test and a birthday. Below are the manual reasons teachers may choose when giving coins, each with a maximum, for example “Active in class, up to 5”. Switching the automatic system off keeps manual coins working.",
          ],
        },
        giveCoins: {
          title: "Giving coins",
          body: [
            "On the group page's **Coins** tab press **Give coins**, pick the student, a reason and the number of coins within the reason's maximum, with a comment. The tab ranks the group's students by coins. Every coin given or spent is recorded with who gave it and why.",
          ],
        },
        marketplace: {
          title: "Ranking and marketplace",
          body: [
            "Reports → Coins has three tabs. **Rating** ranks students by coins for the week, the month or all time, by branch, course or group, with each student's history. **Marketplace** is the list of products students can buy with coins, in categories with a price and a stock. **Purchase requests** lists what students asked for, entered by staff with **New request**; approve a request to deduct the coins and hand over the product, or reject it.",
          ],
        },
      },
    },
    finance: {
      title: "Finance",
      summary:
        "Income and expenses, the monthly plan, categories, advances, bonuses, fines and payroll.",
      sections: {
        overview: {
          title: "Key figures",
          body: [
            "Finance opens with the branch, year, month and payment type filters, then the key figures: income, expenses, profit, active balance (what students still owe), LTV (average income per student over their time with you), CAC (marketing spend per new student), marketing efficiency and the average payment. A donut splits income by payment method and a bar chart shows the year's turnover month by month.",
          ],
        },
        plan: {
          title: "The monthly plan",
          body: [
            "The plan card compares what was expected this month, from the monthly fees of every active student, with what was achieved. The **Effect time** switch changes whether payments count in the month they were made or the month they were for. Active debt and prepayments are shown next to it.",
          ],
        },
        categories: {
          title: "Expenses and income",
          body: [
            "Below the figures are the expense and income categories with this month's total each: rent, salaries, utilities, advertising, or extra income like book sales. Press **Category** to add one.",
            {
              steps: [
                "Open a category to see its entries.",
                "Press **Add expense** or **Add new** for income. Enter the amount, the payment type, the date, who it was paid to and a comment.",
                "Press **Save**. The entry counts in the key figures and in the monthly totals at once.",
              ],
            },
            "Entries can be edited or deleted from the category page; every change is in the action log.",
          ],
        },
        staffMoney: {
          title: "Advances, bonuses, fines, marketing and investments",
          body: [
            "The **Staff bonuses and fines** cards and the sections Advances, Marketing and Investments are ledgers of the same kind, each with its own form. An advance, bonus or fine is tied to a staff member and flows into their payroll for that month: bonuses are added, fines and advances are subtracted. Marketing entries feed the CAC figure. Investments are kept apart from the operating figures.",
          ],
        },
        payroll: {
          title: "Payroll",
          body: [
            "The **Payroll reports** card lists each month's payroll. Open a month to compute it: a line per staff member with their fixed salary, percent of course price × students, per-lesson fee × lessons held, per-student fee × students, plus bonuses, minus fines and advances, with the per-group breakdown under each line.",
            {
              steps: [
                "Check each line; the salary method and the rates come from the staff member's profile and the group's teacher shares.",
                "Press **Recalculate** after fixing attendance, a group's teacher or a bonus; lines that are already approved keep their amounts.",
                "Press **Approve** on each line when it is correct. Approval needs the payroll right; the CEO always has it.",
                "**Excel** exports the month for the accountant.",
              ],
            },
            "Whether a teacher is paid for a group's day off, or only for lessons they attended, and whether teachers see their own salary, are switches in Settings → General.",
          ],
        },
        cashClose: {
          title: "Cashier day close",
          body: [
            "**Cash desk** in the sidebar (everyone who takes payments has it) closes a cashier's day. The close lists what you recorded that day in one branch by payment type: payments, refunds, other income and the expenses paid from the drawer. The cash it expects comes from the payment types marked as cash in Settings → General → Payment methods; the difference is what you counted minus that.",
            {
              steps: [
                "Press **Close the day**, check the branch and the day.",
                "Compare the figures with your receipts, count the cash and enter it under **Counted cash**. Add a note if the figures differ.",
                "Press **Close the day** in the dialog. The close appears in the list with its difference; **Print** opens a sheet with the figures and two signature lines for the hand-over.",
                "The manager presses **Accept** when they take the money. An accepted day cannot be closed again; a day not yet accepted can, and the new figures replace the old.",
              ],
            },
            "Managers see every cashier's closes and the Finance page counts them; a cashier sees only their own. Every close goes to the staff Telegram feed and into the action log with who closed and who accepted.",
          ],
        },
      },
    },
    reports: {
      title: "Reports",
      summary: "What each report answers and how to export it.",
      sections: {
        index: {
          title: "The reports page",
          body: [
            "Reports is a page of cards, one per report. Every report has filters at the top (branch, period, and what the report needs) and an **Excel** button that downloads the table as you see it, in the interface language.",
          ],
        },
        money: {
          title: "Payments reports",
          body: [
            "**Payments**: the month's total payments, paid on time, paid late, discounts, bonuses and refunds, then a table by teacher and another by staff member who received the money. **Student payments**: every payment of the period by student, group and teacher, with the **By payment date** switch to count payments by when they were made rather than the month they cover.",
          ],
        },
        students: {
          title: "Students reports",
          body: [
            "**Left students**: churn rate, how many left, lost revenue and average lifetime, with leavers by month, by reason, by course, teacher and branch; **Set up reasons** edits the list of leave reasons staff pick when removing a student. **Graduates**: who finished, with fields for IELTS, CEFR, university and employment to record what happened to them. **Students**: attendance and performance across the centre.",
          ],
        },
        center: {
          title: "Centre, leads, staff and coins",
          body: [
            "**Center statistics**: rooms against groups for a month, week or day, with utilisation; the home page's badge links here. **Lead statements**: how many leads came in, from which sources and how many became students, as a funnel and charts. **Staff attendance**: who came, who was late and who was absent, from the FaceID terminals or manual check-ins, daily, weekly and monthly, with each person's work schedule. **Coins**: the ranking, the marketplace and purchase requests.",
          ],
        },
        excel: {
          title: "Excel",
          body: [
            "Every report, and most lists, have **Excel**. The file keeps the filters you set and the column names in your language. Open it in Excel, Numbers or Google Sheets.",
          ],
        },
      },
    },
    staffAndRoles: {
      title: "Staff and roles",
      summary:
        "Adding teachers and other staff, salary methods, roles with permissions, and archiving.",
      sections: {
        teachers: {
          title: "Teachers and staff",
          body: [
            "Teachers lists the teaching staff with tabs for teachers and support teachers, a search and a role filter; open a teacher to see their profile, groups and payroll lines. Settings → Staff lists everyone who signs in, including admins and cashiers, with a role filter. Both pages add and edit people with the same form.",
          ],
        },
        add: {
          title: "Adding a staff member",
          body: [
            {
              steps: [
                "Press **New teacher** on Teachers or **New staff member** on Settings → Staff.",
                "Add a photo, the full name, phone number, gender, date of birth and hire date.",
                "Set the password the person will sign in with, or press **Generate**. Tell them the phone and password; they can be changed here later.",
                "Choose the branches the person works in and their roles. A person can have several roles; their rights add up.",
                "Choose the salary method and rate (see below), then press **Save**.",
              ],
            },
            "You cannot change your own roles or archive yourself; another administrator does that.",
          ],
        },
        salary: {
          title: "Salary methods",
          body: [
            "**Monthly**: a fixed salary. **Percent**: a share of the course price for each student in the groups the person teaches. **Per lesson**: a fee for each lesson held. **Per student**: a fee for each student. The method and rate on the profile are the defaults; each group can set a different share for its teachers. Payroll under Finance computes the month from these.",
          ],
        },
        roles: {
          title: "Roles and permissions",
          body: [
            "Settings → Roles lists the roles with how many permissions each has; open a role to see and tick its permissions: viewing, creating, editing and deleting in every module, marking attendance, taking payments, giving refunds and discounts, approving payroll, sending SMS, editing settings and reading logs. The built-in roles are CEO, admin, branch manager, cashier, teacher, support teacher, marketer and watcher.",
            "Press **New role** to create a role of your own, for example a receptionist who may only add leads and take payments, and tick its permissions. You can only grant permissions you hold yourself. The CEO's role cannot be reduced.",
          ],
        },
        archive: {
          title: "When someone leaves",
          body: [
            "**Archive** on the person's row or profile signs them out, hides them from lists and keeps their history, groups and payroll lines. An archived teacher's groups keep running; change their teacher on the group page. A person can be restored later with the same phone number.",
          ],
        },
      },
    },
    settings: {
      title: "Settings",
      summary:
        "The centre's name and hours, behaviour switches, branches, courses, rooms, days off, SMS, receipts, forms and logs.",
      sections: {
        general: {
          title: "General settings",
          body: [
            "Settings → General has two tabs. **Center settings** holds the organisation name shown in the header and on receipts, the working hours and the schedule step used by the room schedule, the behaviour switches, the branches and the payment methods. **Auto SMS settings** chooses which events send a text and with which template: a birthday, an exam result, a payment, an absence, a payment due soon, a debtor warning, the day before the first lesson and more.",
            "Branches: every course, room and group belongs to one. Add a branch with **New branch**; deactivating it hides it from every selector and keeps its records. Payment methods, such as cash, card and transfer, are the choices in the payment dialog.",
          ],
        },
        switches: {
          title: "The behaviour switches",
          body: [
            "**Spread a student's overpayment over the next months**: an amount above the monthly price covers following months. **Refunds enabled**: shows the refund button. **Print a receipt after each payment**: opens the receipt when a payment is saved. **Allow comments on attendance**. **Teachers and support teachers see the exam schedule**. **Attendance can be marked only during the lesson**: admins and the CEO are exempt. **Teachers see their monthly salary**. **Pay the teacher when a group has a day off** and **Pay teachers only for lessons they attended** change payroll. **Teachers can add students** to their groups. The rest concern support teachers and group support sessions.",
          ],
        },
        catalog: {
          title: "Courses, rooms, days off, schools",
          body: [
            "**Courses**: a course has a name, a branch, a monthly price, a length in months, a colour and a grading system; groups are created from courses. Grading systems (CEFR, IELTS, 1 to 5, 0 to 100 or your own) are set up on the same page. **Rooms**: a name and a capacity per branch; the home page's schedule is built from them. **Days off**: branch-wide holidays on which no lesson is planned. **Schools**: the schools students attend, for the student form and the filters.",
          ],
        },
        sms: {
          title: "SMS templates",
          body: [
            "Settings → SMS templates holds ready texts in categories for the Send SMS dialog and for the auto-SMS. A template can use placeholders that are filled in for each recipient: the student's name, the group, the date, the amount, the debt, the score and the centre's name. **Import from Eskiz** copies the templates approved in your Eskiz account. The SMS gateway itself is set up under Integrations; until then messages are recorded but not delivered.",
          ],
        },
        receipt: {
          title: "Receipt settings",
          body: [
            "Settings → Receipt settings decides what the printed receipt shows: the address and phone, which parts are visible, where the logo sits and the footer text, with a live preview. It is also reachable from your name in the header.",
          ],
        },
        forms: {
          title: "Web forms",
          body: [
            "Settings → Forms creates public lead forms; each has a link name, a lead column and a source. See “Leads” for how submissions arrive.",
          ],
        },
        logs: {
          title: "Logs",
          body: [
            "**Login log**: who signed in, from which address, and failed attempts. **Action log**: every change staff made, newest first, with the type of record and the person; filter by type, person and dates. **Sent SMS**: every message with its status. **Calls**: the call log from the telephony integration. **Payments**: the payments log. Logs cannot be edited.",
          ],
        },
      },
    },
    integrations: {
      title: "Integrations",
      summary:
        "Connecting SMS, Telegram, AmoCRM, telephony, FaceID, video lessons and online payments.",
      sections: {
        overview: {
          title: "How integrations work",
          body: [
            "Settings → Integrations lists the external services Kampus can talk to. Each has an **Enabled** switch and its own fields; credentials are stored here, never in files on the server. Services that call Kampus (Telegram, telephony, FaceID, Payme, Click) show the webhook address to paste into the provider's settings, protected by a secret you set. Until a service is enabled, Kampus uses a built-in stand-in: SMS are recorded but not sent, calls are logged but not placed.",
          ],
        },
        sms: {
          title: "SMS gateway (Eskiz)",
          body: [
            "Enter the e-mail, password and the sender name of your Eskiz account and enable it. From then on the Send SMS dialog, bulk SMS to a column or a list, the auto-SMS events and the students' video links by SMS are delivered. Sent messages and their status are under Settings → Sent SMS.",
          ],
        },
        telegram: {
          title: "Telegram bot",
          body: [
            "Create a bot with BotFather, paste its token and username, set a webhook secret and enable it. Two things then work. Staff listed under Settings → Bot notifications get a Telegram message about payments and new students: each staff member sends **/id** to the bot, and you enter the ID they receive with the branches they should hear about. Students and parents press **Connect Telegram** on the student's personal page and get lesson reminders about thirty minutes before, a message when the teacher starts a video lesson, homework notices, new materials, debt reminders and payment confirmations. Every Sunday evening the same chats get a weekly report: lessons attended and missed, grades, homework done, coins, and the balance with the next payment date (the **Weekly report to parents** switch on the Telegram card). Linked chats can also write to the bot: **Balance** answers with the balance per group and the coins, **Pay** sends Payme and Click links for the amount due (when online payments are set up), and **Absent today** marks an excused absence on today's lesson with the reason sent, which the teacher sees on the Today screen and as a dot in the attendance grid.",
          ],
        },
        amocrm: {
          title: "AmoCRM",
          body: [
            "Enter the integration ID, secret key, authorisation code and sub-domain from your AmoCRM account and press **Test connection**. When enabled, every new lead is pushed to AmoCRM by a background job.",
            "Leads can also come the other way (A-115): in amoCRM add a webhook with the address shown on the page and your webhook secret, ticking “Lead added”. Each deal added in amoCRM, for example from an Instagram conversation, becomes a lead here in the column you chose, under the source you named (“Instagram” unless changed), with a link back to the deal in its comment. A deal that Kampus itself pushed to amoCRM is recognised and not imported again, and a lead whose phone number is already on the board is skipped.",
          ],
        },
        telephony: {
          title: "Telephony",
          body: [
            "Set the webhook secret and point your PBX at the webhook address. Finished calls appear under Settings → Calls and on the student's **Calls** tab, matched by phone number. The **Call** button on a student's profile asks the PBX to dial.",
          ],
        },
        faceId: {
          title: "FaceID and staff attendance",
          body: [
            "Set the device secret and how many minutes count as late, and point the terminals at the webhook. Each IN and OUT event becomes a check-in or check-out for the staff member with that phone number. Reports → Staff attendance shows daily, weekly and monthly attendance and lets you set each person's work schedule and enter a manual check-in.",
          ],
        },
        video: {
          title: "Video lessons",
          body: [
            "Video lessons work without setup over public STUN servers. If students on some mobile or office networks cannot connect, add a TURN relay server here (the server deployment ships one). Set the most people allowed in one call and how many days to keep lesson recordings before they are deleted.",
          ],
        },
        onlinePayments: {
          title: "Payme and Click",
          body: [
            "Enter the merchant details from your Payme Business cashbox or Click merchant cabinet and set the webhook address there as described in the hint under each form. Once enabled, students see **Pay online** on their personal page, and confirmed payments appear in Kampus as payments with the method Payme or Click.",
          ],
        },
        jobs: {
          title: "Background jobs",
          body: [
            "Auto-SMS, Telegram messages, AmoCRM pushes and the daily scans for birthdays and debtors wait in a queue processed by the worker that runs next to the app. If the worker is not running, press **Run queued jobs now** on the Integrations page to process them by hand.",
          ],
        },
      },
    },
    organizations: {
      title: "Organisations on this server",
      summary:
        "For the server's owner only: hosting several learning centres, each with its own CEO, on one Kampus.",
      sections: {
        what: {
          title: "What an organisation is",
          body: [
            "One Kampus server can host several learning centres. Each is an organisation with its own branches, staff, students, courses, settings, roles and integrations; nobody in one centre can see anything of another. The first CEO of the server is its **site owner**: the only account that sees Settings → Organisations. Being the site owner adds nothing else; inside their own centre they are an ordinary CEO.",
          ],
        },
        create: {
          title: "Creating a centre",
          body: [
            {
              steps: [
                "Open Settings → Organisations and press **Add organisation**.",
                "Enter the centre's name and its branches, one per line.",
                "Enter the CEO's full name, phone number and a first password. The phone number must not already have an account on this server.",
                "Press **Create** and tell the new CEO their phone number and password in person; they should change the password after the first sign-in.",
              ],
            },
            "The new centre starts with its branches, one cash payment method and the standard roles. Everything else (courses, rooms, staff, students) its CEO adds from inside, the same way as any centre; the article “Getting started” is the place to send them.",
          ],
        },
        domain: {
          title: "A centre's own address",
          body: [
            "A centre can sign in on an address of its own, for example kingston.kampus.uz, instead of the server's: the login page then carries the centre's name and logo, and the links Kampus sends its students lead to that address. Once the domain points at this server, the site owner enters the name in the centre's row (**Own address**); the certificate is issued by itself on the first visit. The server's address keeps working for every centre.",
            {
              note: "The field takes a bare host name (no https://, no slash) and one address per centre. Pointing the domain at the server is done at the domain's registrar, not in Kampus; the deployment guide has the steps.",
            },
          ],
        },
        afterwards: {
          title: "Afterwards",
          body: [
            "The list shows each centre's branches, CEO, staff and student counts; the row menu edits a centre's name and own address. Every centre signs in on the same address and sets up its own integrations: its own Telegram bot, SMS account, Payme or Click merchant and webhook secrets, since the shared webhook addresses tell centres apart by the secret or merchant credentials they present.",
            {
              note: "Nothing deletes a centre; archive its staff and students from inside if it stops using Kampus.",
            },
          ],
        },
      },
    },
    studentPortal: {
      title: "Your personal page",
      summary:
        "For students: joining video lessons, homework, materials, marks, payments and Telegram, all from one link.",
      sections: {
        link: {
          title: "Your link",
          body: [
            "Your learning centre gives you a personal link, by SMS or from your teacher. Open it in any browser on a phone, tablet or computer; there is nothing to install and no password. Save it as a bookmark or to your home screen so you find it quickly.",
            "The page greets you by name and shows your group, your teacher and four numbers: your attendance, your average grade, how many lessons were held and your coins.",
            {
              note: "The link is yours alone: it shows your marks and payments. Do not share it. If you lose it, ask your teacher for a new one; the old one then stops working.",
            },
          ],
        },
        lesson: {
          title: "Joining a video lesson",
          body: [
            {
              steps: [
                "Open your link a few minutes before the lesson. The top card shows the next lesson's time and waits for the teacher.",
                "When the teacher starts, the card changes by itself. Allow the camera and microphone when the browser asks, check your picture and press **Join lesson**.",
                "In the lesson you can turn your camera and microphone on and off, raise your hand, write in the chat and see who is there. The teacher may turn your microphone off; you can turn it back on.",
                "Press **Leave** when the lesson ends, or wait for the teacher to end it.",
              ],
            },
            "If the picture does not connect, check your internet and press **Join again**. On some networks the teacher's centre needs to switch on a relay; tell them.",
          ],
        },
        lessons: {
          title: "Lessons and schedule",
          body: [
            "The **Lessons** tab lists every lesson with its date, topic, whether you were present and your grade. The **Schedule** tab shows the days and times your group meets and until when the group runs.",
          ],
        },
        homework: {
          title: "Homework",
          body: [
            {
              steps: [
                "Open the **Homework** tab. The number on the tab is how many tasks are waiting for you.",
                "Each task shows the lesson, the text, a link or file from the teacher and the due date.",
                "Press **Answer**, write your answer and attach a file if you need to, then press **Send**.",
                "The teacher accepts the answer or returns it with a comment. A returned task comes back as “to do”; press **Answer again**.",
              ],
            },
          ],
        },
        materials: {
          title: "Materials",
          body: [
            "The **Materials** tab holds what the teacher shared: files, links and recordings of video lessons. Press **Open** to view or **Download** to keep a copy. Recordings are kept for a limited time.",
          ],
        },
        money: {
          title: "Payments",
          body: [
            "The **Payments** tab shows your balance, the monthly fee, the next payment date and every payment you made. A red line means you owe money; pay at the centre or, if **Pay online** is offered, with your card: choose the month and the amount, press **Pay with Payme** or **Pay with Click**, finish on the provider's page and come back. The payment appears here as soon as it is confirmed.",
            "**Invite a friend** shows your invite code and a link to share. When a friend signs up with it and joins a group, you get coins, and a bonus on your balance if your centre offers one. The card counts the friends who have joined.",
          ],
        },
        results: {
          title: "Results",
          body: [
            "The **Results** tab lists your exams and tests with the date, score and whether you passed. Results marked “not graded yet” will update when the teacher enters them.",
          ],
        },
        telegram: {
          title: "Telegram",
          body: [
            "Press **Connect Telegram** on your page and press Start in the bot that opens. From then on you get a reminder before each lesson, a message when the teacher starts a video lesson, homework notices, new materials and payment confirmations. Parents can connect their own phone with **Connect another phone**. Send **/stop** to the bot to disconnect.",
          ],
        },
      },
    },
  },
};
