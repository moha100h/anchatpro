const MALE_NAMES = [
  "علی", "محمد", "رضا", "امیر", "حسین", "مهدی", "سینا", "آرش",
  "کامران", "سهیل", "بهراد", "پارسا", "نیما", "شایان", "آرمان",
  "پویا", "کیان", "داریوش", "فرهاد", "نوید",
];

const FEMALE_NAMES = [
  "سارا", "فاطمه", "مریم", "زهرا", "نگار", "ترانه", "شیرین", "آیدا",
  "پریسا", "ملیکا", "هانیه", "نیلوفر", "یاسمن", "الناز", "آناهیتا",
  "مهسا", "سیما", "لیلا", "رها", "غزل",
];

const ALL_NAMES = [...MALE_NAMES, ...FEMALE_NAMES];

export function getRandomName(gender?: string | null): string {
  const list =
    gender === "male"   ? MALE_NAMES :
    gender === "female" ? FEMALE_NAMES :
                          ALL_NAMES;
  return list[Math.floor(Math.random() * list.length)]!;
}
