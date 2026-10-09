import type { HelpContent } from "./types";

export const uz: HelpContent = {
  audiences: {
    CEO: {
      title: "CEO",
      summary:
        "O‘quv markazining egasi; barcha filiallarni, barcha raqamlarni va barcha sozlamalarni ko‘radi.",
      startHere:
        "Siz hammasini ko‘rasiz: pulni, har bir filialni, har bir xodimni va har bir sozlamani. Kunning raqamlarini o‘qish uchun bosh sahifadan boshlang, oy uchun esa Moliya va Hisobotlarga o‘ting. Sozlamalar, Xodimlar va Integratsiyalar bir marta sozlanadi va kamdan-kam o‘zgartiriladi.",
    },
    BRANCH_MANAGER: {
      title: "Filial menejeri",
      summary:
        "Bitta filialni kundalik boshqaradi: lidlar, guruhlar, o‘quvchilar, to‘lovlar va filial moliyasi.",
      startHere:
        "Sizning kuningiz Lidlar, Guruhlar va O‘quvchilar orqali o‘tadi. Shuningdek to‘lov qabul qilishingiz, chiqimlarni kiritishingiz, filialingizning moliya ko‘rsatkichlarini ko‘rishingiz va ish haqini hisoblashingiz mumkin. Bir nechta filialni boshqarsangiz, filialni yuqori paneldan almashtiring.",
    },
    ADMIN: {
      title: "Admin",
      summary:
        "Qabulxonada ishlaydi: lidlarga javob beradi, guruhlarni to‘ldiradi, o‘quvchilarni ro‘yxatga oladi va to‘lov qabul qiladi.",
      startHere:
        "Ishingizning ko‘p qismi Lidlar, Guruhlar va O‘quvchilarda, shuningdek yuqori paneldagi to‘lov tugmasida. Siz imtihon o‘tkazishingiz, SMS yuborishingiz, coin berishingiz hamda Sozlamalarda kurslar, xonalar va maktablarni yuritishingiz ham mumkin.",
    },
    CASHIER: {
      title: "Kassir",
      summary:
        "To‘lov qabul qiladi, chek chiqaradi, chiqimlarni kiritadi va kim qarzdorligini kuzatadi.",
      startHere:
        "Har bir to‘lov uchun yuqori paneldagi to‘lov tugmasidan foydalaning. Bosh sahifada qarzdorlar va to‘lovi yaqin o‘quvchilar ko‘rinadi; Moliyada chiqimlar, kirimlar va ish haqi; Hisobotlarda oyning to‘lovlari.",
    },
    TEACHER: {
      title: "O‘qituvchi",
      summary:
        "Guruhlarga dars beradi: davomat qiladi, baho va uy vazifasi qo‘yadi, materiallar ulashadi va video darslar o‘tkazadi.",
      startHere:
        "Sizga kerak bo‘lgan hamma narsa guruhingiz sahifasida: davomat, baholar, uy vazifasi, materiallar, testlar, coinlar va video dars. “Guruhga dars berish” maqolasidan boshlang; u bitta darsni boshidan oxirigacha kuzatib boradi.",
    },
    STUDENT: {
      title: "O‘quvchi",
      summary:
        "Parolsiz, shaxsiy havola orqali darslarga qo‘shiladi hamda progress, uy vazifasi va to‘lovlarni kuzatadi.",
      startHere:
        "O‘quv markazingiz sizga shaxsiy havola yuboradi. Uni telefon yoki kompyuterda oching va saqlab qo‘ying: bu video darslar, uy vazifasi, materiallar, baholar va to‘lovlar uchun sizning sahifangiz. Hech narsa o‘rnatish shart emas va eslab qoladigan parol yo‘q.",
    },
  },
  articles: {
    gettingStarted: {
      title: "Ishni boshlash",
      summary:
        "Tizimga kirish, tizimda yo‘l topish va har bir sahifada takrorlanadigan boshqaruv elementlari.",
      sections: {
        signIn: {
          title: "Tizimga kirish",
          body: [
            "Administratoringiz sizga hisob yaratadi va kirish uchun telefon raqam va parolni aytadi. Kampusni kompyuter, planshet yoki telefondagi brauzerda oching; hech narsa o‘rnatish kerak emas.",
            {
              steps: [
                "Telefon raqamingizni +998 90 123 45 67 ko‘rinishida kiriting.",
                "Parolingizni kiriting va **Kirish** tugmasini bosing.",
                "Parol noto‘g‘ri bo‘lsa, sahifa buni aytadi. Ketma-ket bir necha noto‘g‘ri urinishdan so‘ng kirish qisqa vaqtga to‘xtatiladi; kutib, qayta urinib ko‘ring.",
              ],
            },
            "Tizimdan chiqish uchun yuqori o‘ng burchakdagi ismingizni oching va **Chiqish** ni tanlang. Umumiy kompyuterlarda buni albatta qiling.",
            {
              note: "Parolni unutdingizmi? Yangi parolni faqat administrator Sozlamalar → Xodimlar bo‘limida o‘rnata oladi.",
            },
          ],
        },
        layout: {
          title: "Sahifa tuzilishi",
          body: [
            "Chapdagi to‘q rangli yon panelda siz ishlatishingiz mumkin bo‘lgan bo‘limlar turadi: Bosh sahifa, Lidlar, O‘qituvchilar, Guruhlar, O‘quvchilar, Imtihonlar, Sozlamalar, Moliya va Hisobotlar. Huquqi kamroq odamlar kamroq bo‘limni ko‘radi. Telefonda yon panel yuqori chap burchakdagi menyu tugmasi ostiga yashirinadi.",
            "Yuqori panelda har bir sahifada ishlaydigan boshqaruv elementlari turadi: qidiruv maydoni, **To‘lov** tugmasi, filial tanlovi, til, xabarnomalar qo‘ng‘irog‘i va ismingiz.",
            "Ro‘yxatlar hamma joyda bir xil ishlaydi: qidiruv maydoni yozgan sayin saralaydi, ustun sarlavhalari bosilganda tartiblaydi, filtrlar jadval ustida turadi va uzun ro‘yxatlar pastda sahifalarga bo‘linadi. Ko‘p ro‘yxatlarda ko‘rib turganingizni yuklab oladigan **Excel** tugmasi bor.",
          ],
        },
        search: {
          title: "O‘quvchi, lid yoki guruhni topish",
          body: [
            "Yuqori paneldagi qidiruv maydoniga ismning ikki yoki undan ko‘p harfini yoki telefon raqamning bir qismini yozing. Mos keladigan o‘quvchilar, lidlar va guruhlar yozgan sayin paydo bo‘ladi. Ochish uchun Enter ni bosing yoki natijani bosing.",
            "Qidiruv faqat sizga ruxsat berilgan filiallarni qamrab oladi. Sahifa ichida uning ro‘yxatini saralash uchun o‘sha sahifaning o‘z qidiruv maydonidan foydalaning.",
          ],
        },
        branchAndLanguage: {
          title: "Filial va til",
          body: [
            "Har bir kurs, xona, guruh va o‘quvchi biror filialga tegishli. Yuqori paneldagi filial tanlovi sahifalar qaysi filialni ko‘rsatishini belgilaydi. Butun tashkilotni ko‘ra oladigan odamlar **Barcha filiallar** ni ham tanlashi mumkin.",
            "Til tugmasi o‘zbek, rus va ingliz tillari orasida almashtiradi. Tanlov faqat sizniki va keyingi tashrifingizgacha saqlanadi. Sanalar, pul va Excel fayllari siz tanlagan tilga mos bo‘ladi.",
          ],
        },
        notifications: {
          title: "Xabarnomalar",
          body: [
            "Yuqori paneldagi qo‘ng‘iroq nechta o‘qilmagan xabaringiz borligini ko‘rsatadi: qabul qilingan to‘lov, veb-formadan kelgan yangi lid, bugun qarzdor bo‘lgan o‘quvchilar, tug‘ilgan kunlar. Oxirgilarini ko‘rish uchun qo‘ng‘iroqni bosing, o‘qilmaganlar filtri bilan to‘liq ro‘yxat uchun esa **Barcha xabarnomalarni ko‘rish** ni bosing.",
          ],
        },
        roles: {
          title: "Kim nima qila oladi",
          body: [
            "Rolingiz nimani ko‘rishingizni va nimani o‘zgartira olishingizni belgilaydi. CEO hammasini ko‘radi; filial menejeri bitta filialni boshqaradi; admin lidlar, guruhlar, o‘quvchilar va to‘lovlar bilan ishlaydi; kassir to‘lov qabul qiladi va moliyani yuritadi; o‘qituvchilar faqat o‘z guruhlarini ko‘radi.",
            "Rolingizga ruxsat berilmagan sahifani ochsangiz, u **Ruxsat yo‘q** deb yozadi. Huquq kerak bo‘lsa, administratoringizdan so‘rang; rollar Sozlamalar → Rollar bo‘limida sozlanadi.",
          ],
        },
        help: {
          title: "Bu yordamdan foydalanish",
          body: [
            "Yon panelning pastidagi **Yordam** ni istalgan vaqtda oching. Siz uchun yozilgan maqolalarni ko‘rish uchun rolingizni tanlang yoki qidiring: nima qilmoqchi ekaningizni yozing, masalan “pul qaytarish” yoki “dam olish kuni”, shunda mos bo‘limlar ro‘yxati chiqadi. Har bir maqolada u tasvirlagan sahifaga havola bor.",
          ],
        },
      },
    },
    dashboard: {
      title: "Bosh sahifa",
      summary: "Kunning raqamlari, xonalar jadvali va pul, bitta ekranda.",
      sections: {
        kpis: {
          title: "O‘n ikki raqam",
          body: [
            "Bosh sahifa o‘n ikki kartochka bilan ochiladi: faol lidlar, guruhlar, qolgan qarz, qarzdorlar, to‘lovi yaqin, faol o‘quvchilar, guruhdagi o‘quvchilar, sinov darsidagi o‘quvchilar, shu oyda ketganlar, o‘qituvchilar, yaqinlashayotgan imtihonlar va yangi guruhga qabul.",
            "Sahifa ochilganda raqamlar yulduzchalar ortiga yashiriladi, shunda hech kim ularni yelkangiz osha o‘qimaydi. Ko‘rsatish uchun **Raqamlarni ko‘rish** ni bosing. Istalgan kartochkani bossangiz, uning ortidagi ro‘yxat allaqachon saralangan holda ochiladi: qarzdorlar kartochkasi o‘quvchilar ro‘yxatini qarzdor filtri yoqilgan holda ochadi.",
            "Raqamlar yuqori panelda tanlangan filial uchun. Foydalilik belgisi markaz xonalari vaqtining qancha qismi band ekanini ko‘rsatadi va markaz statistikasi hisobotiga olib boradi.",
          ],
        },
        schedule: {
          title: "Xonalar jadvali",
          body: [
            "Kartochkalar ostida Sozlamalar → Umumiy sozlamalarda belgilangan ish vaqtiga nisbatan xonalar jadvali turadi. Har bir guruhning darslari o‘z xonasida, o‘z vaqtida ko‘rinadi; xonasiz guruhlar oxirgi qatorda turadi. Hafta kunlarini yorliqlar bilan, vaqt oralig‘ini esa 30 va 60 daqiqa orasida almashtiring.",
            "Undan yangi guruh uchun bo‘sh xona va vaqt topishda yoki hozir kim dars berayotganini ko‘rishda foydalaning. Xonalar Sozlamalar → Xonalar bo‘limida qo‘shiladi; guruh xonasini o‘z jadvalida oladi.",
          ],
        },
        finance: {
          title: "Moliya bir qarashda",
          body: [
            "Moliyani ko‘ra oladigan odamlar uchinchi blokni oladi: tanlangan yil va oy uchun to‘lov turlari bo‘yicha tushumlar hamda butun yil uchun har oyga bittadan ustun. Bu Moliya sahifasidagi ma’lumotning o‘zi, qisqa ko‘rinishda. Toraytirish uchun yilni, oyni yoki **Butun yil** ni va to‘lov turini tanlang.",
          ],
        },
      },
    },
    leads: {
      title: "Lidlar",
      summary:
        "Birinchi qo‘ng‘iroqdan guruhdagi o‘quvchigacha: doskalar, ustunlar, formalar va manbalar.",
      sections: {
        board: {
          title: "Lidlar doskasi",
          body: [
            "Lid — kurs haqida so‘ragan, lekin hali guruhga qo‘shilmagan odam. Lidlar doskada ustunlardagi kartochkalar ko‘rinishida turadi, masalan Yangi, Qo‘ng‘iroq qilindi, Sinov darsiga keldi, Qabul qilindi. Har bir filialning o‘z doskalari bor; birini **Doska** tanlovi bilan tanlang.",
            "Birinchi marta **Bo‘lim yaratish** bilan doska yarating va qabulxona ishlaydigan ustunlarni **Qo‘shimcha ustun qo‘shish** bilan qo‘shing. Ustun nomlarini keyin o‘zgartirish mumkin; ustunni faqat bo‘sh bo‘lganda o‘chirish mumkin.",
            "Doska ustidagi filtrlar kartochkalarni dars vaqti, o‘qituvchi va kunlar bo‘yicha toraytiradi. Arxivlangan lidlarni ko‘rish uchun **Arxiv** ni yoqing.",
          ],
        },
        addLead: {
          title: "Lid qo‘shish",
          body: [
            {
              steps: [
                "Lid tegishli ustunda yoki doskaning yuqorisidagi tugmada **Yangi lid qo‘shish** ni bosing.",
                "Ismni va kamida bitta telefon raqamni kiriting. **Telefon raqam qo‘shish** ikkinchisini qo‘shadi.",
                "Lid qayerdan kelganini (**Manba**) va ma’lum bo‘lsa, ma’qul o‘qituvchi, kunlar va dars vaqtini tanlang. Bular keyin guruh tanlashda yordam beradi.",
                "Holat (Yangi, Bog‘lanildi, Bog‘lana olmadi, Yo‘qotilgan) va haroratni (Issiq, Iliq, Sovuq) belgilang hamda kelishilgan narsalarni izohga yozing.",
                "**Saqlash** ni bosing. Kartochka ustunda paydo bo‘ladi.",
              ],
            },
            "Veb-forma orqali kelgan lidlar kartochkada belgilanadi va forma uchun sozlagan manbangiz bilan keladi.",
          ],
        },
        workLeads: {
          title: "Doska bilan ishlash",
          body: [
            "Suhbat oldinga siljiganda kartochkani boshqa ustunga sudrab o‘tkazing yoki kartochka menyusini ochib **Ko‘chirish** ni tanlang. Menyu lidni tahrirlaydi, arxivlaydi yoki o‘chiradi ham. Arxivlash yozuvni saqlab, yashiradi; o‘chirish uni butunlay olib tashlaydi.",
            "Ustundagi hammaga bir xil SMS yuborish uchun ustun menyusini oching va **Bo‘limdagi barcha lidlarga SMS yuborish** ni tanlang. Shablon tanlang yoki matn yozing; har bir lidning ismi avtomatik to‘ldiriladi. Xabarlar faqat SMS shlyuzi sozlangan bo‘lsa yuboriladi; aks holda ular yozib qo‘yiladi, lekin yetkazilmaydi.",
            "**Excel** tugmasi doskani ko‘rib turganingizdek, filtrlar qo‘llangan holda yuklab oladi.",
          ],
        },
        toGroup: {
          title: "Lidlarni o‘quvchiga aylantirish",
          body: [
            {
              steps: [
                "Qo‘shilishga rozi bo‘lgan lidlarni har bir kartochkadagi belgilash katakchasi bilan belgilang.",
                "**Lidlarni guruhga qo‘shish** ni bosing va guruh hamda qo‘shilish sanasini tanlang. Oldinda hali sinov darsi bor-yo‘qligiga qarab Yangi yoki Sinov holatini tanlang.",
                "**Saqlash** ni bosing. Har bir lid uchun o‘quvchi yozuvi yaratiladi, o‘quvchi guruhga qo‘shiladi va lid o‘quvchiga aylangan deb belgilanadi.",
              ],
            },
            "O‘quvchi keyinroq guruhdan chiqsa, guruh sahifasidagi qator menyusida **Lidlarga qaytarish** bor, u o‘quvchini doskaga qaytaradi.",
          ],
        },
        sources: {
          title: "Manbalar",
          body: [
            "**Manba** tugmasi lidlar keladigan joylar ro‘yxatini ochadi: Instagram, Telegram, tanish, banner. Har bir manba qancha lid olib kelgani va ulardan nechtasi o‘quvchiga aylanganini ko‘rsatadi, shunda qaysi reklama ishlayotganini ko‘rasiz. Manbalarni kartochkalarda ishlatishdan oldin shu yerda yarating; endi ishlatilmaydigan manbani tarixini yo‘qotmasdan o‘chirib qo‘yish mumkin.",
          ],
        },
        forms: {
          title: "Veb-formalar",
          body: [
            "Sozlamalar → Formalar bo‘limida istalgan odam saytingizda yoki havola orqali to‘ldira oladigan ochiq forma yaratishingiz mumkin: ism va telefon raqam, boshqa hech narsa. Har bir yuborilgan forma siz tanlagan ustunda, siz tanlagan manba bilan lidga aylanadi va lidlar bilan ishlaydigan odamlar xabarnoma oladi. Havolasini nusxalash uchun forma qatorini bosing.",
          ],
        },
      },
    },
    groups: {
      title: "Guruhlar",
      summary:
        "Jadval va o‘qituvchilar bilan guruh yaratish, o‘quvchi qo‘shish va guruh sahifasidagi hamma narsa.",
      sections: {
        list: {
          title: "Guruhlar ro‘yxati",
          body: [
            "Guruhlar filialning har bir guruhini kursi, o‘qituvchisi, kunlari, vaqti, o‘quvchilar soni va sanalari bilan ko‘rsatadi. Yorliqlar ularni holat bo‘yicha ajratadi: faol, arxivlangan, sinov va muzlatilgan. Kurs, o‘qituvchi, kunlar, vaqt yoki xona bo‘yicha saralang yoki nomi bo‘yicha qidiring. **Excel** ro‘yxatni yuklab oladi.",
            "Sahifasini ochish uchun guruh nomini bosing.",
          ],
        },
        create: {
          title: "Guruh yaratish",
          body: [
            {
              steps: [
                "**Yangi guruh** ni bosing.",
                "Nom bering va kursni tanlang. Kurs o‘zi bilan oylik narxini, davomiyligini va baholash tizimini olib keladi; boshqa baholash tizimini faqat shu guruh boshqacha baholansa belgilang.",
                "Kunlarni tanlang: toq kunlar (Du, Cho, Ju), juft kunlar (Se, Pa, Sha), har kuni yoki boshqa to‘plam. Boshlanish va tugash vaqtini hamda xonani belgilang. Kunlar farq qilsa, **Har kun uchun alohida vaqt yoki xona** ni belgilang.",
                "Uchtagacha o‘qituvchi qo‘shing. Har biri uchun rolni (asosiy o‘qituvchi, yordamchi, hamkor o‘qituvchi) va shu guruh uchun qanday haq olishini tanlang: kurs narxidan foiz, har dars uchun haq yoki har o‘quvchi uchun haq.",
                "Boshlanish sanasini belgilang. Kampus tugash sanasini kurs davomiyligidan hisoblashi uchun uni bo‘sh qoldiring.",
                "**Saqlash** ni bosing. Kampus ikki sana orasidagi har bir darsni filialning dam olish kunlarini tashlab o‘tgan holda rejalashtiradi.",
              ],
            },
            "Jadvalni keyin tahrirlash hali o‘tilmagan darslarni qayta rejalashtiradi; belgilangan darslar saqlanib qoladi.",
          ],
        },
        detail: {
          title: "Guruh sahifasi",
          body: [
            "Chap kartochkada kurs, narx, baholash tizimi, filial, davomiylik, jadval, o‘qituvchilar, faol o‘quvchilar va o‘tilgan darslar ko‘rinadi. Uning ostida video dars kartochkasi turadi, “Guruhga dars berish” ga qarang.",
            "Yuqoridagi tugmalar: **Tahrirlash** yaratishdagi formaning o‘zini ochadi; **Yana** da support o‘qituvchilar, o‘qituvchini o‘zgartirish, guruhga dam berish, boshqa filialga o‘tkazish, tugatish va arxivlash turadi.",
            "O‘ng tomonda guruh o‘quvchilari, ular ostida esa yorliqlar: davomat, baho, uy vazifasi, materiallar, test, bilim tahlili, imtihonlar, chegirmalar, coinlar, izohlar, eslatmalar va guruh tarixi.",
          ],
        },
        members: {
          title: "Guruhdagi o‘quvchilar",
          body: [
            "Birini qo‘shish uchun **O‘quvchi qo‘shish** ni bosing: mavjud o‘quvchini ism yoki telefon bo‘yicha toping yoki shu yerning o‘zida yangisini yarating. Qo‘shilgan sanani va, agar bu o‘quvchi boshqa summa to‘lasa, alohida oylik narxni belgilang. **Hisob boshlanishi** ixtiyoriy: bo‘sh qolsa, qo‘shilgan kundan hisoblanadi; boshqa tizimdan o‘tkazilgan, oldingi oylari u yerda yopilgan o‘quvchi uchun keyingi sanani belgilang; sanani keyin qator menyusidan o‘zgartirish mumkin. **Excel orqali qo‘shish** bir vaqtda ko‘pchilikni qo‘shadi; avval shablonni yuklab oling.",
            "Har bir o‘quvchi qatorida holat bor: Yangi, Sinov, Faol, Muzlatilgan, Chiqarilgan yoki Bitirgan. Yangi va sinovdagi o‘quvchilardan hali to‘lov hisoblanmaydi. **O‘quvchilarni faollashtirish** barcha yangi va sinovdagi o‘quvchilarni bir yo‘la faol qiladi; shundan boshlab ularning oylik to‘lovi hisoblanadi.",
            "Qator menyusida kundalik amallar turadi: **To‘lov** shu guruh uchun to‘lov oynasini ochadi; **Holatni o‘zgartirish**; **Bitirtirish**; **Boshqa guruhga ko‘chirish**, u bu yerdagi a’zolikni yopib, u yerda yangisini ochadi; **Guruhdan chiqarish**, u sababni so‘raydi; **Lidlarga qaytarish**; **Xabar (SMS)**. Chiqarilgan o‘quvchilar tarixda qoladi va **Chiqarilganlar** tugmasi bilan ko‘rsatilishi mumkin; balanslar **Balanslar** tugmasi bilan ko‘rinadi.",
          ],
        },
        tabs: {
          title: "Yorliqlar nima uchun",
          body: [
            "**Davomat** va **Baho**: har bir yorliqda bir oy, qatorlarda o‘quvchilar va ustunlarda darslar. **Uy vazifasi** va **Materiallar**: o‘quvchilar shaxsiy sahifasida ko‘radigan narsalar. **Test** va **Bilim tahlili**: guruhga berilgan testlar va o‘quvchilar mavzular bo‘yicha qanday natija ko‘rsatgani. **Imtihonlar**: guruh imtihonlari, qo‘shish tugmasi bilan. **Chegirmalar**: o‘quvchi uchun bir necha oyga pasaytirilgan oylik narx. **Coinlar**: reyting va coin berish. **Izohlar**: alohida o‘quvchilar haqida eslatmalar. **Eslatmalar**: guruh haqida eslatmalar. **Guruh tarixi**: har bir o‘zgarish, kim va qachon qilgani.",
            "O‘qituvchining davomat, baho, uy vazifasi, materiallar va coinlar bilan ishlashi “Guruhga dars berish” da bosqichma-bosqich tasvirlangan.",
          ],
        },
        changes: {
          title: "Dam kunlari, o‘qituvchini o‘zgartirish va tugatish",
          body: [
            "**Dam berish** shu guruh uchun bitta sanadagi darsni olib tashlaydi, masalan o‘qituvchining safari uchun. Filial bo‘yicha bayramlar esa Sozlamalar → Dam olish kunlari bo‘limiga kiritiladi va har bir guruhga amal qiladi.",
            "**O‘qituvchini o‘zgartirish** ketayotgan o‘qituvchini bugundan boshlab yangisi bilan almashtiradi; yangi o‘qituvchining ish haqi ulushi bugundan, eskisiniki kechagacha hisoblanadi. **Support o‘qituvchilar** davomat qila oladigan va guruhni ko‘ra oladigan, lekin ish haqi ulushi bo‘lmagan qo‘shimcha o‘qituvchilarni biriktiradi.",
            "Kurs tugaganda **Guruhni tugatish** ni bosing: har bir faol o‘quvchi bitiruvchiga aylanadi va qolgan darslar olib tashlanadi. Bitiruvchilar hisoboti ularni ko‘rsatadi. **Arxivlash** tashlab qo‘yilgan guruhni yashiradi; darslari va tarixi saqlanadi. Arxivlangan guruhlar Arxivlangan yorlig‘ida ko‘rinadi.",
          ],
        },
      },
    },
    today: {
      title: "Kuningiz telefonda",
      summary:
        "«Bugun» kun darslarini bir bosishda davomat bilan, uy vazifalarini, keyingi darsni va guruhlaringizdagi qarzdorlarni ko‘rsatadi; Kampus telefonga ilova kabi o‘rnatiladi.",
      sections: {
        day: {
          title: "«Bugun» nimani ko‘rsatadi",
          body: [
            "O‘qituvchilar tizimga kirganidan so‘ng **Bugun** sahifasiga tushadi. Unda siz dars beradigan yoki support qiladigan guruhlarning kun darslari vaqt tartibida, kurs, xona va mavzu bilan ko‘rsatiladi. Yuqoridagi strelkalar kunni oldinga yoki orqaga suradi; ofis bu yerda filialning barcha guruhlarini ko‘radi.",
            "Darslar ostida hozirgi vaqtdan keyingi **keyingi dars** va qarz summasi bilan **guruhlaringizdagi qarzdorlar** turadi. Darsdan keyin bir og‘iz eslatish yordam beradi; to‘lovni administrator qabul qiladi.",
          ],
        },
        attendance: {
          title: "Bir bosishda davomat",
          body: [
            {
              steps: [
                "Dars kartasida o‘quvchi ismiga bir marta bosing — keldi, ikkinchi marta — kelmadi, uchinchi marta — sababli, yana bir marta — tozalash.",
                "**Hamma keldi** hali belgilanmaganlarning hammasini bir bosishda belgilaydi; so‘ng kelmaganlarga bosing.",
                "Belgilar darhol saqlanadi va guruhning davomat jadvalidagi belgilar kabi hisoblanadi: ularga tangalar, avto-SMS va davomat foizi ergashadi.",
              ],
            },
            {
              note: "Agar markazda «davomat faqat dars vaqtida» yoqilgan bo‘lsa, belgilar faqat dars kunida qabul qilinadi.",
            },
          ],
        },
        homework: {
          title: "Kartadan uy vazifasi",
          body: [
            "Har bir dars kartasida uning vazifasi ko‘rinadi: matn, muddat, nechta javob kelgani va nechtasi tekshirishni kutayotgani. **Uy vazifasi berish** uni ikki maydonda yozadi; javoblarni tekshirish yoki fayl biriktirish uchun guruhning «Uy vazifalari» bo‘limini oching.",
          ],
        },
        install: {
          title: "Kampus telefoningizda",
          body: [
            {
              steps: [
                "Android’da Kampusni Chrome’da oching, menyuni ochib **Ilovani o‘rnatish** (yoki **Bosh ekranga qo‘shish**)ni tanlang.",
                "iPhone’da uni Safari’da oching, **Ulashish**, so‘ng **Bosh ekranga qo‘shish**ni bosing.",
                "Shundan so‘ng Kampus o‘z belgisidan to‘liq ekranda ochiladi va o‘qituvchilar uchun birinchi sahifa «Bugun» bo‘ladi.",
              ],
            },
          ],
        },
      },
    },
    teaching: {
      title: "Guruhga dars berish",
      summary:
        "O‘qituvchining darsi boshidan oxirigacha: davomat, baholar, uy vazifasi, materiallar, video va coinlar.",
      sections: {
        day: {
          title: "Sizning guruhlaringiz",
          body: [
            "Tizimga kirganingizdan so‘ng **Bugun** sahifasiga tushasiz — kun darslari bir bosishda davomat bilan; Guruhlar sahifasida faqat siz dars beradigan yoki support qiladigan guruhlar ko‘rinadi. Bugungi dars haqida hamma narsani bitta sahifada topish uchun guruhni oching. Yon panelda sizga Guruhlar, O‘quvchilar va Imtihonlar ko‘rinadi; Kampusning qolgan qismi ofis uchun.",
            "Imtihon jadvali faqat administrator uni o‘qituvchilar uchun yoqqan bo‘lsa ko‘rinadi. To‘lovlar va o‘quvchi balanslari, administrator buni sozlamagan bo‘lsa, sizga ko‘rinmaydi.",
          ],
        },
        attendance: {
          title: "Davomat qilish",
          body: [
            {
              steps: [
                "Guruhni oching va **Davomat** yorlig‘ida qoling. Joriy oy bo‘lmasa, yuqorida oyni tanlang.",
                "Bugungi ustunni toping. O‘quvchi katagini bir marta bossangiz keldi, yana bossangiz kelmadi, uchinchi marta bossangiz sababli, yana bir marta bossangiz belgi tozalanadi.",
                "Jadval ustidagi **Mavzu** qatoriga dars mavzusini yozing va bo‘lsa, dars fayliga havolani qo‘ying. O‘quvchilar mavzuni o‘z sahifasida ko‘radi.",
              ],
            },
            "Markaz “faqat dars vaqtida yo‘qlama” ni yoqqan bo‘lsa, kataklar faqat dars davom etayotganda ochiladi; adminlarga bu cheklov yo‘q. Jadvalda bo‘lmagan darsni yozish uchun **Qo‘shimcha dars** dan foydalaning va sana hamda vaqtni tanlang.",
            {
              note: "Davomat o‘quvchining davomat foizini, kelmagan bola haqida ota-onaga avto-SMSni va darsga kelgani uchun avtomatik coinlarni, agar ular yoqilgan bo‘lsa, ishga tushiradi.",
            },
          ],
        },
        grades: {
          title: "Baholar",
          body: [
            "**Baho** yorlig‘ida xuddi shunday jadval bor. Katakni bosing va bahoni guruhning baholash tizimida kiriting: kursga qarab CEFR darajasi, IELTS bali, 1 dan 5 gacha yoki 0 dan 100 gacha. Har bir o‘quvchining o‘rtacha bahosi o‘ng tomonda hisoblanadi. Baholar o‘quvchining shaxsiy sahifasida va progress yorlig‘ida ko‘rinadi.",
          ],
        },
        homework: {
          title: "Uy vazifasi",
          body: [
            "Har darsga bitta uy vazifasi. O‘quvchilar shaxsiy havolasidan javob beradi; siz har bir javobni shu yerda qabul qilasiz yoki qaytarasiz.",
            {
              steps: [
                "**Uy vazifasi** yorlig‘ida **Vazifa berish** ni bosing, darsni tanlang va vazifani yozing. Xohlasangiz, havola yoki fayl va muddat qo‘shing.",
                "Har bir vazifa kartochkasi nechta o‘quvchi javob bergani va nechta javobni qabul qilganingizni ko‘rsatadi. Javoblarni o‘qish uchun kartochkani oching; har birida o‘quvchining matni va fayli bor.",
                "**Qabul qilish** yoki **Qaytarish** ni bosing, kerak bo‘lsa, o‘quvchi uchun izoh bilan. Qaytarilgan javob o‘quvchiga “bajarish kerak” holatida qaytadi.",
              ],
            },
            "Telegramga ulangan o‘quvchilar vazifa berilganda, o‘zgartirilganda, qabul qilinganda yoki qaytarilganda xabar oladi. Uy vazifasi uchun avtomatik coinlar yoqilgan bo‘lsa, qabul qilingan javob coinlarni o‘zi beradi.",
          ],
        },
        materials: {
          title: "Materiallar",
          body: [
            "**Materiallar** yorlig‘ida guruh uchun fayllar va havolalar turadi: darslik bobi, taqdimot, yozuv. Birini muayyan dars uchun yoki butun guruh uchun qo‘shing. O‘quvchilar ularni o‘z sahifasidan ochadi va yuklab oladi. Video darslar yozuvlari bu yerga o‘zi tushadi va Sozlamalar → Integratsiyalar → Video darslar bo‘limida belgilangan kunlar o‘tgach o‘chiriladi.",
          ],
        },
        video: {
          title: "Video darslar",
          body: [
            "Guruh sahifasidagi video dars kartochkasi qo‘ng‘iroq davom etayotgan-etmayotganini va bugungi dars vaqtini ko‘rsatadi.",
            {
              steps: [
                "**Video darsni boshlash** ni bosing. Brauzeringiz kamera va mikrofonga ruxsat so‘raydi; ikkalasiga ham ruxsat bering, oldindan ko‘rinishni tekshiring va **Darsga qo‘shilish** ni bosing.",
                "Siz boshlashingiz bilan o‘quvchilar shaxsiy havolasidan qo‘shiladi; ularning sahifasi ularni o‘zi kiritadi. Xodimlar guruh sahifasidan **Qo‘shilish** bilan qo‘shila oladi.",
                "Qo‘ng‘iroqda ekraningizni ko‘rsatishingiz, bir kishining yoki hammaning mikrofonini o‘chirishingiz, ko‘tarilgan qo‘llarni ko‘rishingiz, chatda yozishingiz va darsni yozib olishingiz mumkin. Yozuv guruh materiallarida saqlanadi.",
                "Tugatganingizda **Hamma uchun yakunlash** ni bosing. O‘quvchilar faqat siz yangi dars boshlaganingizdan keyin qayta qo‘shila oladi.",
              ],
            },
            "Kimdir ulana olmasa, uning tarmog‘i to‘g‘ridan-to‘g‘ri qo‘ng‘iroqlarni to‘sayotgan bo‘lishi mumkin; administrator Sozlamalar → Integratsiyalar → Video darslar bo‘limida relay server qo‘sha oladi.",
          ],
        },
        links: {
          title: "O‘quvchilarning shaxsiy havolalari",
          body: [
            "Har bir o‘quvchining shu guruh uchun bitta shaxsiy havolasi bor; u video dars, darslar, uy vazifasi, materiallar, baholar va to‘lovlar turadigan sahifasini ochadi. Hammasini ko‘rish, birini nusxalash, hammasini nusxalash yoki telefon raqami bor har bir o‘quvchiga SMS orqali yuborish uchun video kartochkasidagi **O‘quvchilar havolalari** ni bosing. Havola begonaga o‘tib ketsa, o‘sha o‘quvchi uchun yangisini yarating; eskisi darhol ishlamay qoladi.",
          ],
        },
        coins: {
          title: "Coin berish",
          body: [
            "Coinlar o‘quvchilarni rag‘batlantiradi hamda reyting va marketplace ga asos bo‘ladi. **Coinlar** yorlig‘ida **Coin berish** ni bosing, o‘quvchini va markaz sozlagan ro‘yxatdan sababni tanlang; har bir sababning maksimumi bor. Davomat, uy vazifasi, test natijalari va tug‘ilgan kun uchun avtomatik coinlarni administrator sozlaydi va sizdan hech narsa talab qilmaydi.",
          ],
        },
        tests: {
          title: "Testlar",
          body: [
            "**Test** yorlig‘ida guruhingizga berilgan testlar ro‘yxati turadi. O‘quvchilar ularni qog‘ozda yoki sinfda topshiradi; siz har bir o‘quvchining natijasini test sahifasida **Natija kiritish** orqali kiritasiz. Keyin **Bilim tahlili** yorlig‘i guruh fan, test va sana bo‘yicha qanday natija ko‘rsatganini ko‘rsatadi, shunda qaysi mavzularni takrorlash kerakligini ko‘rasiz.",
          ],
        },
      },
    },
    students: {
      title: "O‘quvchilar",
      summary:
        "O‘quvchilar ro‘yxati, o‘quvchi profili, uning guruhlari, ota-onasi, tarixi va ketishi.",
      sections: {
        list: {
          title: "O‘quvchilar ro‘yxati",
          body: [
            "O‘quvchilar hammani rasmi, bahosi, keyingi to‘lov sanasi, telefoni, guruhlari va balansi bilan ko‘rsatadi. Kurs, maktab, o‘qituvchi, guruh, guruhdagi holat (faol, yangi, muzlatilgan, sinov darsidan ketganlar, guruhsiz) yoki to‘lov holati (to‘lov vaqti yaqinlashgan, qarzdor, qarzdor bo‘lmagan, ortiqcha to‘lov) bo‘yicha saralang. **Arxiv** ko‘rinishi ketgan o‘quvchilarni ko‘rsatadi.",
            "Yuqoridagi tugmalar: **Yangi qo‘shish**, ro‘yxat uchun **Excel**, **Excel orqali import**, saralangan o‘quvchilarga **SMS yuborish** va ro‘yxatdagi har bir o‘quvchi uchun QR kodli beyjik chop etadigan **Beyjiklar**.",
          ],
        },
        add: {
          title: "O‘quvchi qo‘shish",
          body: [
            {
              steps: [
                "**Yangi qo‘shish** ni bosing. Ism familiya, telefon va tug‘ilgan sanani kiriting; jinsi, izoh va o‘quvchi qayerdan kelganini qo‘shing.",
                "O‘quvchini darhol guruhga qo‘yish uchun **Guruhga qo‘shish** ni oching: ro‘yxatni filial, o‘qituvchi yoki kurs bo‘yicha toraytiring, guruhni, qo‘shilish sanasini va holatni (Yangi, Sinov yoki Faol) tanlang.",
                "Bo‘lsa, **Ota-ona telefon raqamini qo‘shish** va **Maktab qo‘shish** ni oching. Ota-onalar davomat va to‘lovlar haqida SMS olishi mumkin.",
                "**Saqlash** ni bosing. Profil ochiladi.",
              ],
            },
            "Qo‘shilishga rozi bo‘lgan lidlarni lidlar doskasidan aylantirgan ma’qul, bu o‘quvchini yaratadi va manbani saqlab qoladi; “Lidlar” ga qarang.",
          ],
        },
        profile: {
          title: "O‘quvchi profili",
          body: [
            "Yuqori kartochkada balans, baho, ID, telefon, tug‘ilgan sana, o‘quvchi ilova ishlatishi-ishlatmasligi va QR kod ko‘rinadi. Pasport raqami yoki allergiya kabi qo‘shimcha ma’lumot **O‘quvchiga qo‘shimcha ma’lumot qo‘shish** ostiga kiritiladi.",
            "Tugmalar: **Guruhga qo‘shish**, **To‘lov qilish**, **Pul qaytarish**, **Beyjik chiqarish**, **Tahrirlash** va **Qora ro‘yxatga olish**. Pastda yorliqlar: guruhlar, progress, test natijalari, izoh va eslatmalar, SMS, tarix, ota-onasi va qo‘ng‘iroqlar.",
          ],
        },
        groupsTab: {
          title: "Guruhlar va balans",
          body: [
            "**Guruhlar** yorlig‘i har bir guruh uchun o‘quvchining holati, qo‘shilgan sanasi, oylik narxi va shu guruhdagi balansi bilan kartochka ko‘rsatadi. Har bir kartochkadagi taqvim o‘tilgan darslar va davomatni belgilaydi. Kartochkadan to‘lov qilishingiz, o‘quvchini boshqa guruhga ko‘chirishingiz yoki chiqarishingiz mumkin. Kartochkalar ostida har bir to‘lov, qaytarish va chek bilan to‘lov tarixi turadi.",
            "O‘quvchining balansi har bir guruh uchun alohida: har oy guruh narxi (yoki o‘quvchining alohida narxi, yoki chegirma) hisoblanadi va to‘lovlar ayiriladi. Manfiy balans o‘quvchi qarzdor ekanini bildiradi; bosh sahifa bunday o‘quvchilarni qarzdor deb sanaydi.",
          ],
        },
        moreTabs: {
          title: "Progress, izohlar, ota-onasi va qo‘ng‘iroqlar",
          body: [
            "**O‘quvchi progressi** davomat foizini, o‘rtacha bahoni va imtihon natijalarini oy va guruh bo‘yicha ko‘rsatadi. **Test natijalari** topshirishlar va mavzu bo‘yicha aniqlikni ko‘rsatadi. **Izoh va eslatmalar** xodimlar sezgan narsalarni saqlaydi; izohni guruh sahifasidan ham qo‘shish mumkin. **SMS** shu o‘quvchiga yuborilgan har bir xabarni ko‘rsatadi. **O‘quvchi tarixi** yaratilishidan oxirgi to‘lovgacha har bir o‘zgarishning vaqt chizig‘i. **Ota-onasi** da SMS olishi mumkin bo‘lgan, telefonli ota-onalar turadi. **Qo‘ng‘iroqlar** telefoniya integratsiyasi yozib olgan qo‘ng‘iroqlarni ko‘rsatadi va bir bosishda qo‘ng‘iroq qilish uchun **Qo‘ng‘iroq qilish** tugmasi bor.",
          ],
        },
        importExport: {
          title: "Excel import va eksport",
          body: [
            "**Excel orqali import** bir vaqtda ko‘p o‘quvchi qo‘shadi: shablonni yuklab oling, ustun sarlavhalarini saqlagan holda har bir o‘quvchi uchun bir qator to‘ldiring, faylni yuklang va natijani o‘qing, u nechta qator import qilingani va qaysilari nima sababdan o‘tkazib yuborilganini aytadi. Guruh sahifasidan bitta guruhga ko‘p o‘quvchi qo‘shish ham xuddi shunday ishlaydi.",
            "Istalgan ro‘yxatdagi **Excel** ko‘rib turganingizni joriy filtrlar bilan, interfeys tilida yuklab oladi.",
            "Xonalar, kurslar va xodimlar uchun ham Sozlamalar sahifalarida shunday **Excel orqali import** bor, guruhlar uchun Guruhlar sahifasida, ota-onalar uchun O‘quvchilar sahifasidagi **Import** menyusida; shunda Kampus’ga o‘tayotgan markaz bir nechta fayldan yuklanadi. Har bir oynaning o‘z shabloni bor va CSV ham qabul qilinadi. Paroli bo‘lmagan xodimlarga vaqtinchalik parol yaratilib, importdan keyin bir marta ko‘rsatiladi.",
          ],
        },
        leaving: {
          title: "Arxivlash va qora ro‘yxatga olish",
          body: [
            "**Arxivlash** o‘quvchini har bir guruhdan chiqaradi va arxivga o‘tkazadi; keyin uni tiklash mumkin. **Qora ro‘yxatga olish** xuddi shunday qiladi va bundan tashqari qora ro‘yxatdan chiqarilmaguncha o‘quvchini biror guruhga qo‘shishga yo‘l qo‘ymaydi; undan qaytib kelmasligi kerak bo‘lgan odamlar uchun foydalaning. Ikkalasi ham ro‘yxatdagi qator menyusida va profilda bor. O‘quvchini qolganlarini saqlab, bitta guruhdan chiqarish guruh sahifasida qilinadi.",
          ],
        },
      },
    },
    payments: {
      title: "To‘lovlar va cheklar",
      summary:
        "To‘lovni kiritish, chek chop etish, pul qaytarish, chegirmalar, to‘lovlar jurnali va onlayn to‘lash.",
      sections: {
        balance: {
          title: "Hisoblash qanday ishlaydi",
          body: [
            "Guruhdagi har bir faol o‘quvchidan har oyning birinchi kunida guruhning oylik narxi hisoblanadi, to‘liq bo‘lmagan birinchi oy uchun esa mutanosib ravishda. A’zolikdagi alohida narx yoki chegirma shu o‘quvchi uchun guruh narxining o‘rnini bosadi. To‘lovlar balansni kamaytiradi; manfiy balans qarzdir. Yangi va sinovdagi o‘quvchilardan faollashtirilguncha to‘lov hisoblanmaydi.",
            "Bosh sahifa qarzdorlar va to‘lovi yaqinlarni sanaydi; o‘quvchilar ro‘yxati to‘lov holati bo‘yicha saralaydi; Moliya sahifasi qarzi bor o‘quvchilarni ko‘rsatadi.",
          ],
        },
        record: {
          title: "To‘lovni kiritish",
          body: [
            {
              steps: [
                "Yuqori panelda **To‘lov** ni bosib o‘quvchini ism yoki telefon bo‘yicha toping, yoki o‘quvchi profilida **To‘lov qilish** ni, yoki guruh sahifasida o‘quvchi qatoridagi **To‘lov** ni bosing.",
                "To‘lov turini (naqd, karta, o‘tkazma, Sozlamalar → Umumiy sozlamalarda sozlanganidek) va, o‘quvchi bir nechta guruhda bo‘lsa, guruhni tanlang. Oyna balans va oylik narxni ko‘rsatadi.",
                "Summani kiriting yoki oylik narxni olish uchun **To‘ldirish** ni bosing. To‘lov qaysi oy uchun ekanini va to‘lov sanasini tanlang, kerak bo‘lsa, izoh yozing. Bonus to‘lov **Bonus** bilan belgilanadi.",
                "**Saqlash** ni bosing. Balans yangilanadi, to‘lov tarixda paydo bo‘ladi va, markaz har to‘lovdan keyin chek chop etsa, chek chop etish uchun ochiladi.",
              ],
            },
            "To‘lovlar uchun avto-SMS sozlangan bo‘lsa, o‘quvchi (va ota-onasi) summa yozilgan xabar oladi. Bot xabarnoma ro‘yxatidagi xodimlar Telegram xabari oladi.",
          ],
        },
        receipt: {
          title: "Chek",
          body: [
            "Har bir to‘lovning cheki bor: uni to‘lov tarixidagi **Chek** havolasidan oching va **Chop etish** ni bosing. Unda markazning nomi, manzili va telefoni, o‘quvchi, guruh, summa, oy, to‘lov turi va kassir QR kod bilan ko‘rsatiladi. Chekda nima ko‘rinishi va logotip qayerda turishi Sozlamalar → Chek sozlamalari bo‘limida jonli ko‘rinish bilan sozlanadi.",
          ],
        },
        refund: {
          title: "Pul qaytarish",
          body: [
            "Pul qaytarish faqat Sozlamalar → Umumiy sozlamalarda **Pul qaytarish funksiyasi** tugmasi yoqilgan bo‘lsa mumkin. O‘quvchi profilida **Pul qaytarish** ni bosing, to‘lovni tanlang, summani (o‘sha to‘lovdan qolgan miqdorgacha) va sababni kiriting. Qaytarish to‘lov tarixida va to‘lovlar jurnalida ko‘rinadi, balans esa qayta oshadi.",
          ],
        },
        openingBalances: {
          title: "Boshlang'ich qoldiqlar va to'g'rilashlar",
          body: [
            "Kampus'ga o'tayotgan o'quv markazi o'quvchilarning qarzlari va oldindan to'lovlarini ham olib o'tadi. O'quvchi profilida **Qoldiqni to'g'rilash** ni bosing, guruhni tanlang, o'quvchi qarzdor yoki ortiqcha puli borligini belgilang, summa, turi (**Boshlang'ich qoldiq** yoki **To'g'rilash**), sana va izohni kiriting. Summa to'lov kabi balansga qo'shiladi: qarz darhol qarzdorlar ro'yxatida, eslatmalarda va hisobotlarda ko'rinadi, qator esa to'lov tarixi ostida paydo bo'ladi va pul qaytarish huquqi bor xodim uni o'chira oladi.",
            "Ko'p o'quvchi uchun birdaniga: O'quvchilar sahifasida **Boshlang'ich qoldiqlarni import qilish** ni bosing, shablonni yuklab oling va har bir o'quvchi va guruh uchun bir qator to'ldiring. Qarz manfiy, o'quvchining ortiqcha puli musbat son bilan yoziladi; «qarz» nomli ustun ham ishlaydi (musbat son = qarzdor). O'quvchi Kampus ID, telefon yoki aniq ism bo'yicha, guruh nomi bo'yicha topiladi (o'quvchi bitta guruhda bo'lsa, guruh shart emas), «filial» ustuni boshqa filialni ko'rsatishi mumkin. Birinchi yuklash faqat oldindan ko'rsatadi: qaysi qatorlar mos kelgani va qaysilari o'tkazib yuborilishi; **Import qilish** bosilmaguncha hech narsa yozilmaydi. O'quvchining boshlang'ich qoldig'i bo'lgan guruh o'tkazib yuboriladi, shuning uchun bir xil faylni ikki marta yuklash hech kimning qarzini ikki baravar qilmaydi.",
          ],
        },
        discounts: {
          title: "Chegirmalar",
          body: [
            "Chegirma — bitta o‘quvchi uchun bir necha oyga pasaytirilgan oylik narx. Guruh sahifasida **Chegirmalar** yorlig‘ini oching, **Chegirma berish** ni bosing, o‘quvchini, chegirmali narxni, oylar sonini va izohni tanlang. Yorliq necha oy qolganini ko‘rsatadi. Chegirmani olib tashlash uni joriy oydan tugatadi; o‘tgan oylar hisoblanganicha qoladi.",
          ],
        },
        log: {
          title: "To‘lovlar jurnali",
          body: [
            "Sozlamalar → To‘lovlar tashkilot bo‘yicha har bir to‘lov va qaytarishni sana, o‘quvchi, guruh, summa, to‘lov turi va qabul qilgan kassir bilan ko‘rsatadi. Sanalar, to‘lov turi va kassir bo‘yicha saralang; **Excel** uni yuklab oladi. Hisobotlar → To‘lovlar va O‘quvchi to‘lovlari xuddi shu ma’lumotni o‘qituvchi, xodim va o‘quvchi bo‘yicha jamlaydi.",
          ],
        },
        online: {
          title: "Onlayn to‘lash",
          body: [
            "Sozlamalar → Integratsiyalar bo‘limida Payme yoki Click sozlangan bo‘lsa, o‘quvchilar shaxsiy sahifasida **Onlayn to‘lash** ni ko‘radi: ular oy va summani tanlab, karta bilan to‘laydi. Provayder to‘lovni tasdiqlaydi va u Kampusda Payme yoki Click to‘lov turi bilan, o‘quvchi tarixida va jurnalda o‘zi paydo bo‘ladi.",
          ],
        },
      },
    },
    debts: {
      title: "Qarzdorlar",
      summary:
        "Qarz birinchi minusdan to‘lovgacha: ro‘yxat, qo‘ng‘iroqlar va va’dalar, avtomatik eslatmalar.",
      sections: {
        list: {
          title: "Qarzdorlar ro‘yxati",
          body: [
            "**Qarzdorlar** filialdagi balansi minusga tushgan har bir o‘quvchini ko‘rsatadi: summa, qarz necha kundan beri turibdi (birinchi to‘lanmagan oydan hisoblanadi), berilgan va’da, oxirgi marta kim gaplashgani va natijasi. O‘quvchi balansi minusga tushishi bilan paydo bo‘ladi va to‘lagach ro‘yxatdan chiqadi; qo‘lda hech narsa ochish yoki yopish kerak emas.",
            "Ro‘yxat ustidagi kartochkalar qarzdorlar sonini, umumiy qarzni, to‘lashga va’da berganlar va qo‘ng‘iroq kutayotganlar sonini ko‘rsatadi. **Ko‘rsatish** ro‘yxatni ochiq, va’da bergan, qo‘ng‘iroq kerak yoki yopilganlargacha qisqartiradi; qidiruv ism yoki telefonni topadi. **Excel** ro‘yxatni ekrandagidek yuklab beradi.",
          ],
        },
        contact: {
          title: "Qo‘ng‘iroqlar, va’dalar va eslatmalar",
          body: [
            {
              steps: [
                "Qator menyusini ochib **Qo‘ng‘iroq qilib natijani yozish** (telefon raqamlari havola) yoki tashrif, SMS yoki izoh uchun **Aloqani yozish**ni tanlang.",
                "O‘quvchi bilan qanday bog‘langaningizni va natijani belgilang: javob bermadi, to‘lashga va’da berdi, rad etdi, noto‘g‘ri raqam yoki boshqa.",
                "Va’da uchun sanani va kelishilgan bo‘lsa summani kiriting. Holatda **Va’da bergan** belgisi chiqadi, avtomatik eslatmalar shu kungacha to‘xtaydi.",
                "**Telegramda eslatish** o‘quvchining Telegrami ulangan bo‘lsa, markaz boti orqali darhol xabar yuboradi.",
              ],
            },
            "Qarz to‘langach holat **Va’da bajarildi** yoki **To‘landi** deb yopiladi. Va’da qilingan kun o‘tib qarz qolsa, holat yana ochiladi, va’da bajarilmagan deb belgilanadi, filial menejerlariga xabar boradi va qatorga **Qo‘ng‘iroq** belgisi qo‘yiladi. **Tarix** barcha aloqalar va avtomatik xabarlarni ko‘rsatadi.",
          ],
        },
        cadence: {
          title: "Avtomatik eslatmalar",
          body: [
            "Har bir markaz Sozlamalar → Markaz sozlamalari → **Qarz eslatmalari** bo‘limida o‘z tartibini belgilaydi: qarzdor necha kundan keyin Telegram xabari oladi, keyin SMS (Auto SMS sozlamalaridagi qarzdor matni, tugma yoqilgan bo‘lsa) va qo‘ng‘iroqsiz necha kundan keyin filial menejerlari qo‘ng‘iroqchada vazifa oladi. Bo‘sh qoldirilgan maydon bosqichni o‘chiradi. Va’da bergan o‘quvchiga va’da kunigacha eslatilmaydi.",
          ],
        },
      },
    },
    exams: {
      title: "Imtihonlar",
      summary:
        "Guruh imtihonlari va mock imtihonlar: rejalashtirish, arizalar, ballar va natijalar.",
      sections: {
        list: {
          title: "Imtihonlar ro‘yxati",
          body: [
            "Imtihonlarda ikkita yorliq bor: bitta guruh uchun o‘tkaziladigan **Guruh imtihonlari** va bir nechta guruh o‘quvchilari uchun pullik ochiq bo‘lgan **Mock imtihonlar**. Holat (boshlanmagan, yakunlangan), guruh va sanalar bo‘yicha saralang. Har bir qatorda sana, vaqt, imtihon oluvchi, xona va o‘quvchilar soni ko‘rinadi. Qator menyusi natijalar varag‘ini ochadi, imtihonni yakunlaydi yoki qayta ochadi, yoki o‘chiradi.",
            "O‘qituvchilar imtihon jadvalini faqat administrator buni Sozlamalar → Umumiy sozlamalarda yoqqan bo‘lsa ko‘radi.",
          ],
        },
        groupExam: {
          title: "Guruh imtihoni",
          body: [
            {
              steps: [
                "**Imtihon qo‘shish** ni bosing va **Guruh imtihoni** turini qoldiring. Nom bering, guruhni tanlang va u oldingi imtihonni takrorlasa, **Qayta topshirish** ni belgilang.",
                "Sanani hamda boshlanish va tugash vaqtini belgilang. **Qo‘shimcha ma’lumotlar** ostida imtihon oluvchi va xonani tanlang.",
                "Baholash tizimini (odatda kursniki) yoki o‘tish bali va maksimal ball bilan **Maxsus** ni tanlang.",
                "**Saqlash** ni bosing. Guruhning har bir faol o‘quvchisi varaqda bo‘ladi.",
              ],
            },
            "Xuddi shu imtihonni guruhning **Imtihonlar** yorlig‘idan, guruh allaqachon tanlangan holda yaratish mumkin.",
          ],
        },
        mockExam: {
          title: "Mock imtihon",
          body: [
            "**Mock imtihon** turini tanlang. Sana va baholashdan tashqari narx va sig‘imni belgilang, so‘ng qaysi guruhlar yozilishi mumkinligini tanlang: kurs, filiallar va o‘quvchi o‘qigan minimal oylar bo‘yicha saralab, guruhlarni tanlang. O‘quvchilar natijalar sahifasidan **O‘quvchi yozish** bilan yoziladi; varaq arizalarni sig‘imga nisbatan ko‘rsatadi.",
          ],
        },
        grading: {
          title: "Natijalarni kiritish",
          body: [
            {
              steps: [
                "Imtihonning **Natijalar** ini oching. Har bir o‘quvchida kelgan-kelmagan tugmasi, ball maydoni va izoh bor.",
                "Kelmagan o‘quvchilarni belgilang; qolganlari uchun ballni kiriting. Daraja va o‘tdi yoki o‘tmadi natijasi baholash tizimi yoki o‘tish balidan hisoblanadi.",
                "**Natijalarni saqlash** ni bosing. Imtihon ochiq ekan, qaytib kelib ballarni o‘zgartirishingiz mumkin.",
                "Ballar yakuniy bo‘lganda **Yakunlash** ni bosing. Yakunlash, agar o‘sha avto-SMS yoqilgan bo‘lsa, natija SMSini yuboradi va varaqni qulflaydi; **Qayta ochish** qulfni ochadi.",
              ],
            },
            "Natijalar o‘quvchining progress yorlig‘ida va shaxsiy sahifasida Natijalar ostida ko‘rinadi.",
          ],
        },
      },
    },
    testsAndCoins: {
      title: "Testlar va coinlar",
      summary:
        "Savollar banki, testlar va natijalar; coin qoidalari, coin berish, reyting va marketplace.",
      sections: {
        bank: {
          title: "Savollar banki",
          body: [
            "Sozlamalar → Test sozlamalarida savollar banki turadi: fan va mavzuli, variantli savollar. **Savol qo‘shish** ni bosing, savolni yozing, javob variantlarini qo‘shing va to‘g‘risini belgilang. Savollarni qidirish va fan hamda mavzu bo‘yicha saralash mumkin. Testda ishlatilgan savolni o‘chirib bo‘lmaydi.",
          ],
        },
        tests: {
          title: "Test yaratish",
          body: [
            {
              steps: [
                "**Testlar** yorlig‘ida **Test yaratish** ni bosing. Nom bering va fanni tanlang.",
                "Vaqt chegarasini, foizdagi o‘tish balini va, bo‘lsa, muddatni belgilang.",
                "Testni topshiradigan guruhlarni belgilang va bankdan savollarni har bir savol uchun ball bilan tanlang.",
                "Qoralama sifatida saqlang, tayyor bo‘lganda **Faollashtirish** ni bosing. Natijalari bor testning savollari qulflangan holda qoladi; davr tugaganda uni **Yopish** bilan yoping.",
              ],
            },
          ],
        },
        attempts: {
          title: "Natijalarni kiritish",
          body: [
            "O‘quvchilar testni sinfda topshiradi; natijani xodimlar kiritadi. Testni oching va **Natija kiritish** ni bosing, o‘quvchi va guruhni tanlang va ballni kiriting. Test qatori topshirishlar sonini va o‘rtacha aniqlikni ko‘rsatadi. Natijalar guruhning **Bilim tahlili** yorlig‘ida, o‘quvchining **Test natijalari** yorlig‘ida va o‘quvchining shaxsiy sahifasida ko‘rinadi. Test natijalari uchun avtomatik coinlar yoqilgan bo‘lsa, o‘tilgan test coinlarni o‘zi beradi.",
          ],
        },
        coinRules: {
          title: "Coin qoidalari",
          body: [
            "Sozlamalar → Coin sozlamalari avtomatik coin tizimini yoqadi yoki o‘chiradi va har bir hodisa nechta coin berishini belgilaydi: darsga kelish, qabul qilingan uy vazifasi, o‘tilgan test va tug‘ilgan kun. Pastda o‘qituvchilar coin berishda tanlashi mumkin bo‘lgan qo‘lda beriladigan sabablar turadi, har birining maksimumi bilan, masalan “Darsda faol, 5 tagacha”. Avtomatik tizimni o‘chirish qo‘lda coin berishga ta’sir qilmaydi.",
          ],
        },
        giveCoins: {
          title: "Coin berish",
          body: [
            "Guruh sahifasining **Coinlar** yorlig‘ida **Coin berish** ni bosing, o‘quvchini, sababni va sabab maksimumi doirasida coin sonini izoh bilan tanlang. Yorliq guruh o‘quvchilarini coinlar bo‘yicha saralab ko‘rsatadi. Berilgan yoki sarflangan har bir coin kim bergani va nima uchun ekani bilan yozib boriladi.",
          ],
        },
        marketplace: {
          title: "Reyting va marketplace",
          body: [
            "Hisobotlar → Coinlar da uchta yorliq bor. **Reyting** o‘quvchilarni hafta, oy yoki butun davr uchun, filial, kurs yoki guruh bo‘yicha coinlar bo‘yicha saralaydi, har bir o‘quvchining tarixi bilan. **Marketplace** — o‘quvchilar coinga sotib olishi mumkin bo‘lgan mahsulotlar ro‘yxati, kategoriyalarga bo‘lingan, narxi va zaxirasi bilan. **Xarid so‘rovlari** o‘quvchilar so‘ragan narsalarni ko‘rsatadi, ularni xodimlar **Yangi so‘rov** bilan kiritadi; coinlarni yechib, mahsulotni topshirish uchun so‘rovni tasdiqlang yoki rad eting.",
          ],
        },
      },
    },
    finance: {
      title: "Moliya",
      summary:
        "Kirim va chiqimlar, oylik reja, bo‘limlar, avanslar, bonuslar, jarimalar va ish haqi.",
      sections: {
        overview: {
          title: "Asosiy ko‘rsatkichlar",
          body: [
            "Moliya filial, yil, oy va to‘lov turi filtrlari bilan ochiladi, so‘ng asosiy ko‘rsatkichlar: tushumlar, chiqimlar, foyda, aktiv balans (o‘quvchilar hali qarz bo‘lgan summa), LTV (bir o‘quvchidan siz bilan bo‘lgan davrdagi o‘rtacha daromad), CAC (har bir yangi o‘quvchi uchun marketing xarajati), marketing samaradorligi va o‘rtacha to‘lov. Halqa diagramma tushumlarni to‘lov turi bo‘yicha bo‘ladi, ustunli diagramma esa yil aylanmasini oyma-oy ko‘rsatadi.",
          ],
        },
        plan: {
          title: "Oylik reja",
          body: [
            "Reja kartochkasi shu oyda har bir faol o‘quvchining oylik to‘lovidan kutilgan summani erishilgan summa bilan solishtiradi. **Tasir vaqti** tugmasi to‘lovlar qilingan oyda yoki tegishli bo‘lgan oyda hisoblanishini o‘zgartiradi. Faol qarzdorlik va oldindan to‘lovlar uning yonida ko‘rsatiladi.",
          ],
        },
        categories: {
          title: "Chiqimlar va kirimlar",
          body: [
            "Ko‘rsatkichlar ostida har birining shu oydagi jami summasi bilan chiqim va kirim bo‘limlari turadi: ijara, maoshlar, kommunal to‘lovlar, reklama yoki kitob sotuvi kabi qo‘shimcha daromad. Yangisini qo‘shish uchun **Bo‘lim** ni bosing.",
            {
              steps: [
                "Yozuvlarini ko‘rish uchun bo‘limni oching.",
                "**Chiqim kiritish** ni yoki kirim uchun **Yangi qo‘shish** ni bosing. Summani, to‘lov turini, sanani, kimga to‘langanini va izohni kiriting.",
                "**Saqlash** ni bosing. Yozuv darhol asosiy ko‘rsatkichlarda va oylik jami summalarda hisobga olinadi.",
              ],
            },
            "Yozuvlarni bo‘lim sahifasidan tahrirlash yoki o‘chirish mumkin; har bir o‘zgarish amallar jurnalida qoladi.",
          ],
        },
        staffMoney: {
          title: "Avanslar, bonuslar, jarimalar, marketing va investitsiyalar",
          body: [
            "**Xodimlarga bonus va jarimalar** kartochkalari hamda Avanslar, Marketing va Investitsiyalar bo‘limlari bir xil turdagi daftarlar, har birining o‘z formasi bor. Avans, bonus yoki jarima xodimga bog‘lanadi va o‘sha oydagi ish haqiga tushadi: bonuslar qo‘shiladi, jarimalar va avanslar ayiriladi. Marketing yozuvlari CAC ko‘rsatkichiga kiradi. Investitsiyalar operatsion ko‘rsatkichlardan alohida saqlanadi.",
          ],
        },
        payroll: {
          title: "Ish haqi",
          body: [
            "**Ish haqi hisobotlari** kartochkasi har oyning ish haqini ko‘rsatadi. Hisoblash uchun oyni oching: har bir xodim uchun bitta qator, doimiy oylik, kurs narxidan foiz × o‘quvchilar, dars haqi × o‘tilgan darslar, talaba ulushi × o‘quvchilar bilan, bonuslar qo‘shilib, jarimalar va avanslar ayirilgan holda, har bir qator ostida guruhlar bo‘yicha taqsimot bilan.",
            {
              steps: [
                "Har bir qatorni tekshiring; maosh hisoblash usuli va stavkalar xodim profilidan va guruhdagi o‘qituvchi ulushlaridan olinadi.",
                "Davomatni, guruh o‘qituvchisini yoki bonusni tuzatgandan keyin **Qayta hisoblash** ni bosing; allaqachon tasdiqlangan qatorlar o‘z summasini saqlab qoladi.",
                "Har bir qator to‘g‘ri bo‘lganda **Tasdiqlash** ni bosing. Tasdiqlash uchun ish haqi huquqi kerak; CEO da u har doim bor.",
                "**Excel** oyni buxgalter uchun eksport qiladi.",
              ],
            },
            "O‘qituvchiga guruhning dam kuni uchun haq to‘lanishi yoki faqat o‘zi kelgan darslar uchun to‘lanishi, hamda o‘qituvchilar o‘z maoshini ko‘rishi Sozlamalar → Umumiy sozlamalardagi tugmalar orqali belgilanadi.",
          ],
        },
      },
    },
    reports: {
      title: "Hisobotlar",
      summary: "Har bir hisobot nimaga javob beradi va uni qanday eksport qilish mumkin.",
      sections: {
        index: {
          title: "Hisobotlar sahifasi",
          body: [
            "Hisobotlar — kartochkalar sahifasi, har bir hisobot uchun bittadan. Har bir hisobotning yuqorisida filtrlar (filial, davr va hisobotga kerak bo‘lgan narsalar) va jadvalni ko‘rib turganingizdek, interfeys tilida yuklab oladigan **Excel** tugmasi bor.",
          ],
        },
        money: {
          title: "To‘lov hisobotlari",
          body: [
            "**To‘lovlar**: oyning jami to‘lovlari, o‘z vaqtida to‘langan, kechikib to‘langan, chegirmalar, bonuslar va qaytarilganlar, so‘ng o‘qituvchi bo‘yicha jadval va pulni qabul qilgan xodim bo‘yicha yana bitta jadval. **O‘quvchi to‘lovlari**: davrning har bir to‘lovi o‘quvchi, guruh va o‘qituvchi bo‘yicha, to‘lovlarni qamrab olgan oy o‘rniga qilingan vaqti bo‘yicha hisoblaydigan **To‘lov sanasi bo‘yicha** tugmasi bilan.",
          ],
        },
        students: {
          title: "O‘quvchilar hisobotlari",
          body: [
            "**Ketgan o‘quvchilar**: ketish darajasi, nechta ketgani, yo‘qotilgan daromad va o‘rtacha o‘qish muddati, ketganlar oy, sabab, kurs, o‘qituvchi va filial bo‘yicha; **Sabablarni sozlash** xodimlar o‘quvchini chiqarishda tanlaydigan ketish sabablari ro‘yxatini tahrirlaydi. **Bitiruvchilar**: kim bitirgani, ular bilan nima bo‘lganini yozish uchun IELTS, CEFR, universitet va ishga joylashish maydonlari bilan. **O‘quvchilar**: markaz bo‘yicha davomat va o‘zlashtirish.",
          ],
        },
        center: {
          title: "Markaz, lidlar, xodimlar va coinlar",
          body: [
            "**Markaz statistikasi**: oy, hafta yoki kun uchun xonalar guruhlarga nisbatan, bandlik bilan; bosh sahifadagi belgi shu yerga olib boradi. **Lid hisobotlari**: qancha lid kelgani, qaysi manbalardan va nechtasi o‘quvchiga aylangani, voronka va diagrammalar ko‘rinishida. **Xodimlar davomati**: kim kelgani, kim kechikkani va kim kelmagani, FaceID terminallaridan yoki qo‘lda kiritilgan belgilardan, kunlik, haftalik va oylik, har bir kishining ish jadvali bilan. **Coinlar**: reyting, marketplace va xarid so‘rovlari.",
          ],
        },
        excel: {
          title: "Excel",
          body: [
            "Har bir hisobotda va ko‘pchilik ro‘yxatlarda **Excel** bor. Fayl siz belgilagan filtrlarni va ustun nomlarini sizning tilingizda saqlaydi. Uni Excel, Numbers yoki Google Sheets da oching.",
          ],
        },
      },
    },
    staffAndRoles: {
      title: "Xodimlar va rollar",
      summary:
        "O‘qituvchilar va boshqa xodimlarni qo‘shish, maosh hisoblash usullari, huquqli rollar va arxivlash.",
      sections: {
        teachers: {
          title: "O‘qituvchilar va xodimlar",
          body: [
            "O‘qituvchilar o‘qituvchilar va support o‘qituvchilar yorliqlari, qidiruv va rol filtri bilan dars beruvchi xodimlarni ko‘rsatadi; profilini, guruhlarini va ish haqi qatorlarini ko‘rish uchun o‘qituvchini oching. Sozlamalar → Xodimlar tizimga kiradigan hammani, shu jumladan adminlar va kassirlarni, rol filtri bilan ko‘rsatadi. Ikkala sahifa ham odamlarni bir xil forma bilan qo‘shadi va tahrirlaydi.",
          ],
        },
        add: {
          title: "Xodim qo‘shish",
          body: [
            {
              steps: [
                "O‘qituvchilar sahifasida **Yangi o‘qituvchi** ni yoki Sozlamalar → Xodimlar da **Yangi xodim** ni bosing.",
                "Rasm, ism familiya, telefon raqam, jinsi, tug‘ilgan sana va ishga olingan sanani qo‘shing.",
                "Odam tizimga kiradigan parolni belgilang yoki **Yaratish** ni bosing. Telefon va parolni unga ayting; ularni keyin shu yerda o‘zgartirish mumkin.",
                "Odam ishlaydigan filiallarni va rollarini tanlang. Bir odamda bir nechta rol bo‘lishi mumkin; huquqlari qo‘shiladi.",
                "Maosh hisoblash usuli va stavkani tanlang (quyida qarang), so‘ng **Saqlash** ni bosing.",
              ],
            },
            "O‘z rollaringizni o‘zgartira olmaysiz va o‘zingizni arxivlay olmaysiz; buni boshqa administrator qiladi.",
          ],
        },
        salary: {
          title: "Maosh hisoblash usullari",
          body: [
            "**Oylik**: doimiy maosh. **Foiz**: odam dars beradigan guruhlardagi har bir o‘quvchi uchun kurs narxidan ulush. **Dars haqi**: har bir o‘tilgan dars uchun haq. **Talaba ulushi**: har bir o‘quvchi uchun haq. Profildagi usul va stavka odatiy qiymatlar; har bir guruh o‘z o‘qituvchilari uchun boshqa ulush belgilashi mumkin. Moliyadagi ish haqi oyni shulardan hisoblaydi.",
          ],
        },
        roles: {
          title: "Rollar va huquqlar",
          body: [
            "Sozlamalar → Rollar rollar ro‘yxatini va har birida nechta huquq borligini ko‘rsatadi; huquqlarini ko‘rish va belgilash uchun rolni oching: har bir bo‘limda ko‘rish, yaratish, tahrirlash va o‘chirish, davomat qilish, to‘lov qabul qilish, pul qaytarish va chegirma berish, ish haqini tasdiqlash, SMS yuborish, sozlamalarni tahrirlash va jurnallarni o‘qish. O‘rnatilgan rollar: CEO, admin, filial menejeri, kassir, o‘qituvchi, support o‘qituvchi, marketolog va kuzatuvchi.",
            "O‘z rolingizni yaratish uchun **Yangi rol** ni bosing, masalan faqat lid qo‘shishi va to‘lov qabul qilishi mumkin bo‘lgan qabulxona xodimi, va huquqlarini belgilang. Faqat o‘zingizda bor huquqlarni bera olasiz. CEO rolini qisqartirib bo‘lmaydi.",
          ],
        },
        archive: {
          title: "Kimdir ketganda",
          body: [
            "Odamning qatoridagi yoki profilidagi **Arxivlash** uni tizimdan chiqaradi, ro‘yxatlardan yashiradi va tarixini, guruhlarini hamda ish haqi qatorlarini saqlab qoladi. Arxivlangan o‘qituvchining guruhlari ishlashda davom etadi; o‘qituvchisini guruh sahifasida o‘zgartiring. Odamni keyin xuddi shu telefon raqam bilan tiklash mumkin.",
          ],
        },
      },
    },
    settings: {
      title: "Sozlamalar",
      summary:
        "Markaz nomi va ish vaqti, qoidalar, filiallar, kurslar, xonalar, dam olish kunlari, SMS, cheklar, formalar va jurnallar.",
      sections: {
        general: {
          title: "Umumiy sozlamalar",
          body: [
            "Sozlamalar → Umumiy sozlamalarda ikkita yorliq bor. **Markaz sozlamalari** da yuqori panelda va cheklarda ko‘rinadigan tashkilot nomi, xonalar jadvalida ishlatiladigan ish vaqti va vaqt intervali, qoidalar, filiallar va to‘lov usullari turadi. **Auto SMS sozlamalari** qaysi hodisalar qaysi shablon bilan SMS yuborishini tanlaydi: tug‘ilgan kun, imtihon natijasi, to‘lov, darsga kelmaslik, to‘lovi yaqin qolganlik, qarzdorlik ogohlantirishi, birinchi dars oldidagi kun va boshqalar.",
            "Filiallar: har bir kurs, xona va guruh biror filialga tegishli. **Yangi filial** bilan filial qo‘shing; uni nofaol qilish har bir tanlovdan yashiradi va yozuvlarini saqlab qoladi. Naqd, karta va o‘tkazma kabi to‘lov usullari to‘lov oynasidagi tanlovlardir.",
          ],
        },
        switches: {
          title: "Qoidalar",
          body: [
            "**O‘quvchining ortiqcha to‘lovi keyingi oylarga bo‘lib yuborilsin**: oylik narxdan ortiq summa keyingi oylarni qoplaydi. **Pul qaytarish funksiyasi**: pul qaytarish tugmasini ko‘rsatadi. **To‘lovdan so‘ng chek chiqsin**: to‘lov saqlanganda chekni ochadi. **Davomatga izoh yozish**. **Ustozlar va support ustozlar imtihon jadvalini ko‘rsin**. **Faqat dars vaqtida yo‘qlama qilish mumkin**: admin va CEO uchun cheklov yo‘q. **O‘qituvchiga oylik maoshi ko‘rinsin**. **Guruhga dam berilganida o‘qituvchiga oylik yozilsin** va **O‘qituvchiga faqat kelgan darslar uchun oylik yozilsin** ish haqini o‘zgartiradi. **O‘qituvchi o‘quvchi qo‘sha oladi** o‘z guruhlariga. Qolganlari support o‘qituvchilar va guruhli support uchrashuvlariga tegishli.",
          ],
        },
        catalog: {
          title: "Kurslar, xonalar, dam olish kunlari, maktablar",
          body: [
            "**Kurslar**: kursning nomi, filiali, oylik narxi, oylardagi davomiyligi, rangi va baholash tizimi bor; guruhlar kurslardan yaratiladi. Baholash tizimlari (CEFR, IELTS, 1 dan 5 gacha, 0 dan 100 gacha yoki o‘zingizniki) xuddi shu sahifada sozlanadi. **Xonalar**: har bir filial uchun nom va sig‘im; bosh sahifadagi jadval ulardan tuziladi. **Dam olish kunlari**: filial bo‘yicha dars rejalashtirilmaydigan bayramlar. **Maktablar**: o‘quvchilar o‘qiydigan maktablar, o‘quvchi formasi va filtrlar uchun.",
          ],
        },
        sms: {
          title: "SMS shablonlari",
          body: [
            "Sozlamalar → SMS shablonlarida SMS yuborish oynasi va avto-SMS uchun kategoriyalarga bo‘lingan tayyor matnlar turadi. Shablonda har bir qabul qiluvchi uchun to‘ldiriladigan o‘zgaruvchilar ishlatilishi mumkin: o‘quvchi ismi, guruh, sana, summa, qarz, ball va markaz nomi. **Eskizdan import qilish** Eskiz hisobingizda tasdiqlangan shablonlarni nusxalaydi. SMS shlyuzining o‘zi Integratsiyalar bo‘limida sozlanadi; ungacha xabarlar yozib qo‘yiladi, lekin yetkazilmaydi.",
          ],
        },
        receipt: {
          title: "Chek sozlamalari",
          body: [
            "Sozlamalar → Chek sozlamalari chop etiladigan chekda nima ko‘rinishini belgilaydi: manzil va telefon, qaysi qismlar ko‘rinishi, logotip qayerda turishi va pastki qism matni, jonli ko‘rinish bilan. Unga yuqori paneldagi ismingiz orqali ham o‘tish mumkin.",
          ],
        },
        forms: {
          title: "Veb-formalar",
          body: [
            "Sozlamalar → Formalar ochiq lid formalarini yaratadi; har birining havola nomi, lid bo‘limi va manbasi bor. Yuborilgan formalar qanday kelishini “Lidlar” da ko‘ring.",
          ],
        },
        logs: {
          title: "Jurnallar",
          body: [
            "**Tizimga kirishlar**: kim, qaysi manzildan kirgani va muvaffaqiyatsiz urinishlar. **Amallar tarixi**: xodimlar qilgan har bir o‘zgarish, yangilari yuqorida, yozuv turi va odam bilan; tur, odam va sanalar bo‘yicha saralang. **Yuborilgan SMS lar**: har bir xabar holati bilan. **Qo‘ng‘iroqlar**: telefoniya integratsiyasidan qo‘ng‘iroqlar jurnali. **To‘lovlar**: to‘lovlar jurnali. Jurnallarni tahrirlab bo‘lmaydi.",
          ],
        },
      },
    },
    integrations: {
      title: "Integratsiyalar",
      summary:
        "SMS, Telegram, AmoCRM, telefoniya, FaceID, video darslar va onlayn to‘lovlarni ulash.",
      sections: {
        overview: {
          title: "Integratsiyalar qanday ishlaydi",
          body: [
            "Sozlamalar → Integratsiyalar Kampus bog‘lana oladigan tashqi xizmatlarni ko‘rsatadi. Har birida **Yoqilgan** tugmasi va o‘z maydonlari bor; kirish ma’lumotlari shu yerda saqlanadi, hech qachon serverdagi fayllarda emas. Kampusga murojaat qiladigan xizmatlar (Telegram, telefoniya, FaceID, Payme, Click) provayder sozlamalariga qo‘yiladigan, siz belgilagan maxfiy kalit bilan himoyalangan webhook manzilini ko‘rsatadi. Xizmat yoqilmaguncha Kampus o‘rnatilgan o‘rinbosardan foydalanadi: SMS lar yozib qo‘yiladi, lekin yuborilmaydi, qo‘ng‘iroqlar jurnalga tushadi, lekin qilinmaydi.",
          ],
        },
        sms: {
          title: "SMS shlyuzi (Eskiz)",
          body: [
            "Eskiz hisobingizning e-mail, parol va jo‘natuvchi nomini kiriting va uni yoqing. Shundan boshlab SMS yuborish oynasi, ustun yoki ro‘yxatga ommaviy SMS, avto-SMS hodisalari va o‘quvchilarning video havolalari SMS orqali yetkaziladi. Yuborilgan xabarlar va ularning holati Sozlamalar → Yuborilgan SMS lar bo‘limida.",
          ],
        },
        telegram: {
          title: "Telegram bot",
          body: [
            "BotFather orqali bot yarating, uning tokeni va nomini qo‘ying, webhook maxfiy kalitini belgilang va uni yoqing. Shundan keyin ikki narsa ishlaydi. Sozlamalar → Bot xabarnoma ro‘yxatidagi xodimlar to‘lovlar va yangi o‘quvchilar haqida Telegram xabari oladi: har bir xodim botga **/id** yuboradi, siz esa u olgan ID ni u xabar olishi kerak bo‘lgan filiallar bilan kiritasiz. O‘quvchilar va ota-onalar o‘quvchining shaxsiy sahifasida **Telegramni ulash** ni bosadi va dars boshlanishiga taxminan o‘ttiz daqiqa qolganda eslatma, o‘qituvchi video darsni boshlaganda xabar, uy vazifasi xabarlari, yangi materiallar, qarz eslatmalari va to‘lov tasdiqlarini oladi.",
          ],
        },
        amocrm: {
          title: "AmoCRM",
          body: [
            "AmoCRM hisobingizdan integratsiya ID, maxfiy kalit, avtorizatsiya kodi va sub-domenni kiriting va **Ulanishni tekshirish** ni bosing. Yoqilganda har bir yangi lid fon vazifasi orqali AmoCRM ga yuboriladi.",
          ],
        },
        telephony: {
          title: "Telefoniya",
          body: [
            "Webhook maxfiy kalitini belgilang va ATS ingizni webhook manziliga yo‘naltiring. Tugagan qo‘ng‘iroqlar telefon raqami bo‘yicha moslashtirilib, Sozlamalar → Qo‘ng‘iroqlar bo‘limida va o‘quvchining **Qo‘ng‘iroqlar** yorlig‘ida ko‘rinadi. O‘quvchi profilidagi **Qo‘ng‘iroq qilish** tugmasi ATS dan raqam terishni so‘raydi.",
          ],
        },
        faceId: {
          title: "FaceID va xodimlar davomati",
          body: [
            "Qurilma maxfiy kalitini va necha daqiqa kechikish hisoblanishini belgilang hamda terminallarni webhook ga yo‘naltiring. Har bir IN va OUT hodisasi o‘sha telefon raqamli xodim uchun kirish yoki chiqish belgisiga aylanadi. Hisobotlar → Xodimlar davomati kunlik, haftalik va oylik davomatni ko‘rsatadi hamda har bir kishining ish jadvalini belgilash va qo‘lda kirish belgisini kiritish imkonini beradi.",
          ],
        },
        video: {
          title: "Video darslar",
          body: [
            "Video darslar ommaviy STUN serverlar orqali sozlamasiz ishlaydi. Ba’zi mobil yoki ofis tarmoqlaridagi o‘quvchilar ulana olmasa, shu yerda TURN relay server qo‘shing (server o‘rnatmasi bittasini o‘z ichiga oladi). Bitta qo‘ng‘iroqda ruxsat etilgan eng ko‘p odam sonini va dars yozuvlari o‘chirilguncha necha kun saqlanishini belgilang.",
          ],
        },
        onlinePayments: {
          title: "Payme va Click",
          body: [
            "Payme Business kassangiz yoki Click merchant kabinetingizdan merchant ma’lumotlarini kiriting va har bir forma ostidagi ko‘rsatmada tasvirlanganidek, webhook manzilini u yerda belgilang. Yoqilgach, o‘quvchilar shaxsiy sahifasida **Onlayn to‘lash** ni ko‘radi va tasdiqlangan to‘lovlar Kampusda Payme yoki Click to‘lov turi bilan to‘lov sifatida paydo bo‘ladi.",
          ],
        },
        jobs: {
          title: "Fon vazifalari",
          body: [
            "Avto-SMS, Telegram xabarlari, AmoCRM ga yuborishlar hamda tug‘ilgan kunlar va qarzdorlar bo‘yicha kunlik tekshiruvlar navbatda turadi va ularni ilova yonida ishlaydigan worker bajaradi. Worker ishlamayotgan bo‘lsa, ularni qo‘lda bajarish uchun Integratsiyalar sahifasida **Navbatdagi vazifalarni bajarish** ni bosing.",
          ],
        },
      },
    },
    organizations: {
      title: "Bu serverdagi tashkilotlar",
      summary:
        "Faqat server egasi uchun: bitta Kampusda har biri o‘z rahbari bilan bir nechta o‘quv markazini yuritish.",
      sections: {
        what: {
          title: "Tashkilot nima",
          body: [
            "Bitta Kampus serveri bir nechta o‘quv markazini yurita oladi. Har biri o‘z filiallari, xodimlari, o‘quvchilari, kurslari, sozlamalari, rollari va integratsiyalariga ega tashkilot; bir markazdagi hech kim boshqasining hech narsasini ko‘rmaydi. Serverning birinchi rahbari (CEO) uning **egasi**: Sozlamalar → Tashkilotlar bo‘limini faqat shu hisob ko‘radi. Server egasi bo‘lish boshqa hech narsa qo‘shmaydi; o‘z markazi ichida u oddiy CEO.",
          ],
        },
        create: {
          title: "Markaz yaratish",
          body: [
            {
              steps: [
                "Sozlamalar → Tashkilotlar ni oching va **Tashkilot qo‘shish** ni bosing.",
                "Markaz nomini va filiallarini, har birini alohida qatorda, kiriting.",
                "Rahbarning to‘liq ismi, telefon raqami va birinchi parolini kiriting. Bu telefon raqamida serverda hali hisob bo‘lmasligi kerak.",
                "**Yaratish** ni bosing va yangi rahbarga telefon raqami va parolini og‘zaki ayting; u birinchi kirishdan keyin parolni o‘zgartirishi kerak.",
              ],
            },
            "Yangi markaz filiallari, bitta naqd to‘lov usuli va standart rollar bilan boshlanadi. Qolgan hamma narsani (kurslar, xonalar, xodimlar, o‘quvchilar) uning rahbari ichkaridan, har qanday markaz kabi qo‘shadi; uni «Ishni boshlash» maqolasiga yo‘naltiring.",
          ],
        },
        domain: {
          title: "Markazning o‘z manzili",
          body: [
            "Markaz server manzili o‘rniga o‘z manzili orqali kirishi mumkin, masalan kingston.kampus.uz: kirish sahifasida markazning nomi va logotipi ko‘rinadi, Kampus o‘quvchilarga yuboradigan havolalar shu manzilga olib boradi. Domen shu serverga yo‘naltirilgach, sayt egasi markaz qatoriga nomni kiritadi (**O‘z manzili**); sertifikat birinchi kirishda o‘zi beriladi. Server manzili barcha markazlar uchun ishlashda davom etadi.",
            {
              note: "Maydon faqat xost nomini qabul qiladi (https:// va slesh yo‘q), har markazga bitta manzil. Domen Kampusda emas, registrator saytida serverga yo‘naltiriladi; qadamlar o‘rnatish qo‘llanmasida.",
            },
          ],
        },
        afterwards: {
          title: "Keyin",
          body: [
            "Ro‘yxatda har bir markazning filiallari, rahbari, xodimlar va o‘quvchilar soni ko‘rinadi; qator menyusi markaz nomi va o‘z manzilini tahrirlaydi. Har bir markaz bitta manzildan kiradi va o‘z integratsiyalarini o‘zi sozlaydi: o‘z Telegram boti, SMS hisobi, Payme yoki Click merchanti va webhook maxfiy kalitlari, chunki umumiy webhook manzillari markazlarni ular ko‘rsatgan maxfiy kalit yoki merchant ma’lumotlari orqali ajratadi.",
            {
              note: "Markazni o‘chirib bo‘lmaydi; u Kampusdan foydalanishni to‘xtatsa, xodimlari va o‘quvchilarini ichkaridan arxivlang.",
            },
          ],
        },
      },
    },
    studentPortal: {
      title: "Shaxsiy sahifangiz",
      summary:
        "O‘quvchilar uchun: video darslarga qo‘shilish, uy vazifasi, materiallar, baholar, to‘lovlar va Telegram, hammasi bitta havoladan.",
      sections: {
        link: {
          title: "Havolangiz",
          body: [
            "O‘quv markazingiz sizga SMS orqali yoki o‘qituvchingiz orqali shaxsiy havola beradi. Uni telefon, planshet yoki kompyuterdagi istalgan brauzerda oching; hech narsa o‘rnatish kerak emas va parol yo‘q. Tez topish uchun uni xatcho‘p qilib yoki bosh ekranga saqlab qo‘ying.",
            "Sahifa sizni ismingiz bilan kutib oladi va guruhingizni, o‘qituvchingizni va to‘rtta raqamni ko‘rsatadi: davomatingiz, o‘rtacha bahongiz, nechta dars o‘tilgani va coinlaringiz.",
            {
              note: "Havola faqat sizniki: u baholaringiz va to‘lovlaringizni ko‘rsatadi. Uni boshqalarga bermang. Yo‘qotib qo‘ysangiz, o‘qituvchingizdan yangisini so‘rang; shunda eskisi ishlamay qoladi.",
            },
          ],
        },
        lesson: {
          title: "Video darsga qo‘shilish",
          body: [
            {
              steps: [
                "Havolangizni darsdan bir necha daqiqa oldin oching. Yuqori kartochka keyingi dars vaqtini ko‘rsatadi va o‘qituvchini kutadi.",
                "O‘qituvchi boshlaganda kartochka o‘zi o‘zgaradi. Brauzer so‘raganda kamera va mikrofonga ruxsat bering, tasviringizni tekshiring va **Darsga qo‘shilish** ni bosing.",
                "Darsda kamera va mikrofoningizni yoqib-o‘chirishingiz, qo‘l ko‘tarishingiz, chatga yozishingiz va kim borligini ko‘rishingiz mumkin. O‘qituvchi mikrofoningizni o‘chirishi mumkin; siz uni qayta yoqa olasiz.",
                "Dars tugaganda **Chiqish** ni bosing yoki o‘qituvchi uni yakunlashini kuting.",
              ],
            },
            "Tasvir ulanmasa, internetingizni tekshiring va **Qayta qo‘shilish** ni bosing. Ba’zi tarmoqlarda o‘qituvchingizning markazi relay yoqishi kerak; ularga ayting.",
          ],
        },
        lessons: {
          title: "Darslar va jadval",
          body: [
            "**Darslar** yorlig‘i har bir darsni sanasi, mavzusi, kelgan-kelmaganingiz va bahongiz bilan ko‘rsatadi. **Jadval** yorlig‘i guruhingiz yig‘iladigan kunlar va vaqtlarni hamda guruh qachongacha o‘qishini ko‘rsatadi.",
          ],
        },
        homework: {
          title: "Uy vazifasi",
          body: [
            {
              steps: [
                "**Uy vazifasi** yorlig‘ini oching. Yorliqdagi raqam sizni nechta vazifa kutayotganini bildiradi.",
                "Har bir vazifada dars, matn, o‘qituvchidan havola yoki fayl va muddat ko‘rsatiladi.",
                "**Javob berish** ni bosing, javobingizni yozing va kerak bo‘lsa, fayl biriktiring, so‘ng **Yuborish** ni bosing.",
                "O‘qituvchi javobni qabul qiladi yoki izoh bilan qaytaradi. Qaytarilgan vazifa “bajarish kerak” holatida qaytadi; **Qayta javob berish** ni bosing.",
              ],
            },
          ],
        },
        materials: {
          title: "Materiallar",
          body: [
            "**Materiallar** yorlig‘ida o‘qituvchi ulashgan narsalar turadi: fayllar, havolalar va video darslar yozuvlari. Ko‘rish uchun **Ochish** ni, nusxasini saqlab qolish uchun **Yuklab olish** ni bosing. Yozuvlar cheklangan muddat saqlanadi.",
          ],
        },
        money: {
          title: "To‘lovlar",
          body: [
            "**To‘lovlar** yorlig‘i balansingizni, oylik to‘lovni, keyingi to‘lov sanasini va qilgan har bir to‘lovingizni ko‘rsatadi. Qizil qator qarzdor ekaningizni bildiradi; markazda to‘lang yoki, **Onlayn to‘lash** taklif qilingan bo‘lsa, kartangiz bilan: oy va summani tanlang, **Payme orqali to‘lash** yoki **Click orqali to‘lash** ni bosing, provayder sahifasida yakunlang va qaytib keling. To‘lov tasdiqlanishi bilan shu yerda paydo bo‘ladi.",
          ],
        },
        results: {
          title: "Natijalar",
          body: [
            "**Natijalar** yorlig‘i imtihonlaringiz va testlaringizni sana, ball va o‘tgan-o‘tmaganingiz bilan ko‘rsatadi. “Hali baholanmagan” deb belgilangan natijalar o‘qituvchi ularni kiritganda yangilanadi.",
          ],
        },
        telegram: {
          title: "Telegram",
          body: [
            "Sahifangizda **Telegramni ulash** ni bosing va ochilgan botda Start ni bosing. Shundan boshlab har bir darsdan oldin eslatma, o‘qituvchi video darsni boshlaganda xabar, uy vazifasi xabarlari, yangi materiallar va to‘lov tasdiqlarini olasiz. Ota-onalar **Yana bir telefon ulash** bilan o‘z telefonini ulashi mumkin. Uzish uchun botga **/stop** yuboring.",
          ],
        },
      },
    },
  },
};
