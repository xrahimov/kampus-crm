/**
 * The English captions of the tutorial videos: per video a title, one line
 * under it for the opening card, and the caption of every step. `{a.b}` is
 * replaced by that label from `messages/en.json`, so a caption always names a
 * button the way the page does. Keep a caption under about 150 characters: it
 * has to fit two lines of the band.
 */
export const en = {
  series: "Kampus how-to",
  videos: {
    "sign-in": {
      title: "Signing in",
      note: "Your first sign-in with a code from Telegram, then your phone number and password.",
      steps: {
        page: "This is the sign-in page of your centre. Teachers, administrators and managers all come in here.",
        phone:
          "The first time, you sign in through Telegram. Type your phone number and press “{auth.getCode}”.",
        bot: "In Telegram, open the bot named on the page, press Start, then “Share my number”. This is needed only once.",
        code: "The bot sends you a six-digit code. Type it here and press “{auth.confirmCode}”.",
        password:
          "Kampus now offers you a password of your own. Type it twice and press “{auth.savePassword}”.",
        inside: "You are in. Which pages you see depends on your role at the centre.",
        out: "To leave, open the menu with your name and press “{auth.signOut}”.",
        again:
          "From now on your phone number and password are enough. A Telegram code still works if you forget the password.",
      },
    },
    "getting-around": {
      title: "Finding your way around",
      note: "The menu, search, branches, languages, notifications, your account and Help.",
      steps: {
        menu: "The menu on the left opens every part of Kampus. You only see the pages your role is allowed to use.",
        open: "Press a name in the menu to open that page: here {nav.groups}, then {nav.students}.",
        search:
          "The search box on top finds a student, a lead or a group from any page. Type a few letters of the name.",
        branch: "A centre with several branches chooses here which branch the pages show.",
        language:
          "Here you switch between Uzbek, Russian and English. Each person chooses their own language.",
        bell: "The bell shows what needs your attention: new leads, answers to check, payments.",
        account:
          "Under your name you find “{account.title}”: your details, your password and the devices you are signed in on.",
        help: "“{help.nav}” at the bottom of the menu explains every page with pictures, in your language.",
      },
    },
    dashboard: {
      title: "The home page",
      note: "What the first page tells a director or administrator every morning.",
      steps: {
        home: "After sign-in, directors and administrators land on {nav.dashboard}: the state of the centre on one page.",
        setup:
          "A new centre sees a checklist of first steps here: branches, courses, rooms, staff, groups and students.",
        eye: "Figures with money stay hidden until you press the eye, so nobody reads them over your shoulder.",
        forecast:
          "The forecast shows how much is expected this month and how much of it is already collected.",
        schedule:
          "Today’s lessons are laid out by room and hour. Press a lesson to open its group.",
        back: "Further down are income and expenses by month. The same page works on a phone.",
      },
    },
    staff: {
      title: "Adding teachers and staff",
      note: "Create an account for each person, give it a role, and let them sign in with Telegram.",
      steps: {
        list: "Everyone who works at the centre has an account under {nav.settings} → {settings.nav.staff}.",
        add: "Press “{staff.form.addStaff}”, then type the person’s full name and the phone number they use in Telegram.",
        role: "Choose a role. The role decides which pages the person sees: a teacher sees their groups, a cashier sees payments.",
        password:
          "Leave the password empty. The person’s first sign-in is a code from Telegram, and they choose a password themselves.",
        save: "Press “{common.save}”. The account is ready: tell the person the address of your Kampus.",
        teachers:
          "Teachers also have their own page, {nav.teachers}, with each teacher’s groups, working hours and salary.",
        roles:
          "Under {settings.nav.roles} you see what each role may do, and you can make a role of your own.",
      },
    },
    "sign-in-requests": {
      title: "Sign-in requests",
      note: "What happens when someone signs in with a phone number the centre does not have yet.",
      steps: {
        unknown:
          "A student or parent whose number is not in Kampus can still ask for a Telegram code. They then wait to be let in.",
        banner:
          "You see it on the {nav.students} page: a line says how many people wait. Press it.",
        list: "Each request shows the name, the phone number proven by Telegram, the branch and a note from the person.",
        approve:
          "Press “{joinRequests.approve}” and say who this is: a new student, a student you already have, or a parent.",
        group: "For a new student you can choose the group right away.",
        letIn:
          "Press “{joinRequests.approve}” once more. The bot tells the person in Telegram, and they can sign in.",
        declined: "A request you decline moves to this tab. You can still let the person in later.",
        teachers: "Teachers see these requests too when the centre lets teachers add students.",
      },
    },
    "courses-rooms": {
      title: "Courses and rooms",
      note: "Set up what the centre teaches and where, before the first group.",
      steps: {
        settings:
          "Everything a centre sets up once lives under {nav.settings}: branches, courses, rooms, payment methods and more.",
        courses:
          "A course is what you teach: its name, how many months it lasts and its price per month.",
        addCourse:
          "Press “{settings.courses.add}”. Type the name, the length in months and the monthly price.",
        saveCourse:
          "Press “{common.save}”. Groups of this course take its price, and you can still change it for one group or one student.",
        rooms: "Now the rooms. Open “{settings.nav.rooms}” in the settings menu.",
        addRoom:
          "Press “{settings.rooms.add}” and add each room with its number of seats. Kampus then warns you when two groups want the same room at the same time.",
        more: "In the same menu you add branches, payment methods, schools and the reasons students leave.",
      },
    },
    groups: {
      title: "Creating a group",
      note: "A group joins a course, a teacher, a room and fixed lesson days. Its lessons then appear by themselves.",
      steps: {
        list: "{nav.groups} lists every class of the centre with its course, teacher, days and number of students.",
        add: "Press “{groups.add}”. Give the group a name and choose its course.",
        days: "Choose the lesson days: odd days, even days, every day, or your own days. Then set when a lesson starts and ends.",
        room: "Choose the room. A room that is busy at that hour is pointed out before you save.",
        teacher:
          "Press “{groups.form.addTeacher}” and choose who teaches the group. A group can have a second or support teacher too.",
        start: "Set the day of the first lesson and press “{common.save}”.",
        open: "The group is ready. Its lessons are in the timetable from the first day on: you never add lessons one by one.",
        member:
          "Now the students. Press “{groups.members.add}”, type a few letters of the name and choose the student.",
        joined: "Set the day the student joins. Payments are counted from that day.",
        tabs: "The tabs of the group hold attendance, grades, homework, materials, chat and the history of changes.",
      },
    },
    timetable: {
      title: "Timetable and lesson changes",
      note: "See the week by room or teacher, change a group’s times, and move one lesson.",
      steps: {
        week: "{nav.timetable} shows the week of one room or one teacher. Each block is a group’s lesson.",
        pick: "Choose another room here. The page can also show the week of one teacher.",
        group: "Press a block to open its group. The schedule card shows the days and times.",
        times:
          "To change the times for good, press “{groups.detail.changeSchedule}” and set the new start and end.",
        from: "The new times count from today. Lessons already held keep their attendance and grades, and students can be told in Telegram.",
        saveTimes:
          "Press “{common.save}”. The timetable, the teacher’s day and the students’ pages all change together.",
        dayOff: "For one lesson only, open the group’s menu and choose “{groups.detail.dayOff}”.",
        move: "Choose the lesson’s date and write the reason. To hold the lesson at another time, switch on “{groups.detail.moveLesson}”.",
        moveTo:
          "Set the new date and time and save. Students see the change on their page; a cancelled lesson is not charged.",
      },
    },
    students: {
      title: "Adding students",
      note: "A student’s card, their group and parents, and work with many students at once.",
      steps: {
        list: "{nav.students} lists everyone who studies at the centre, with their groups, balance and phone number.",
        add: "Press “{students.add}”. Type the full name and the phone number the student uses in Telegram.",
        group:
          "Open the group section to put the student into a group right away, and set the day they join.",
        parent:
          "Add a parent with their phone number. Parents can then follow the child from their own page.",
        save: "Press “{common.save}”. Kampus opens the student’s card.",
        profile:
          "The card shows the groups, the balance and the calendar of lessons. Payments are taken from here too.",
        tabs: "The tabs hold parents, notes, exam results, messages sent and the full history of the card.",
        many: "Back in the list, tick several students to add them to a group, send an SMS or give a discount in one go.",
        import:
          "A centre that moves to Kampus can load its students, parents and balances from an Excel file.",
      },
    },
    leads: {
      title: "Leads and trial lessons",
      note: "From the first call or message to a place in a group.",
      steps: {
        board:
          "{nav.leads} is a board. Each column is a stage, and each card is a person who asked about your courses.",
        add: "Press “{leads.add}” in a column. Type the name and phone number, and choose where the person heard about you.",
        save: "Press “{common.save}”. The card appears in the column.",
        move: "After you speak to the person, open the card’s menu and move it to the next stage.",
        trial:
          "To invite the person to a trial lesson, choose “{leads.trial.book}” in the same menu, then the group and the day.",
        trialSave:
          "The card now shows the trial. The teacher sees the guest on that day and marks whether they came.",
        toGroup:
          "When the person decides to study, tick the card and press this button. The lead becomes a student of the group.",
        calls: "This page lists the people you promised to call today, so no lead is forgotten.",
        sources:
          "The sources report shows which channel brings the most leads: Instagram, Telegram, friends or your website.",
        form: "A form like this can stand on your website or in your Instagram profile. Whoever fills it in lands on the board.",
      },
    },
    payments: {
      title: "Payments and debtors",
      note: "Take a payment, print the receipt, and follow up on those who owe.",
      steps: {
        student:
          "Open the student’s card. Next to each group you see the balance: what is paid and what is owed.",
        open: "Press “{payments.pay}”. The window shows the balance for the group and the month.",
        amount:
          "Choose how the student pays. This button fills in exactly what is owed; you can also type another amount.",
        save: "Press “{common.save}”. The receipt opens, ready to print or to send to the parent.",
        history: "The payment is on the card at once, with the date, the amount and the method.",
        anywhere:
          "The “{payments.pay}” button on top works from any page: type the student’s name and take the payment.",
        debtors:
          "{nav.debts} lists everyone who owes, with the amount and the days since the payment was due.",
        remind:
          "For each debtor you can note a call and the day they promised to pay, or send a reminder.",
        log: "Every payment of the centre is in the payments log, with totals and an Excel file.",
      },
    },
    attendance: {
      title: "The teacher’s day: attendance and grades",
      note: "What a teacher does before and after each lesson.",
      steps: {
        day: "A teacher lands on {nav.today}: the day’s lessons, each with its students.",
        present: "At the start of a lesson, one press marks everybody present.",
        absent: "Then press the name of anyone who is missing. Press again to change it back.",
        homework:
          "Write the homework under the lesson. Students see it on their page straight away.",
        group:
          "Press the group’s name to open the group. The attendance tab shows the whole month.",
        cell: "Any cell can be changed here: present, absent, or late with a note.",
        grades: "On the grades tab, type a mark for the lesson next to each student.",
        phone:
          "All of this works on a phone too, so attendance can be marked right in the classroom.",
      },
    },
    "video-lesson": {
      title: "Video lessons",
      note: "Teach online inside Kampus: the lesson link, files on screen, the whiteboard and polls.",
      steps: {
        card: "Every group has a video lesson card. No other program is needed, only the browser.",
        start: "Press the start button, check your camera and microphone, and enter the room.",
        link: "Press “{video.room.copyLink}” and send the link to the group’s chat. Students join with one tap.",
        student:
          "A student opens the link on a phone, signs in the first time, and joins the lesson.",
        room: "You see everyone who joined. A raised hand shows on the student’s picture.",
        chat: "The chat is for short messages during the lesson.",
        file: "Open the lesson panel and show a file from the group’s materials. Everyone sees the same page as you.",
        pen: "With the pen you draw on the page, and the students see it at once.",
        board: "The whiteboard is an empty page for drawing and explaining.",
        poll: "A poll asks the whole class one question. The answers are counted as they arrive.",
        end: "When you end the lesson, attendance is filled in from who joined, and the lesson is saved in the group.",
      },
    },
    homework: {
      title: "Homework and checking",
      note: "Give homework for a lesson, read the answers and check them in one place.",
      steps: {
        tab: "The homework tab of a group lists every task with how many students have answered.",
        add: "Press “{groups.homework.add}” and choose the lesson the homework belongs to.",
        text: "Write the task and press “{common.save}”. A file or an audio task can be attached too.",
        student:
          "Students see the task on their page and answer there with text, a photo, a file or a voice recording.",
        checking:
          "All answers that wait for you are under {nav.checking}, from all your groups. The number in the menu shows how many.",
        accept:
          "Read the answer and accept it. The student gets the coins your centre gives for homework.",
        return: "An answer that needs more work goes back to the student with your comment.",
        coins: "Parents see in Telegram whether the homework was done.",
      },
    },
    "materials-chat": {
      title: "Materials, class stream and chat",
      note: "Share files and links, post news to the group, and talk to the students.",
      steps: {
        materials:
          "The materials tab keeps the group’s files and links: slides, worksheets, videos.",
        add: "Press “{groups.materials.add}”. Choose a file or a link, give it a title, and paste the address.",
        save: "Press “{common.save}”. Students find it under Materials on their page, and you can show it in a video lesson.",
        stream: "The stream is the group’s notice board. Write a post for everybody in the group.",
        comments: "Students can comment under a post. A post can be pinned to stay on top.",
        chat: "The chat is for quick questions. Everybody in the group reads it.",
        where: "Students see the stream and the chat on their own page, on a phone or a computer.",
      },
    },
    exams: {
      title: "Exams and results",
      note: "Plan an exam for a group, enter the marks, and let students see them.",
      steps: {
        list: "{nav.exams} lists the exams of the centre: tests for one group and mock exams anyone can sign up for.",
        add: "Press “{exams.add}”. Give the exam a name and choose the group.",
        marks: "Set the date, the highest mark and the mark needed to pass.",
        save: "Press “{common.save}”. The exam is now on the list and on the students’ pages.",
        results: "After the exam, open it and type each student’s mark.",
        saveResults:
          "Save the results. Kampus shows who passed and adds the marks to each student’s card.",
        mock: "A mock exam is open to several groups or to guests, with a price and a number of seats.",
        student: "Students and parents see the result on their page as soon as it is saved.",
      },
    },
    "tests-coins": {
      title: "Tests and coins",
      note: "Online tests from a bank of questions, and coins that reward good work.",
      steps: {
        tests:
          "Under tests you build online tests. Students take them on their page, and Kampus marks them by itself.",
        bank: "Questions live in a bank, sorted by subject and topic, so one question can be used in many tests.",
        question: "A new question has its text, the answer options and the right answer.",
        portal: "A test is given to a group with a date. Each student’s attempt and mark are kept.",
        rules: "Coins reward students. Here you set how many coins each thing is worth.",
        auto: "Coins can be given automatically: for attendance, for homework handed in, for a good test.",
        report:
          "The coins report shows who has earned and spent the most. Students can spend coins on the prizes you list.",
      },
    },
    announcements: {
      title: "Announcements",
      note: "Tell the whole centre, one branch or one group something at once.",
      steps: {
        list: "{nav.announcements} is where the centre speaks to its students and parents.",
        new: "Press “{announcements.new}” and choose who it is for: the whole centre, a branch or one group.",
        write: "Write a short title and the message.",
        sms: "Switch this on to send it as an SMS as well. Without it, people see it on their page and in Telegram.",
        send: "Press “{announcements.dialog.submit}”. The announcement is out.",
        reads: "The list shows how many people have read each announcement.",
      },
    },
    finance: {
      title: "Finance, salaries and the cash desk",
      note: "Income and expenses, teachers’ pay, and closing the day’s cash.",
      steps: {
        overview:
          "{nav.finance} shows income, expenses and profit for the month or year you choose.",
        expense:
          "Student payments arrive here by themselves. Other money you enter: choose a category, the amount and a note.",
        saveExpense: "Press “{common.save}”. The totals and the charts change at once.",
        charts: "The charts show where the money comes from and where it goes.",
        payroll:
          "Salaries are counted by each person’s method: a fixed sum, per lesson, per student or a share of payments.",
        salary:
          "For each month you see every person’s lessons and amount. Check it, correct a line if needed, and save.",
        cash: "At the end of the day the cashier presses “{cashdesk.closeDay}”. Kampus shows how much cash should be in the desk.",
        count: "Type what you counted. A difference is shown at once and stays in the record.",
      },
    },
    reports: {
      title: "Reports",
      note: "Payments, students who left, attendance, leads and the centre’s statistics.",
      steps: {
        index: "{nav.reports} gathers the numbers a director asks about most.",
        payments:
          "The payments report: choose the month and the branch, and see the total, what was paid on time and late, discounts and refunds.",
        staff: "The same report shows how much each teacher’s groups brought in.",
        churn:
          "This report shows who left, when and why, so you can see what makes students leave.",
        students: "The students report covers attendance and results, group by group.",
        leads:
          "The leads report shows how many leads came, from where, and how many became students.",
        statistics:
          "The statistics page shows how full your rooms are: free hours, free seats, and what full rooms would bring in.",
        excel: "Every report can be downloaded as an Excel file with the same filters.",
      },
    },
    "student-portal": {
      title: "The student’s page",
      note: "How a student or parent signs in and what they find: lessons, homework, results and payments.",
      steps: {
        address:
          "Students and parents have their own sign-in page. It works on any phone, with nothing to install.",
        phone: "The first time, the student types their phone number and presses “{auth.getCode}”.",
        code: "The bot sends a code in Telegram. With it the student is in.",
        password: "A password can be chosen now or later. With it, the next sign-in needs no code.",
        home: "The student’s home shows their groups. A lesson that is on right now can be joined from here.",
        lesson: "The group’s page shows the next lesson, the timetable and what was done in class.",
        homework:
          "Under homework the student reads the task and sends the answer: text, a photo or a voice recording.",
        materials: "Materials and the group chat are one tap away.",
        results:
          "Results show grades, exams and attendance, so parents always know how the child is doing.",
        money:
          "The page shows what is paid and what is owed. With Payme or Click connected, parents pay from here.",
        parents:
          "A parent with several children at the centre sees all of them on one family page.",
      },
    },
    integrations: {
      title: "Integrations",
      note: "Connect Telegram, SMS, online payments and the other services Kampus can work with.",
      steps: {
        page: "Under {nav.settings} → {settings.nav.integrations} the director connects outside services. Each one has its own card.",
        telegram:
          "Telegram first: with a bot, Kampus sends sign-in codes, lesson reminders and weekly reports to parents.",
        sms: "For SMS, enter the details from your SMS provider. Then reminders and announcements can go out as SMS.",
        payments:
          "With Payme or Click connected, parents pay from the student’s page and the payment is recorded by itself.",
        video: "Video lessons work out of the box. This card holds the settings for recordings.",
        others:
          "Further down are amoCRM, telephony, FaceID, fiscal receipts and the AI assistant’s key.",
        bot: "On the bot page you choose who gets which Telegram message: the director, a branch manager, a cashier.",
      },
    },
    assistant: {
      title: "The AI assistant",
      note: "A daily summary of the centre and answers to questions in plain words.",
      steps: {
        button: "This round button is on every page for the centre’s staff.",
        summary:
          "It opens with a summary of the day: lessons, payments, debts, and what needs attention.",
        ask: "On the chat tab you ask a question. The suggestions are a good place to start.",
        type: "Or type your own question in your language and send it. The assistant answers from your centre’s data.",
        page: "{nav.assistant} in the menu opens the same assistant on a full page.",
        key: "It needs an API key, entered once under {nav.settings} → {settings.nav.integrations}. The assistant only reads: it changes nothing, and students and parents never see it.",
      },
    },
  },
};
