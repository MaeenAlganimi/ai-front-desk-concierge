"use client";
import { AnimatePresence, MotionConfig, motion, type Variants } from "motion/react";
import LiveCalendar from "@/components/LiveCalendar";
import { useEffect, useState } from "react";
import Script from "next/script";
import Link from "next/link";
import {
  ArrowUpRight,
  ArrowRight,
  Sparkles,
  Plus,
  Minus,
  MapPin,
  Clock3,
  ShieldCheck,
  MessageCircle,
  Flower2,
  Menu,
  Smile,
  Sun,
  HeartHandshake,
} from "lucide-react";
const content = {
  en: {
    nav: ["Our services", "Our people", "Good to know"],
    book: "Let’s find your moment",
    eyebrow: "DENTAL & BEAUTY, THOUGHTFULLY TOGETHER",
    title: (
      <>
        Feel like
        <br />
        yourself.
        <br />
        <em>Only brighter.</em>
      </>
    ),
    desc: "A calmer kind of care. Thoughtful dental treatments and considered beauty rituals, in a space that feels like a deep breath.",
    cta: "Find your appointment",
    explore: "Explore our services",
    note: "Your time, your language. Our concierge is here.",
    services: "Small rituals. Lasting confidence.",
    serviceDesc:
      "Expert care, without the rush. Start with what feels right for you.",
    section: "01 / THE CARE MENU",
    team: "Good hands. Kind people.",
    teamDesc: "Meet the people who make care feel personal.",
    teamTag: "02 / YOUR PEOPLE",
    visit: "Make yourself at home.",
    visitDesc:
      "A quiet corner, a warm welcome, and time set aside just for you.",
    faq: "A little clarity, before you arrive.",
    faqTag: "03 / GOOD TO KNOW",
    footer: "Care that meets you where you are.",
    demo: "A fictional studio. A working AI concierge.",
    credits: "All prices in studio credits · Fictional demo",
    hours: "Saturday–Thursday",
    closed: "Friday · A day to recharge",
    location: "12 Jasmine Walk, Crescent Quarter",
    place: "Fictional address · Times shown in studio local time",
    ask: "Ask our concierge",
    care: "Considered care",
    careDesc: "Thoughtful treatment, at your pace.",
    lang: "English or العربية",
    langDesc: "A warm welcome in your language.",
    control: "Always your choice",
    controlDesc: "Every change needs your confirmation.",
  },
  ar: {
    nav: ["خدماتنا", "فريقنا", "معلومات تهمك"],
    book: "لنجد وقتك المناسب",
    eyebrow: "الأسنان والجمال، بعناية متكاملة",
    title: (
      <>
        إحساسك
        <br />
        بنفسك.
        <br />
        <em>بإشراقة أجمل.</em>
      </>
    ),
    desc: "رعاية أكثر هدوءاً. علاجات أسنان مدروسة وطقوس جمال مميزة، في مساحة تمنحك لحظة راحة.",
    cta: "احجز لحظتك",
    explore: "اكتشف خدماتنا",
    note: "وقتك ولغتك. مساعدنا هنا من أجلك.",
    services: "لحظات صغيرة. ثقة تدوم.",
    serviceDesc: "عناية متخصصة، دون استعجال. ابدأ بما يناسبك.",
    section: "01 / قائمة العناية",
    team: "أيدٍ خبيرة. قلوب لطيفة.",
    teamDesc: "تعرّف على فريق يجعل الرعاية تجربة شخصية.",
    teamTag: "02 / فريقك",
    visit: "هنا، تشعر بالراحة.",
    visitDesc: "ركن هادئ، ترحيب دافئ، ووقت مخصص لك وحدك.",
    faq: "وضوح أكثر، قبل زيارتك.",
    faqTag: "03 / معلومات تهمك",
    footer: "رعاية تلتقي بك حيث أنت.",
    demo: "استوديو خيالي. مساعد ذكي يعمل فعلياً.",
    credits: "الأسعار بوحدات الاستوديو · تجربة خيالية",
    hours: "السبت إلى الخميس",
    closed: "الجمعة · يوم للراحة",
    location: "12 ممشى الياسمين، حي الهلال",
    place: "عنوان خيالي · بالتوقيت المحلي للاستوديو",
    ask: "اسأل مساعدنا",
    care: "عناية مدروسة",
    careDesc: "رعاية متأنية، حسب راحتك.",
    lang: "English أو العربية",
    langDesc: "ترحيب دافئ بلغتك.",
    control: "القرار دائماً لك",
    controlDesc: "كل تغيير يحتاج تأكيدك.",
  },
};
const services = [
  {
    name: "Dental cleaning",
    ar: "تنظيف الأسنان",
    desc: "A fresh start for your smile.",
    descAr: "بداية منعشة لابتسامتك.",
    price: 180,
    time: 45,
    icon: Smile,
  },
  {
    name: "Dental consultation",
    ar: "استشارة أسنان",
    desc: "A conversation about your care.",
    descAr: "حوار حول العناية بأسنانك.",
    price: 120,
    time: 30,
    icon: HeartHandshake,
  },
  {
    name: "Teeth whitening",
    ar: "تبييض الأسنان",
    desc: "Let your natural confidence shine.",
    descAr: "دع ثقتك الطبيعية تتألق.",
    price: 450,
    time: 60,
    icon: Sparkles,
  },
  {
    name: "Signature facial",
    ar: "جلسة عناية بالبشرة",
    desc: "A little reset. A softer glow.",
    descAr: "تجديد لطيف وإشراقة ناعمة.",
    price: 250,
    time: 60,
    icon: Sun,
  },
];
const faqs = [
  [
    "How do I book an appointment?",
    "Open the concierge in the corner. Tell us your service and preferred time, then confirm the proposed appointment. You can chat in English or Arabic.",
    "كيف أحجز موعداً؟",
    "افتح المساعد في الزاوية وحدد الخدمة والوقت المناسب، ثم أكّد الموعد المقترح. يمكنك التحدث بالعربية أو الإنجليزية.",
  ],
  [
    "Can I change my appointment?",
    "Of course. Give the concierge the same phone number used for your booking and ask to move or cancel. You will always review and confirm changes first.",
    "هل يمكنني تغيير موعدي؟",
    "بالتأكيد. استخدم رقم الحجز نفسه واطلب من المساعد تغيير الموعد أو إلغاءه. ستراجع التغييرات وتؤكدها أولاً.",
  ],
  [
    "Is there parking nearby?",
    "Yes. Free visitor parking is available behind the studio, with entry through the teal door. Our address is fictional: 12 Jasmine Walk, Crescent Quarter.",
    "هل تتوفر مواقف؟",
    "نعم، تتوفر مواقف مجانية خلف الاستوديو والمدخل من الباب الفيروزي. عنواننا الخيالي: 12 ممشى الياسمين، حي الهلال.",
  ],
  [
    "Can the concierge give medical advice?",
    "Our concierge helps with appointments and studio information. For diagnosis, medication, or treatment advice, it can connect you with the team or arrange a consultation.",
    "هل يقدم المساعد نصائح طبية؟",
    "يساعدك المساعد بالمواعيد ومعلومات الاستوديو. للتشخيص أو الدواء أو نصائح العلاج يمكنه تحويلك للفريق أو حجز استشارة.",
  ],
];
const ease = [0.22, 1, 0.36, 1] as const;
const rise: Variants = {
  hidden: { opacity: 0, y: 28 },
  show: { opacity: 1, y: 0, transition: { duration: 0.7, ease } },
};
const stagger: Variants = { hidden: {}, show: { transition: { staggerChildren: 0.09, delayChildren: 0.1 } } };
const reveal = { initial: "hidden", whileInView: "show", viewport: { once: true, amount: 0.2 } } as const;
const press = { whileHover: { y: -4 }, whileTap: { scale: 0.97 }, transition: { type: "spring", stiffness: 380, damping: 26 } } as const;

