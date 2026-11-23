/**
 * The how-to videos (A-197) as the manual knows them: which exist, in what
 * order, what their files are called and what each is named in every language.
 * The files themselves are recorded by `scripts/tutorial-videos/` and live in a
 * folder beside the app, not in the repository (A-199).
 */

/** In the order the recorder numbers them: the file of the first is `01-sign-in.mp4`. */
export const HELP_VIDEO_IDS = [
  "sign-in",
  "getting-around",
  "dashboard",
  "staff",
  "sign-in-requests",
  "courses-rooms",
  "groups",
  "timetable",
  "students",
  "leads",
  "payments",
  "attendance",
  "video-lesson",
  "homework",
  "materials-chat",
  "exams",
  "tests-coins",
  "announcements",
  "finance",
  "reports",
  "student-portal",
  "integrations",
  "assistant",
] as const;
export type HelpVideoId = (typeof HELP_VIDEO_IDS)[number];

export const HELP_VIDEO_LOCALES = ["en", "ru", "uz"] as const;
export type HelpVideoLocale = (typeof HELP_VIDEO_LOCALES)[number];

export function isHelpVideoId(value: string): value is HelpVideoId {
  return (HELP_VIDEO_IDS as readonly string[]).includes(value);
}

export function isHelpVideoLocale(value: string): value is HelpVideoLocale {
  return (HELP_VIDEO_LOCALES as readonly string[]).includes(value);
}

/** The file the recorder writes for a video, inside the folder of its language. */
export function helpVideoFile(id: HelpVideoId): string {
  return `${String(HELP_VIDEO_IDS.indexOf(id) + 1).padStart(2, "0")}-${id}.mp4`;
}

/**
 * The how-to videos recorded in the phone app, for the app's own sign-in screen
 * (A-229): the site's videos show a browser and say there is nothing to
 * install, which is not true of the app. They are asked for like the others,
 * under these names, and live in the folder `app` beside the site's videos of
 * their language.
 */
export const APP_HELP_VIDEO_IDS = ["app-sign-in", "app-student"] as const;
export type AppHelpVideoId = (typeof APP_HELP_VIDEO_IDS)[number];

export function isAppHelpVideoId(value: string): value is AppHelpVideoId {
  return (APP_HELP_VIDEO_IDS as readonly string[]).includes(value);
}

/** The file of an app video inside the folder of its language: `app/01-sign-in.mp4`. */
export function appHelpVideoFile(id: AppHelpVideoId): string {
  const number = String(APP_HELP_VIDEO_IDS.indexOf(id) + 1).padStart(2, "0");
  return `app/${number}-${id.slice("app-".length)}.mp4`;
}

/** Where the browser asks for a video. */
export function helpVideoSrc(locale: string, id: HelpVideoId): string {
  return `/api/v1/help-videos/${locale}/${id}`;
}

export interface HelpVideoText {
  title: string;
  /** One line on what the video covers. */
  note: string;
}

/**
 * Titles as the videos' own opening cards show them
 * (`scripts/tutorial-videos/words/`); a unit test keeps the two the same.
 */
