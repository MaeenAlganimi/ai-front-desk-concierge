import type { Database } from "./index";
import { DEFAULT_TIMEZONE, isValidTimeZone, zonedParts, zonedToUtc } from "../time";
import { embed } from "../agent/embeddings";

export const isoDay = (date = new Date()) => date.toISOString().slice(0, 10);
export function addDays(date: Date, days: number) {
  const d = new Date(date);
  d.setUTCDate(d.getUTCDate() + days);
  return d;
}
export const services = [
  {
    id: "cleaning",
    name: "Dental cleaning",
    name_ar: "تنظيف الأسنان",
    duration: 45,
    price: 180,
    category: "dental",
  },
  {
    id: "consultation",
    name: "Dental consultation",
    name_ar: "استشارة أسنان",
    duration: 30,
    price: 120,
    category: "dental",
  },
  {
    id: "whitening",
    name: "Teeth whitening",
    name_ar: "تبييض الأسنان",
    duration: 60,
    price: 450,
    category: "dental",
  },
  {
    id: "facial",
    name: "Signature facial",
    name_ar: "جلسة عناية بالبشرة",
    duration: 60,
    price: 250,
    category: "beauty",
  },
];
export function seedTimeZone() {
  const tz = process.env.BUSINESS_TIMEZONE || DEFAULT_TIMEZONE;
  if (!isValidTimeZone(tz)) throw new Error(`Invalid BUSINESS_TIMEZONE: ${tz}`);
  return tz;
}
export async function seed(db: Database) {
  await db.query(
    "INSERT INTO concierge_business (id,name,timezone) VALUES ('default',$1,$2) ON CONFLICT (id) DO NOTHING",
    [process.env.BUSINESS_NAME || "Noor Dental & Beauty Studio", seedTimeZone()],
  );
  if ((await db.query("SELECT id FROM concierge_services LIMIT 1")).rows.length)
    return;
  const tz = (
    await db.query<{ timezone: string }>("SELECT timezone FROM concierge_business WHERE id='default'")
  ).rows[0].timezone;
  const at = (day: string, time: string) => zonedToUtc(day, time, tz).toISOString();
  await db.transaction(async (tx) => {
    for (const s of services)
      await tx.query(
        "INSERT INTO concierge_services VALUES ($1,$2,$3,$4,$5,$6)",
        [s.id, s.name, s.name_ar, s.duration, s.price, s.category],
      );
    for (const s of [
      [
        "sara",
        "Dr. Sara Noor",
        "د. سارة نور",
        "Dentist",
        ["cleaning", "consultation", "whitening"],
      ],
      [
        "omar",
        "Dr. Omar Sami",
        "د. عمر سامي",
        "Dentist",
        ["cleaning", "consultation", "whitening"],
      ],
      ["lina", "Lina Adel", "لينا عادل", "Skin therapist", ["facial"]],
    ]) {
      await tx.query("INSERT INTO concierge_staff VALUES ($1,$2,$3,$4,$5)", [
        s[0],
        s[1],
        s[2],
        s[3],
        JSON.stringify(s[4]),
      ]);
    }
    for (let day = 0; day < 7; day++)
      await tx.query(
        "INSERT INTO concierge_opening_hours VALUES ($1,$2,$3,$4)",
        [day, "09:00", "20:00", day === 5],
      );
    for (const c of [
      ["amina", "Amina Hassan", "0501234567", "Prefers late afternoons."],
      ["yousef", "Yousef Ali", "0507654321", "Prefers Dr. Omar."],
      ["maya", "Maya Salem", "0509876543", "Skin care appointments."],
    ])
      await tx.query("INSERT INTO concierge_customers VALUES ($1,$2,$3,$4)", c);
    for (let i = 0; i < 14; i++) {
      const local = zonedParts(addDays(new Date(), i), tz);
      if (local.weekday === 5) continue;
      const day = local.date;
      await tx.query(
        "INSERT INTO concierge_appointments (id,customer_id,service_id,staff_id,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          `seed-${i}-a`,
          "amina",
          "cleaning",
          "sara",
          at(day, "17:00"),
          at(day, "17:45"),
        ],
      );
      await tx.query(
        "INSERT INTO concierge_appointments (id,customer_id,service_id,staff_id,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6)",
        [
          `seed-${i}-b`,
          "yousef",
          "consultation",
          "omar",
          at(day, "10:00"),
          at(day, "10:30"),
        ],
      );
      if (i % 2 === 0)
        await tx.query(
          "INSERT INTO concierge_appointments (id,customer_id,service_id,staff_id,starts_at,ends_at) VALUES ($1,$2,$3,$4,$5,$6)",
          [
            `seed-${i}-c`,
            "maya",
            "facial",
            "lina",
            at(day, "14:00"),
            at(day, "15:00"),
          ],
        );
    }
    const chunks = [
      [
        "prices-en",
        "en",
        "Prices in studio credits: dental cleaning 180, dental consultation 120, teeth whitening 450, signature facial 250. Cleaning takes 45 minutes; consultation 30; whitening and facial 60.",
      ],
      [
        "parking-en",
        "en",
        "Free visitor parking is available behind the studio. Our fictional address is 12 Jasmine Walk, Crescent Quarter. Enter through the teal door.",
      ],
      [
        "hours-en",
        "en",
        "Open Saturday through Thursday, 09:00–20:00 studio local time. Closed Friday. You can reschedule or cancel before your appointment.",
      ],
      [
        "policy-en",
        "en",
        "Noor Dental & Beauty Studio is a fictional demo business. For diagnosis, medication or dosage, please speak to a qualified clinician. The concierge can arrange an appointment or a staff handoff. Reminders in this demo are scheduled records; no SMS is sent.",
      ],
      [
        "prices-ar",
        "ar",
        "الأسعار بوحدات الاستوديو: تنظيف الأسنان 180، استشارة أسنان 120، تبييض الأسنان 450، جلسة عناية بالبشرة 250. تنظيف الأسنان 45 دقيقة، والاستشارة 30 دقيقة.",
      ],
      [
        "parking-ar",
        "ar",
        "المواقف مجانية خلف الاستوديو. العنوان الخيالي: 12 ممشى الياسمين، حي الهلال. المدخل من الباب الفيروزي.",
      ],
      [
        "hours-ar",
        "ar",
        "مواعيد العمل من السبت إلى الخميس من الساعة 9 صباحاً إلى 8 مساءً بالتوقيت المحلي للاستوديو. مغلق يوم الجمعة. يمكنك تغيير أو إلغاء موعدك.",
      ],
      [
        "policy-ar",
        "ar",
        "استوديو نور للأسنان والجمال مشروع تجريبي خيالي. للتشخيص أو الدواء أو الجرعات يرجى استشارة طبيب مؤهل. يمكن حجز موعد أو تحويلك للفريق. التذكيرات محفوظة تجريبياً ولا يتم إرسال رسائل نصية.",
      ],
    ];
    for (const [id, lang, content] of chunks)
      await tx.query(
        "INSERT INTO concierge_kb_chunks VALUES ($1,$2,$3,$4::vector)",
        [id, content, lang, JSON.stringify(await embed(content))],
      );
  });
}