export default function Home() {
  const [lang, setLang] = useState<"en" | "ar">("en");
  const [open, setOpen] = useState<number | null>(0);
  const [menu, setMenu] = useState(false);
  const c = content[lang];
  const ar = lang === "ar";
  useEffect(() => {
    document.documentElement.lang = lang;
    document.documentElement.dir = ar ? "rtl" : "ltr";
    window.dispatchEvent(new CustomEvent("noor:language", { detail: lang }));
  }, [lang, ar]);
  const chat = () => window.dispatchEvent(new CustomEvent("noor:open"));
  return (
    <MotionConfig reducedMotion="user">
    <main className="studio">
      <div className="announcement">
        {ar
          ? "مساحة صغيرة للعناية بنفسك. أهلاً بك في نور."
          : "A little space to take care of you. Welcome to Noor."}
        <span>✦</span>
      </div>
      <header className="site-header">
        <Link className="wordmark" href="/">
          noor<span>STUDIO / نور</span>
        </Link>
        <nav className={menu ? "mobile-open" : ""}>
          {c.nav.map((n, i) => (
            <a
              key={n}
              href={["#services", "#team", "#faq"][i]}
              onClick={() => setMenu(false)}
            >
              {n}
            </a>
          ))}
        </nav>
        <div className="nav-actions">
          <button
            className="language"
            onClick={() => setLang(ar ? "en" : "ar")}
          >
            {ar ? "EN" : "العربية"}
          </button>
          <motion.button className="header-book" onClick={chat} whileHover={{ scale: 1.04 }} whileTap={{ scale: 0.96 }}>
            {c.book}
            <ArrowUpRight size={15} />
          </motion.button>
          <button
            className="menu-button"
            aria-label="Toggle menu"
            onClick={() => setMenu(!menu)}
          >
            <Menu />
          </button>
        </div>
      </header>
      <section className="hero">
        <motion.div className="hero-copy" variants={stagger} initial="hidden" animate="show">
          <motion.div variants={rise} className="eyebrow">
            <span className="tiny-star">✦</span>
            {c.eyebrow}
          </motion.div>
          <motion.h1 variants={rise}>{c.title}</motion.h1>
          <motion.p variants={rise}>{c.desc}</motion.p>
          <motion.div variants={rise} className="hero-actions">
            <motion.button className="button-dark" onClick={chat} {...press}>
              {c.cta}
              <ArrowUpRight size={18} />
            </motion.button>
            <a href="#services" className="text-link">
              {c.explore}
              <ArrowRight size={16} />
            </a>
          </motion.div>
          <motion.div variants={rise} className="concierge-note">
            <span className="online-dot" />
            {c.note}
          </motion.div>
        </motion.div>
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 24 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          transition={{ duration: 1, ease, delay: 0.15 }}
          className="hero-art"
          aria-label={
            ar
              ? "تصميم تجريدي هادئ بلون أخضر"
              : "Calm sage architectural illustration"
          }
          role="img"
        >
          <div className="art-grain" />
          <div className="art-arch">
            <div className="arch-inner" />
            <motion.div className="sun-disc" animate={{ y: [0, -10, 0] }} transition={{ duration: 7, repeat: Infinity, ease: "easeInOut" }} />
            <motion.div className="vase" animate={{ rotate: [0, 1.2, 0, -1.2, 0] }} transition={{ duration: 9, repeat: Infinity, ease: "easeInOut" }}>
              <div className="stem stem-one" />
              <div className="stem stem-two" />
              <div className="leaf leaf-one" />
              <div className="leaf leaf-two" />
              <div className="leaf leaf-three" />
            </motion.div>
            <div className="art-plinth" />
          </div>
          <div className="art-caption">
            <span>THE NOOR WAY</span>
            <span>{ar ? "مساحة لتتألق" : "Room to bloom."}</span>
            <Flower2 size={28} strokeWidth={1} />
          </div>
          <motion.div className="floating-note" initial={{ opacity: 0, y: 30 }} animate={{ opacity: 1, y: [0, -8, 0] }} transition={{ opacity: { delay: 0.9, duration: 0.6 }, y: { delay: 1.2, duration: 5, repeat: Infinity, ease: "easeInOut" } }}>
            <span className="note-icon">
              <Sparkles size={19} />
            </span>
            <div>
              {ar ? "لحظتك من الهدوء" : "Your moment of calm"}
              <small>{ar ? "تبدأ هنا" : "Starts right here."}</small>
            </div>
          </motion.div>
        </motion.div>
        <div className="hero-bottom">
          <span>01 — A BRIGHTER EVERYDAY</span>
          <span>SCROLL TO SLOW DOWN ↓</span>
        </div>
      </section>
      <motion.section className="values-strip" variants={stagger} {...reveal}>
        {[
          [Flower2, c.care, c.careDesc],
          [MessageCircle, c.lang, c.langDesc],
          [ShieldCheck, c.control, c.controlDesc],
        ].map(([Icon, title, desc]) => {
          const I = Icon as typeof Flower2;
          return (
            <motion.div variants={rise} key={String(title)}>
              <I size={25} strokeWidth={1.3} />
              <div>
                <h3>{String(title)}</h3>
                <p>{String(desc)}</p>
              </div>
            </motion.div>
          );
        })}
      </motion.section>
      <section className="section services-section" id="services">
        <div className="eyebrow">{c.section}</div>
        <motion.div className="section-heading" variants={rise} {...reveal}>
          <h2>{c.services}</h2>
          <p>{c.serviceDesc}</p>
        </motion.div>
        <motion.div className="service-grid" variants={stagger} {...reveal}>
          {services.map((s, i) => (
            <motion.button
              variants={rise}
              {...press}
              key={s.name}
              className="service-card"
              onClick={() =>
                window.dispatchEvent(
                  new CustomEvent("noor:open", {
                    detail: {
                      message: ar
                        ? `ابي موعد ${s.ar}`
                        : `I'd like to book ${s.name.toLowerCase()}`,
                    },
                  }),
                )
              }
            >
              <div className="service-top">
                <s.icon size={30} strokeWidth={1.2} />
                <span>0{i + 1}</span>
              </div>
              <h3>{ar ? s.ar : s.name}</h3>
              <p>{ar ? s.descAr : s.desc}</p>
              <div className="service-bottom">
                <span>
                  <b>{s.price}</b> <small>{ar ? "وحدة" : "credits"}</small>
                  <span className="duration">
                    {s.time} {ar ? "دقيقة" : "min"}
                  </span>
                </span>
                <span className="circle-arrow">
                  <ArrowUpRight size={17} />
                </span>
              </div>
            </motion.button>
          ))}
        </motion.div>
        <p className="fineprint">{c.credits}</p>
      </section>
      <LiveCalendar ar={ar} />
      <section className="section team-section" id="team">
        <div className="eyebrow">{c.teamTag}</div>
        <motion.div className="section-heading" variants={rise} {...reveal}>
          <h2>{c.team}</h2>
          <p>{c.teamDesc}</p>
        </motion.div>
        <motion.div className="team-grid" variants={stagger} {...reveal}>
          {[
            {
              name: "Dr. Sara Noor",
              ar: "د. سارة نور",
              role: ar ? "طبيبة أسنان" : "Dentist",
              initial: "SN",
              tone: "sage",
            },
            {
              name: "Dr. Omar Sami",
              ar: "د. عمر سامي",
              role: ar ? "طبيب أسنان" : "Dentist",
              initial: "OS",
              tone: "sand",
            },
            {
              name: "Lina Adel",
              ar: "لينا عادل",
              role: ar ? "أخصائية عناية بالبشرة" : "Skin therapist",
              initial: "LA",
              tone: "rose",
            },
          ].map((p) => (
            <motion.article variants={rise} whileHover={{ y: -6 }} className="team-card" key={p.name}>
              <div className={`team-portrait ${p.tone}`}>
                <Flower2 size={104} strokeWidth={0.6} />
                <span>{p.initial}</span>
              </div>
              <div className="team-info">
                <h3>{ar ? p.ar : p.name}</h3>
                <p>{p.role}</p>
              </div>
            </motion.article>
          ))}
        </motion.div>
      </section>
      <motion.section className="visit-section" variants={rise} {...reveal}>
        <div>
          <div className="eyebrow">
            {ar ? "زيارتك القادمة" : "YOUR NEXT LITTLE ESCAPE"}
          </div>
          <h2>{c.visit}</h2>
          <p>{c.visitDesc}</p>
          <motion.button className="button-dark" onClick={chat} {...press}>
            {c.ask}
            <ArrowUpRight size={17} />
          </motion.button>
        </div>
        <div className="visit-details">
          <div>
            <Clock3 size={22} />
            <section>
              <h3>{c.hours}</h3>
              <p>09:00 — 20:00</p>
              <small>{c.closed}</small>
            </section>
          </div>
          <div>
            <MapPin size={22} />
            <section>
              <h3>{c.location}</h3>
              <p>{c.place}</p>
              <small>
                {ar
                  ? "مواقف مجانية خلف الاستوديو"
                  : "Free visitor parking behind the studio"}
              </small>
            </section>
          </div>
        </div>
      </motion.section>
      <section className="section faq-section" id="faq">
        <div>
          <div className="eyebrow">{c.faqTag}</div>
          <h2>{c.faq}</h2>
          <p>
            {ar
              ? "شيء آخر في بالك؟ مساعدنا جاهز."
              : "Something else on your mind? Our concierge is a message away."}
          </p>
          <button className="text-link" onClick={chat}>
            {c.ask}
            <ArrowUpRight size={16} />
          </button>
        </div>
        <motion.div className="faq-list" variants={stagger} {...reveal}>
          {faqs.map((f, i) => (
            <motion.div variants={rise} layout className="faq-item" key={i}>
              <button
                aria-expanded={open === i}
                onClick={() => setOpen(open === i ? null : i)}
              >
                {f[ar ? 2 : 0]}
                <motion.span animate={{ rotate: open === i ? 180 : 0 }} transition={{ duration: 0.3 }} style={{ display: "inline-flex" }}>
                  {open === i ? <Minus size={18} /> : <Plus size={18} />}
                </motion.span>
              </button>
              <AnimatePresence initial={false}>
                {open === i && (
                  <motion.p
                    key="a"
                    initial={{ opacity: 0, height: 0 }}
                    animate={{ opacity: 1, height: "auto" }}
                    exit={{ opacity: 0, height: 0 }}
                    transition={{ duration: 0.35, ease }}
                    style={{ overflow: "hidden" }}
                  >
                    {f[ar ? 3 : 1]}
                  </motion.p>
                )}
              </AnimatePresence>
            </motion.div>
          ))}
        </motion.div>
      </section>
      <footer className="site-footer">
        <div className="footer-top">
          <Link className="wordmark" href="/">
            noor<span>STUDIO / نور</span>
          </Link>
          <h2>{c.footer}</h2>
          <Flower2 size={60} strokeWidth={0.7} />
        </div>
        <div className="footer-bottom">
          <span>{c.demo}</span>
          <span>
            POWERED BY <b>frontdesk</b>
          </span>
          <Link href="/dashboard">
            {ar ? "لوحة الفريق" : "Staff console"}
            <ArrowUpRight size={13} />
          </Link>
        </div>
      </footer>
      <Script
        src="/widget.js"
        data-business="noor"
        strategy="afterInteractive"
      />
    </main>
    </MotionConfig>
  );
}