export const HELP_VIDEO_TEXT: Record<HelpVideoLocale, Record<HelpVideoId, HelpVideoText>> = {
  en: {
    "sign-in": {
      title: "Signing in",
      note: "Your first sign-in with a code from Telegram, then your phone number and password.",
    },
    "getting-around": {
      title: "Finding your way around",
      note: "The menu, search, branches, languages, notifications, your account and Help.",
    },
    dashboard: {
      title: "The home page",
      note: "What the first page tells a director or administrator every morning.",
    },
    staff: {
      title: "Adding teachers and staff",
      note: "Create an account for each person, give it a role, and let them sign in with Telegram.",
    },
    "sign-in-requests": {
      title: "Sign-in requests",
      note: "What happens when someone signs in with a phone number the centre does not have yet.",
    },
    "courses-rooms": {
      title: "Courses and rooms",
      note: "Set up what the centre teaches and where, before the first group.",
    },
    groups: {
      title: "Creating a group",
      note: "A group joins a course, a teacher, a room and fixed lesson days. Its lessons then appear by themselves.",
    },
    timetable: {
      title: "Timetable and lesson changes",
      note: "See the week by room or teacher, change a group’s times, and move one lesson.",
    },
    students: {
      title: "Adding students",
      note: "A student’s card, their group and parents, and work with many students at once.",
    },
    leads: {
      title: "Leads and trial lessons",
      note: "From the first call or message to a place in a group.",
    },
    payments: {
      title: "Payments and debtors",
      note: "Take a payment, print the receipt, and follow up on those who owe.",
    },
    attendance: {
      title: "The teacher’s day: attendance and grades",
      note: "What a teacher does before and after each lesson.",
    },
    "video-lesson": {
      title: "Video lessons",
      note: "Teach online inside Kampus: the lesson link, files on screen, the whiteboard and polls.",
    },
    homework: {
      title: "Homework and checking",
      note: "Give homework for a lesson, read the answers and check them in one place.",
    },
    "materials-chat": {
      title: "Materials, class stream and chat",
      note: "Share files and links, post news to the group, and talk to the students.",
    },
    exams: {
      title: "Exams and results",
      note: "Plan an exam for a group, enter the marks, and let students see them.",
    },
    "tests-coins": {
      title: "Tests and coins",
      note: "Online tests from a bank of questions, and coins that reward good work.",
    },
    announcements: {
      title: "Announcements",
      note: "Tell the whole centre, one branch or one group something at once.",
    },
    finance: {
      title: "Finance, salaries and the cash desk",
      note: "Income and expenses, teachers’ pay, and closing the day’s cash.",
    },
    reports: {
      title: "Reports",
      note: "Payments, students who left, attendance, leads and the centre’s statistics.",
    },
    "student-portal": {
      title: "The student’s page",
      note: "How a student or parent signs in and what they find: lessons, homework, results and payments.",
    },
    integrations: {
      title: "Integrations",
      note: "Connect Telegram, SMS, online payments and the other services Kampus can work with.",
    },
    assistant: {
      title: "The AI assistant",
      note: "A daily summary of the centre and answers to questions in plain words.",
    },
  },
  ru: {
    "sign-in": {
      title: "Вход в Kampus",
      note: "Первый вход по коду из Telegram, а дальше — номер телефона и пароль.",
    },
    "getting-around": {
      title: "Как устроен Kampus",
      note: "Меню, поиск, филиалы, языки, уведомления, ваш аккаунт и справка.",
    },
    dashboard: {
      title: "Главная страница",
      note: "Что первая страница показывает директору и администратору каждое утро.",
    },
    staff: {
      title: "Преподаватели и сотрудники",
      note: "Создайте аккаунт каждому сотруднику, дайте роль — и он войдёт через Telegram.",
    },
    "sign-in-requests": {
      title: "Запросы на вход",
      note: "Что происходит, когда человек входит с номером, которого у центра ещё нет.",
    },
    "courses-rooms": {
      title: "Курсы и кабинеты",
      note: "Настройте, чему и где учит центр, до первой группы.",
    },
    groups: {
      title: "Создание группы",
      note: "Группа объединяет курс, преподавателя, кабинет и дни занятий. Уроки появляются сами.",
    },
    timetable: {
      title: "Расписание и перенос уроков",
      note: "Неделя по кабинету или преподавателю, новое время группы и перенос одного урока.",
    },
    students: {
      title: "Добавление учеников",
      note: "Карточка ученика, его группа и родители, работа сразу с несколькими учениками.",
    },
    leads: {
      title: "Лиды и пробные уроки",
      note: "От первого звонка или сообщения до места в группе.",
    },
    payments: {
      title: "Оплаты и должники",
      note: "Принять оплату, напечатать чек и работать с теми, кто должен.",
    },
    attendance: {
      title: "День преподавателя: посещаемость и оценки",
      note: "Что преподаватель делает до и после каждого урока.",
    },
    "video-lesson": {
      title: "Видеоуроки",
      note: "Онлайн-уроки прямо в Kampus: ссылка на урок, файлы на экране, доска и опросы.",
    },
    homework: {
      title: "Домашние задания и проверка",
      note: "Задайте домашнее задание к уроку, читайте ответы и проверяйте их в одном месте.",
    },
    "materials-chat": {
      title: "Материалы, лента и чат группы",
      note: "Делитесь файлами и ссылками, пишите новости группе и общайтесь с учениками.",
    },
    exams: {
      title: "Экзамены и результаты",
      note: "Назначьте экзамен группе, внесите баллы — и ученики их увидят.",
    },
    "tests-coins": {
      title: "Тесты и коины",
      note: "Онлайн-тесты из банка вопросов и коины, которыми поощряют хорошую работу.",
    },
    announcements: {
      title: "Объявления",
      note: "Сообщите что-то сразу всему центру, одному филиалу или одной группе.",
    },
    finance: {
      title: "Финансы, зарплаты и касса",
      note: "Доходы и расходы, оплата труда преподавателей и закрытие кассы за день.",
    },
    reports: {
      title: "Отчёты",
      note: "Оплаты, ушедшие ученики, посещаемость, лиды и статистика центра.",
    },
    "student-portal": {
      title: "Страница ученика",
      note: "Как входит ученик или родитель и что он видит: уроки, домашние задания, результаты и оплаты.",
    },
    integrations: {
      title: "Интеграции",
      note: "Подключите Telegram, SMS, онлайн-оплату и другие сервисы, с которыми работает Kampus.",
    },
    assistant: {
      title: "ИИ-ассистент",
      note: "Ежедневная сводка по центру и ответы на вопросы простыми словами.",
    },
  },
  uz: {
    "sign-in": {
      title: "Kampusga kirish",
      note: "Birinchi marta Telegramdan kelgan kod bilan, keyin telefon raqam va parol bilan.",
    },
    "getting-around": {
      title: "Kampus qanday tuzilgan",
      note: "Menyu, qidiruv, filiallar, tillar, bildirishnomalar, hisobingiz va yordam.",
    },
    dashboard: {
      title: "Bosh sahifa",
      note: "Birinchi sahifa direktor va administratorga har kuni ertalab nimani ko‘rsatadi.",
    },
    staff: {
      title: "O‘qituvchi va xodimlarni qo‘shish",
      note: "Har bir xodimga hisob oching, rol bering, u Telegram orqali kiradi.",
    },
    "sign-in-requests": {
      title: "Kirish so‘rovlari",
      note: "Markazda hali yo‘q telefon raqam bilan kimdir kirsa, nima bo‘ladi.",
    },
    "courses-rooms": {
      title: "Kurslar va xonalar",
      note: "Birinchi guruhdan oldin markaz nimani va qayerda o‘qitishini sozlang.",
    },
    groups: {
      title: "Guruh ochish",
      note: "Guruh kurs, o‘qituvchi, xona va dars kunlarini birlashtiradi. Darslar o‘zi paydo bo‘ladi.",
    },
    timetable: {
      title: "Dars jadvali va darsni ko‘chirish",
      note: "Hafta xona yoki o‘qituvchi bo‘yicha, guruh vaqtini o‘zgartirish va bitta darsni ko‘chirish.",
    },
    students: {
      title: "O‘quvchi qo‘shish",
      note: "O‘quvchi kartasi, guruhi va ota-onasi, bir nechta o‘quvchi bilan birdan ishlash.",
    },
    leads: {
      title: "Lidlar va sinov darslari",
      note: "Birinchi qo‘ng‘iroq yoki xabardan guruhdagi o‘ringacha.",
    },
    payments: {
      title: "To‘lovlar va qarzdorlar",
      note: "To‘lovni qabul qilish, chek chiqarish va qarzi borlar bilan ishlash.",
    },
    attendance: {
      title: "O‘qituvchining kuni: davomat va baholar",
      note: "O‘qituvchi har bir darsdan oldin va keyin nima qiladi.",
    },
    "video-lesson": {
      title: "Video darslar",
      note: "Kampusning o‘zida onlayn dars: dars havolasi, ekrandagi fayllar, doska va so‘rovnomalar.",
    },
    homework: {
      title: "Uy vazifasi va tekshirish",
      note: "Darsga uy vazifasi bering, javoblarni o‘qing va bir joyda tekshiring.",
    },
    "materials-chat": {
      title: "Materiallar, lenta va guruh chati",
      note: "Fayl va havolalarni ulashing, guruhga yangilik yozing va o‘quvchilar bilan gaplashing.",
    },
    exams: {
      title: "Imtihonlar va natijalar",
      note: "Guruhga imtihon belgilang, ballarni kiriting, o‘quvchilar ularni ko‘radi.",
    },
    "tests-coins": {
      title: "Testlar va coinlar",
      note: "Savollar bankidan onlayn testlar va yaxshi ishni rag‘batlantiradigan coinlar.",
    },
    announcements: {
      title: "E’lonlar",
      note: "Butun markazga, bitta filialga yoki bitta guruhga birdan xabar bering.",
    },
    finance: {
      title: "Moliya, maoshlar va kassa",
      note: "Daromad va xarajatlar, o‘qituvchilar maoshi va kunlik kassani yopish.",
    },
    reports: {
      title: "Hisobotlar",
      note: "To‘lovlar, ketgan o‘quvchilar, davomat, lidlar va markaz statistikasi.",
    },
    "student-portal": {
      title: "O‘quvchining sahifasi",
      note: "O‘quvchi yoki ota-ona qanday kiradi va nimani ko‘radi: darslar, uy vazifasi, natijalar va to‘lovlar.",
    },
    integrations: {
      title: "Integratsiyalar",
      note: "Telegram, SMS, onlayn to‘lov va Kampus ishlaydigan boshqa xizmatlarni ulang.",
    },
    assistant: {
      title: "AI yordamchi",
      note: "Markaz bo‘yicha kunlik xulosa va savollarga oddiy so‘zlar bilan javoblar.",
    },
  },
};

/** The title and note of a video in `locale`, in English where the language has no videos. */
export function helpVideoText(locale: string, id: HelpVideoId): HelpVideoText {
  return HELP_VIDEO_TEXT[isHelpVideoLocale(locale) ? locale : "en"][id];
}
