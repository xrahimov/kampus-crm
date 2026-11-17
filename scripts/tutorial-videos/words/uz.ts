import type { Words } from "./index";

/** Uzbek captions of the tutorial videos. See `en.ts` for how `{a.b}` labels work. */
export const uz: Words = {
  series: "Kampus: qanday qilinadi",
  videos: {
    "sign-in": {
      title: "Kampusga kirish",
      note: "Birinchi marta Telegramdan kelgan kod bilan, keyin telefon raqam va parol bilan.",
      steps: {
        page: "Bu markazingizning kirish sahifasi. O‘qituvchilar, administratorlar va rahbarlar shu yerdan kiradi.",
        phone:
          "Birinchi marta Telegram orqali kirasiz. Telefon raqamingizni yozing va “{auth.getCode}” tugmasini bosing.",
        bot: "Telegramda sahifada ko‘rsatilgan botni oching, Start ni, keyin “Raqamimni yuborish” tugmasini bosing. Bu faqat bir marta kerak.",
        code: "Bot olti xonali kod yuboradi. Uni shu yerga yozing va “{auth.confirmCode}” tugmasini bosing.",
        password:
          "Endi Kampus o‘z parolingizni tanlashni taklif qiladi. Uni ikki marta yozing va “{auth.savePassword}” tugmasini bosing.",
        inside: "Siz kirdingiz. Qaysi sahifalarni ko‘rishingiz markazdagi rolingizga bog‘liq.",
        out: "Chiqish uchun ismingiz yozilgan menyuni oching va “{auth.signOut}” tugmasini bosing.",
        again:
          "Bundan keyin telefon raqam va parol yetarli. Parolni unutsangiz, Telegram kodi bilan ham kirsa bo‘ladi.",
      },
    },
    "getting-around": {
      title: "Kampus qanday tuzilgan",
      note: "Menyu, qidiruv, filiallar, tillar, bildirishnomalar, hisobingiz va yordam.",
      steps: {
        menu: "Chapdagi menyu Kampusning barcha bo‘limlarini ochadi. Siz faqat rolingizga ruxsat berilgan sahifalarni ko‘rasiz.",
        open: "Sahifani ochish uchun menyudagi nomini bosing: mana “{nav.groups}”, mana “{nav.students}”.",
        search:
          "Yuqoridagi qidiruv istalgan sahifadan o‘quvchi, lid yoki guruhni topadi. Ismning bir necha harfini yozing.",
        branch:
          "Markazda bir nechta filial bo‘lsa, qaysi filial ko‘rsatilishini shu yerda tanlaysiz.",
        language:
          "Tilni shu yerda almashtirasiz: o‘zbekcha, ruscha yoki inglizcha. Har kim o‘z tilini tanlaydi.",
        bell: "Qo‘ng‘iroqcha e’tibor talab qiladigan narsalarni ko‘rsatadi: yangi lidlar, tekshiriladigan javoblar, to‘lovlar.",
        account:
          "Ismingiz ostida “{account.title}” bor: ma’lumotlaringiz, parolingiz va kirgan qurilmalaringiz.",
        help: "Menyu pastidagi “{help.nav}” har bir sahifani rasmlar bilan, o‘z tilingizda tushuntiradi.",
      },
    },
    dashboard: {
      title: "Bosh sahifa",
      note: "Birinchi sahifa direktor va administratorga har kuni ertalab nimani ko‘rsatadi.",
      steps: {
        home: "Kirgandan so‘ng direktor va administrator “{nav.dashboard}” sahifasiga tushadi: markaz holati bitta ekranda.",
        setup:
          "Yangi markaz bu yerda birinchi qadamlar ro‘yxatini ko‘radi: filiallar, kurslar, xonalar, xodimlar, guruhlar va o‘quvchilar.",
        eye: "Pulga oid raqamlar ko‘z belgisini bosmaguningizcha yashirin turadi, begona ko‘z o‘qimasligi uchun.",
        forecast:
          "Prognoz bu oyda qancha tushum kutilayotganini va shundan qanchasi yig‘ilganini ko‘rsatadi.",
        schedule:
          "Bugungi darslar xonalar va soatlar bo‘yicha joylashgan. Guruhini ochish uchun darsni bosing.",
        back: "Pastroqda oylar bo‘yicha daromad va xarajatlar. Shu sahifa telefonda ham ishlaydi.",
      },
    },
    staff: {
      title: "O‘qituvchi va xodimlarni qo‘shish",
      note: "Har bir xodimga hisob oching, rol bering, u Telegram orqali kiradi.",
      steps: {
        list: "Markazda ishlaydigan har bir kishining hisobi bor: “{nav.settings}” → “{settings.nav.staff}”.",
        add: "“{staff.form.addStaff}” tugmasini bosing, ism-familiyani va Telegramda ishlatiladigan telefon raqamni yozing.",
        role: "Rolni tanlang. Rol kishi qaysi sahifalarni ko‘rishini belgilaydi: o‘qituvchi o‘z guruhlarini, kassir to‘lovlarni ko‘radi.",
        password:
          "Parolni bo‘sh qoldiring. Birinchi kirish Telegram kodi bilan bo‘ladi, parolni xodim o‘zi tanlaydi.",
        save: "“{common.save}” tugmasini bosing. Hisob tayyor: xodimga Kampus manzilingizni ayting.",
        teachers:
          "O‘qituvchilarning o‘z sahifasi ham bor, “{nav.teachers}”: har birining guruhlari, ish vaqti va maoshi.",
        roles:
          "“{settings.nav.roles}” bo‘limida har bir rolga nima ruxsat berilgani ko‘rinadi. O‘z rolingizni ham yaratishingiz mumkin.",
      },
    },
    "sign-in-requests": {
      title: "Kirish so‘rovlari",
      note: "Markazda hali yo‘q telefon raqam bilan kimdir kirsa, nima bo‘ladi.",
      steps: {
        unknown:
          "Raqami Kampusda yo‘q o‘quvchi yoki ota-ona ham Telegram kodini so‘rashi mumkin. Keyin u ruxsat berilishini kutadi.",
        banner:
          "Buni “{nav.students}” sahifasida ko‘rasiz: qator necha kishi kutayotganini aytadi. Uni bosing.",
        list: "Har bir so‘rovda ism, Telegram orqali tasdiqlangan telefon raqam, filial va kishining izohi bor.",
        approve:
          "“{joinRequests.approve}” tugmasini bosing va bu kimligini ayting: yangi o‘quvchi, mavjud o‘quvchi yoki ota-ona.",
        group: "Yangi o‘quvchiga guruhni darhol tanlash mumkin.",
        letIn:
          "“{joinRequests.approve}” tugmasini yana bir marta bosing. Bot kishiga Telegramda xabar beradi va u kira oladi.",
        declined: "Rad etilgan so‘rov shu varaqqa o‘tadi. Kishini keyinroq ham kiritish mumkin.",
        teachers:
          "Markaz o‘qituvchilarga o‘quvchi qo‘shishga ruxsat bergan bo‘lsa, ular ham bu so‘rovlarni ko‘radi.",
      },
    },
    "courses-rooms": {
      title: "Kurslar va xonalar",
      note: "Birinchi guruhdan oldin markaz nimani va qayerda o‘qitishini sozlang.",
      steps: {
        settings:
          "Markaz bir marta sozlaydigan hamma narsa “{nav.settings}” bo‘limida: filiallar, kurslar, xonalar, to‘lov usullari.",
        courses: "Kurs — siz o‘qitadigan narsa: nomi, necha oy davom etishi va oylik narxi.",
        addCourse:
          "“{settings.courses.add}” tugmasini bosing. Nomini, davomiyligini oylarda va oylik narxini yozing.",
        saveCourse:
          "“{common.save}” tugmasini bosing. Shu kurs guruhlari uning narxini oladi; bitta guruh yoki o‘quvchi uchun o‘zgartirsa bo‘ladi.",
        rooms: "Endi xonalar. Sozlamalar menyusida “{settings.nav.rooms}” ni oching.",
        addRoom:
          "“{settings.rooms.add}” tugmasini bosing va har bir xonani o‘rinlar soni bilan qo‘shing. Ikki guruh bitta xonaga tushsa, Kampus ogohlantiradi.",
        more: "Shu menyuda filiallar, to‘lov usullari, maktablar va o‘quvchilarning ketish sabablari qo‘shiladi.",
      },
    },
    groups: {
      title: "Guruh ochish",
      note: "Guruh kurs, o‘qituvchi, xona va dars kunlarini birlashtiradi. Darslar o‘zi paydo bo‘ladi.",
      steps: {
        list: "“{nav.groups}” bo‘limida markazning barcha guruhlari: kursi, o‘qituvchisi, kunlari va o‘quvchilar soni.",
        add: "“{groups.add}” tugmasini bosing. Guruhga nom bering va kursini tanlang.",
        days: "Dars kunlarini tanlang: toq kunlar, juft kunlar, har kuni yoki o‘z kunlaringiz. Keyin dars boshlanishi va tugashini belgilang.",
        room: "Xonani tanlang. Agar u shu vaqtda band bo‘lsa, saqlashdan oldin bilib olasiz.",
        teacher:
          "“{groups.form.addTeacher}” tugmasini bosing va guruhga kim dars berishini tanlang. Ikkinchi yoki yordamchi o‘qituvchi ham qo‘shsa bo‘ladi.",
        start: "Birinchi dars kunini belgilang va “{common.save}” tugmasini bosing.",
        open: "Guruh tayyor. Darslari birinchi kundan boshlab jadvalda turibdi: ularni bittalab qo‘shish kerak emas.",
        member:
          "Endi o‘quvchilar. “{groups.members.add}” tugmasini bosing, ismning bir necha harfini yozing va o‘quvchini tanlang.",
        joined: "O‘quvchi guruhga qo‘shiladigan kunni belgilang. To‘lov shu kundan hisoblanadi.",
        tabs: "Guruh varaqlarida davomat, baholar, uy vazifalari, materiallar, chat va o‘zgarishlar tarixi bor.",
      },
    },
    timetable: {
      title: "Dars jadvali va darsni ko‘chirish",
      note: "Hafta xona yoki o‘qituvchi bo‘yicha, guruh vaqtini o‘zgartirish va bitta darsni ko‘chirish.",
      steps: {
        week: "“{nav.timetable}” bitta xona yoki bitta o‘qituvchining haftasini ko‘rsatadi. Har bir blok — guruhning darsi.",
        pick: "Boshqa xonani shu yerda tanlaysiz. Bitta o‘qituvchining haftasini ham ko‘rish mumkin.",
        group: "Guruhni ochish uchun blokni bosing. Jadval kartasida kunlar va vaqtlar ko‘rinadi.",
        times:
          "Vaqtni butunlay o‘zgartirish uchun “{groups.detail.changeSchedule}” tugmasini bosing va yangi boshlanish hamda tugashni belgilang.",
        from: "Yangi vaqt bugundan boshlab amal qiladi. O‘tgan darslarning davomati va baholari saqlanadi, o‘quvchilarga Telegramda xabar berish mumkin.",
        saveTimes:
          "“{common.save}” tugmasini bosing. Jadval, o‘qituvchining kuni va o‘quvchilar sahifalari birga o‘zgaradi.",
        dayOff:
          "Faqat bitta dars uchun guruh menyusini oching va “{groups.detail.dayOff}” ni tanlang.",
        move: "Dars sanasini va sababini yozing. Darsni boshqa vaqtda o‘tish uchun “{groups.detail.moveLesson}” ni yoqing.",
        moveTo:
          "Yangi sana va vaqtni belgilab saqlang. O‘quvchilar o‘zgarishni o‘z sahifasida ko‘radi; bekor qilingan dars uchun pul olinmaydi.",
      },
    },
    students: {
      title: "O‘quvchi qo‘shish",
      note: "O‘quvchi kartasi, guruhi va ota-onasi, bir nechta o‘quvchi bilan birdan ishlash.",
      steps: {
        list: "“{nav.students}” bo‘limida markazda o‘qiydigan hamma bor: guruhlari, balansi va telefon raqami.",
        add: "“{students.add}” tugmasini bosing. Ism-familiyani va o‘quvchi Telegramda ishlatadigan telefon raqamni yozing.",
        group:
          "O‘quvchini darhol guruhga yozish uchun guruh bo‘limini oching va qo‘shiladigan kunini belgilang.",
        parent:
          "Ota-onani telefon raqami bilan qo‘shing. Ota-ona farzandini o‘z sahifasidan kuzatib boradi.",
        save: "“{common.save}” tugmasini bosing. Kampus o‘quvchining kartasini ochadi.",
        profile:
          "Kartada guruhlar, balans va darslar kalendari bor. To‘lov ham shu yerdan qabul qilinadi.",
        tabs: "Varaqlarda ota-onalar, izohlar, imtihon natijalari, yuborilgan xabarlar va kartaning to‘liq tarixi bor.",
        many: "Ro‘yxatda bir nechta o‘quvchini belgilab, ularni birdan guruhga qo‘shish, SMS yuborish yoki chegirma berish mumkin.",
        import:
          "Kampusga o‘tayotgan markaz o‘quvchilar, ota-onalar va balanslarni Excel faylidan yuklashi mumkin.",
      },
    },
    leads: {
      title: "Lidlar va sinov darslari",
      note: "Birinchi qo‘ng‘iroq yoki xabardan guruhdagi o‘ringacha.",
      steps: {
        board:
          "“{nav.leads}” — bu doska. Har bir ustun — bosqich, har bir karta — kurslaringiz haqida so‘ragan kishi.",
        add: "Ustundagi “{leads.add}” tugmasini bosing. Ism va telefon raqamni yozing, kishi siz haqingizda qayerdan bilganini tanlang.",
        save: "“{common.save}” tugmasini bosing. Karta ustunda paydo bo‘ladi.",
        move: "Kishi bilan gaplashgach, karta menyusini oching va uni keyingi bosqichga o‘tkazing.",
        trial:
          "Sinov darsiga taklif qilish uchun shu menyuda “{leads.trial.book}” ni, keyin guruh va kunni tanlang.",
        trialSave:
          "Endi kartada sinov darsi ko‘rinadi. O‘qituvchi o‘sha kuni mehmonni ko‘radi va kelgan-kelmaganini belgilaydi.",
        toGroup:
          "Kishi o‘qishga qaror qilganda, kartani belgilang va shu tugmani bosing. Lid guruh o‘quvchisiga aylanadi.",
        calls:
          "Bu sahifada bugun qo‘ng‘iroq qilishga va’da bergan kishilaringiz turadi. Birorta lid unutilmaydi.",
        sources:
          "Manbalar hisoboti lidlar qayerdan ko‘proq kelishini ko‘rsatadi: Instagram, Telegram, tanishlar yoki saytingiz.",
        form: "Bunday formani saytingizga yoki Instagram profilingizga qo‘yish mumkin. Uni to‘ldirgan kishi doskaga tushadi.",
      },
    },
    payments: {
      title: "To‘lovlar va qarzdorlar",
      note: "To‘lovni qabul qilish, chek chiqarish va qarzi borlar bilan ishlash.",
      steps: {
        student:
          "O‘quvchining kartasini oching. Har bir guruh yonida balans ko‘rinadi: nima to‘langan va nima qolgan.",
        open: "“{payments.pay}” tugmasini bosing. Oynada guruh va oy bo‘yicha balans ko‘rinadi.",
        amount:
          "To‘lov usulini tanlang. Bu tugma aynan qarz summasini qo‘yadi; boshqa summani ham yozsa bo‘ladi.",
        save: "“{common.save}” tugmasini bosing. Chek ochiladi: uni chop etish yoki ota-onaga yuborish mumkin.",
        history: "To‘lov darhol kartada ko‘rinadi: sanasi, summasi va to‘lov turi.",
        anywhere:
          "Yuqoridagi “{payments.pay}” tugmasi istalgan sahifadan ishlaydi: o‘quvchi ismini yozing va to‘lovni qabul qiling.",
        debtors:
          "“{nav.debts}” bo‘limida qarzi bor hamma turadi: summasi va to‘lov muddatidan necha kun o‘tgani.",
        remind:
          "Har bir qarzdor bo‘yicha qo‘ng‘iroqni va to‘lashga va’da bergan kunini yozib qo‘yish yoki eslatma yuborish mumkin.",
        log: "Markazning barcha to‘lovlari to‘lovlar jurnalida, jami summalar va Excel fayli bilan.",
      },
    },
    attendance: {
      title: "O‘qituvchining kuni: davomat va baholar",
      note: "O‘qituvchi har bir darsdan oldin va keyin nima qiladi.",
      steps: {
        day: "O‘qituvchi “{nav.today}” sahifasiga tushadi: kunning darslari va har bir darsning o‘quvchilari.",
        present: "Dars boshida bir marta bosib, hammani kelgan deb belgilang.",
        absent: "Keyin kelmagan o‘quvchining ismini bosing. Qaytarish uchun yana bir marta bosing.",
        homework:
          "Uy vazifasini dars ostiga yozing. O‘quvchilar uni o‘z sahifasida darhol ko‘radi.",
        group: "Guruhni ochish uchun uning nomini bosing. Davomat varag‘i butun oyni ko‘rsatadi.",
        cell: "Bu yerda istalgan katakni o‘zgartirish mumkin: keldi, kelmadi yoki kechikdi, izoh bilan.",
        grades: "Baholar varag‘ida har bir o‘quvchi qarshisiga dars uchun bahoni yozing.",
        phone:
          "Bularning hammasi telefonda ham ishlaydi: davomatni sinfning o‘zida belgilash mumkin.",
      },
    },
    "video-lesson": {
      title: "Video darslar",
      note: "Kampusning o‘zida onlayn dars: dars havolasi, ekrandagi fayllar, doska va so‘rovnomalar.",
      steps: {
        card: "Har bir guruhda video dars kartasi bor. Boshqa dastur kerak emas, faqat brauzer.",
        start: "Boshlash tugmasini bosing, kamera va mikrofonni tekshiring va xonaga kiring.",
        link: "“{video.room.copyLink}” tugmasini bosing va havolani guruh chatiga yuboring. O‘quvchilar bir bosishda kiradi.",
        student:
          "O‘quvchi havolani telefonda ochadi, birinchi marta hisobiga kiradi va darsga qo‘shiladi.",
        room: "Kirgan hammani ko‘rasiz. Ko‘tarilgan qo‘l o‘quvchining rasmida ko‘rinadi.",
        chat: "Chat dars paytida qisqa xabarlar uchun.",
        file: "Dars panelini oching va guruh materiallaridan faylni ko‘rsating. Hamma siz ko‘rayotgan sahifani ko‘radi.",
        pen: "Qalam bilan sahifaga chizasiz, o‘quvchilar buni darhol ko‘radi.",
        board: "Doska — chizish va tushuntirish uchun toza varaq.",
        poll: "So‘rovnoma butun sinfga bitta savol beradi. Javoblar kelishi bilan sanaladi.",
        end: "Darsni tugatganingizda davomat kirganlar bo‘yicha to‘ldiriladi va dars guruhda saqlanadi.",
      },
    },
    homework: {
      title: "Uy vazifasi va tekshirish",
      note: "Darsga uy vazifasi bering, javoblarni o‘qing va bir joyda tekshiring.",
      steps: {
        tab: "Guruhning uy vazifasi varag‘ida barcha vazifalar va nechta o‘quvchi javob bergani ko‘rinadi.",
        add: "“{groups.homework.add}” tugmasini bosing va vazifa qaysi darsga tegishli ekanini tanlang.",
        text: "Vazifani yozing va “{common.save}” tugmasini bosing. Fayl biriktirish yoki og‘zaki vazifa berish ham mumkin.",
        student:
          "O‘quvchilar vazifani o‘z sahifasida ko‘radi va o‘sha yerda javob beradi: matn, rasm, fayl yoki ovozli yozuv bilan.",
        checking:
          "Sizni kutayotgan barcha javoblar “{nav.checking}” bo‘limida, hamma guruhlaringizdan. Menyudagi raqam nechta ekanini ko‘rsatadi.",
        accept:
          "Javobni o‘qing va qabul qiling. O‘quvchi markaz uy vazifasi uchun beradigan coinlarni oladi.",
        return: "Qayta ishlash kerak bo‘lgan javob izohingiz bilan o‘quvchiga qaytariladi.",
        coins: "Ota-onalar uy vazifasi bajarilganini Telegramda ko‘radi.",
      },
    },
    "materials-chat": {
      title: "Materiallar, lenta va guruh chati",
      note: "Fayl va havolalarni ulashing, guruhga yangilik yozing va o‘quvchilar bilan gaplashing.",
      steps: {
        materials:
          "Materiallar varag‘ida guruhning fayl va havolalari saqlanadi: slaydlar, topshiriqlar, videolar.",
        add: "“{groups.materials.add}” tugmasini bosing. Fayl yoki havolani tanlang, nom bering va manzilni qo‘ying.",
        save: "“{common.save}” tugmasini bosing. O‘quvchilar buni o‘z sahifasidagi materiallardan topadi, siz esa video darsda ko‘rsata olasiz.",
        stream: "Lenta — guruhning e’lonlar doskasi. Guruhdagi hamma uchun yozuv yozing.",
        comments:
          "O‘quvchilar yozuv ostida izoh qoldirishi mumkin. Yozuvni tepaga mahkamlab qo‘ysa bo‘ladi.",
        chat: "Chat tezkor savollar uchun. Uni guruhdagi hamma o‘qiydi.",
        where: "O‘quvchilar lenta va chatni o‘z sahifasida ko‘radi — telefonda yoki kompyuterda.",
      },
    },
    exams: {
      title: "Imtihonlar va natijalar",
      note: "Guruhga imtihon belgilang, ballarni kiriting, o‘quvchilar ularni ko‘radi.",
      steps: {
        list: "“{nav.exams}” bo‘limida markaz imtihonlari turadi: bitta guruh uchun va istagan kishi yoziladigan mock imtihonlar.",
        add: "“{exams.add}” tugmasini bosing. Imtihonga nom bering va guruhni tanlang.",
        marks: "Sanani, eng yuqori ballni va o‘tish ballini belgilang.",
        save: "“{common.save}” tugmasini bosing. Imtihon ro‘yxatda va o‘quvchilar sahifalarida paydo bo‘ldi.",
        results: "Imtihondan keyin uni oching va har bir o‘quvchining ballini yozing.",
        saveResults:
          "Natijalarni saqlang. Kampus kim o‘tganini ko‘rsatadi va ballarni har bir o‘quvchining kartasiga qo‘shadi.",
        mock: "Mock imtihon bir nechta guruh yoki mehmonlar uchun ochiq, narxi va o‘rinlar soni bilan.",
        student: "O‘quvchilar va ota-onalar natijani saqlanishi bilan o‘z sahifasida ko‘radi.",
      },
    },
    "tests-coins": {
      title: "Testlar va coinlar",
      note: "Savollar bankidan onlayn testlar va yaxshi ishni rag‘batlantiradigan coinlar.",
      steps: {
        tests:
          "Testlar bo‘limida onlayn testlar tuzasiz. O‘quvchilar ularni o‘z sahifasida ishlaydi, Kampus o‘zi tekshiradi.",
        bank: "Savollar bankda fan va mavzular bo‘yicha saqlanadi, shuning uchun bitta savolni ko‘p testda ishlatish mumkin.",
        question: "Yangi savolda matn, javob variantlari va to‘g‘ri javob bo‘ladi.",
        portal:
          "Test guruhga ma’lum sanaga beriladi. Har bir o‘quvchining urinishi va bali saqlanadi.",
        rules:
          "Coinlar o‘quvchilarni rag‘batlantiradi. Bu yerda nima uchun necha coin berilishini belgilaysiz.",
        auto: "Coinlar o‘zi berilishi mumkin: darsga kelgani, uy vazifasini topshirgani, yaxshi test uchun.",
        report:
          "Coinlar hisoboti kim ko‘proq yig‘gani va sarflaganini ko‘rsatadi. O‘quvchilar coinlarni ro‘yxatingizdagi sovg‘alarga sarflaydi.",
      },
    },
    announcements: {
      title: "E’lonlar",
      note: "Butun markazga, bitta filialga yoki bitta guruhga birdan xabar bering.",
      steps: {
        list: "“{nav.announcements}” — markaz o‘quvchilar va ota-onalarga murojaat qiladigan joy.",
        new: "“{announcements.new}” tugmasini bosing va kim uchun ekanini tanlang: butun markaz, filial yoki bitta guruh.",
        write: "Qisqa sarlavha va xabar matnini yozing.",
        sms: "SMS orqali ham yuborish uchun buni yoqing. Busiz odamlar e’lonni o‘z sahifasida va Telegramda ko‘radi.",
        send: "“{announcements.dialog.submit}” tugmasini bosing. E’lon yuborildi.",
        reads: "Ro‘yxatda har bir e’lonni necha kishi o‘qigani ko‘rinadi.",
      },
    },
    finance: {
      title: "Moliya, maoshlar va kassa",
      note: "Daromad va xarajatlar, o‘qituvchilar maoshi va kunlik kassani yopish.",
      steps: {
        overview:
          "“{nav.finance}” tanlangan oy yoki yil uchun daromad, xarajat va foydani ko‘rsatadi.",
        expense:
          "O‘quvchilar to‘lovlari bu yerga o‘zi tushadi. Qolganini qo‘lda kiritasiz: toifa, summa va izoh.",
        saveExpense:
          "“{common.save}” tugmasini bosing. Yozuv ro‘yxatda paydo bo‘ladi, jami summalar va grafiklar darhol o‘zgaradi.",
        charts: "Grafiklar pul qayerdan kelib, qayerga ketayotganini ko‘rsatadi.",
        payroll:
          "Maosh har bir xodimning usuli bo‘yicha hisoblanadi: oylik, dars uchun, o‘quvchi uchun yoki to‘lovlardan ulush.",
        salary:
          "Har oy uchun har bir xodimning darslari va summasi ko‘rinadi. Tekshiring, kerak bo‘lsa qatorni tuzating va saqlang.",
        cash: "Kun oxirida kassir “{cashdesk.closeDay}” tugmasini bosadi. Kampus kassada qancha naqd pul bo‘lishi kerakligini ko‘rsatadi.",
        count: "Sanagan summangizni yozing. Farq darhol ko‘rinadi va yozuvda qoladi.",
      },
    },
    reports: {
      title: "Hisobotlar",
      note: "To‘lovlar, ketgan o‘quvchilar, davomat, lidlar va markaz statistikasi.",
      steps: {
        index: "“{nav.reports}” bo‘limida direktor eng ko‘p so‘raydigan raqamlar jamlangan.",
        payments:
          "To‘lovlar hisoboti: oy va filialni tanlang, jami summa, o‘z vaqtida va kechikib to‘langanlar, chegirmalar va qaytarilgan to‘lovlarni ko‘ring.",
        staff:
          "Shu hisobot har bir o‘qituvchining guruhlari qancha tushum keltirganini ham ko‘rsatadi.",
        churn:
          "Bu hisobot kim, qachon va nima uchun ketganini ko‘rsatadi, o‘quvchilar nega ketayotganini tushunish uchun.",
        students: "O‘quvchilar hisoboti — har bir guruh bo‘yicha davomat va natijalar.",
        leads: "Lidlar hisoboti: nechta lid keldi, qayerdan va nechtasi o‘quvchi bo‘ldi.",
        statistics:
          "Statistika sahifasi xonalar bandligini ko‘rsatadi: bo‘sh soatlar, bo‘sh o‘rinlar va xonalar to‘lganda keladigan daromad.",
        excel: "Har bir hisobotni o‘sha filtrlar bilan Excel faylida yuklab olish mumkin.",
      },
    },
    "student-portal": {
      title: "O‘quvchining sahifasi",
      note: "O‘quvchi yoki ota-ona qanday kiradi va nimani ko‘radi: darslar, uy vazifasi, natijalar va to‘lovlar.",
      steps: {
        address:
          "O‘quvchilar va ota-onalarning o‘z kirish sahifasi bor. U har qanday telefonda ishlaydi, hech narsa o‘rnatish shart emas.",
        phone:
          "Birinchi marta o‘quvchi telefon raqamini yozadi va “{auth.getCode}” tugmasini bosadi.",
        code: "Bot Telegramda kod yuboradi. O‘quvchi shu kod bilan kiradi.",
        password:
          "Parolni hozir yoki keyinroq tanlash mumkin. Parol bo‘lsa, keyingi safar kod kerak bo‘lmaydi.",
        home: "O‘quvchining bosh sahifasida guruhlari turadi. Hozir bo‘layotgan darsga shu yerdan qo‘shilish mumkin.",
        lesson: "Guruh sahifasida keyingi dars, jadval va darsda o‘tilgan mavzu ko‘rinadi.",
        homework:
          "Uy vazifasi bo‘limida o‘quvchi vazifani o‘qiydi va javob yuboradi: matn, rasm yoki ovozli yozuv.",
        materials: "Materiallar va guruh chati bir bosishda ochiladi.",
        results:
          "Natijalarda baholar, imtihonlar va davomat bor. Ota-ona farzandi qanday o‘qiyotganini doim biladi.",
        money:
          "Sahifada nima to‘langani va nima qolgani ko‘rinadi. Payme yoki Click ulangan bo‘lsa, ota-ona shu yerdan to‘laydi.",
        parents:
          "Markazda bir nechta farzandi o‘qiydigan ota-ona hammasini bitta oila sahifasida ko‘radi.",
      },
    },
    integrations: {
      title: "Integratsiyalar",
      note: "Telegram, SMS, onlayn to‘lov va Kampus ishlaydigan boshqa xizmatlarni ulang.",
      steps: {
        page: "“{nav.settings}” → “{settings.nav.integrations}” bo‘limida direktor tashqi xizmatlarni ulaydi. Har birining o‘z kartasi bor.",
        telegram:
          "Avval Telegram: bot orqali Kampus kirish kodlarini, dars eslatmalarini va ota-onalarga haftalik hisobotlarni yuboradi.",
        sms: "SMS uchun SMS provayderingiz ma’lumotlarini kiriting. Shunda eslatma va e’lonlarni SMS orqali yuborish mumkin.",
        payments:
          "Payme yoki Click ulansa, ota-ona o‘quvchi sahifasidan to‘laydi va to‘lov o‘zi yoziladi.",
        video: "Video darslar darhol ishlaydi. Bu kartada dars yozuvlari sozlamalari bor.",
        others:
          "Pastroqda amoCRM, telefoniya, FaceID, fiskal cheklar va AI yordamchi kaliti joylashgan.",
        bot: "Bot sahifasida kim Telegramda qaysi xabarlarni olishini tanlaysiz: direktor, filial rahbari, kassir.",
      },
    },
    assistant: {
      title: "AI yordamchi",
      note: "Markaz bo‘yicha kunlik xulosa va savollarga oddiy so‘zlar bilan javoblar.",
      steps: {
        button: "Bu dumaloq tugma markaz xodimlari uchun har bir sahifada bor.",
        summary:
          "U kun xulosasini ochadi: darslar, to‘lovlar, qarzlar va e’tibor talab qiladigan narsalar.",
        ask: "Chat varag‘ida savol bering. Tavsiyalardan biri bilan boshlash qulay.",
        type: "Yoki savolingizni o‘z tilingizda yozib yuboring. Yordamchi markazingiz ma’lumotlari asosida javob beradi.",
        page: "Menyudagi “{nav.assistant}” o‘sha yordamchini alohida sahifada ochadi.",
        key: "Unga API kalit kerak: u bir marta “{nav.settings}” → “{settings.nav.integrations}” bo‘limida kiritiladi. Yordamchi faqat o‘qiydi, hech narsani o‘zgartirmaydi; o‘quvchilar va ota-onalar uni ko‘rmaydi.",
      },
    },
  },
};
