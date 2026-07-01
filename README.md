# 🤖 AnymsChatBot — ربات چت ناشناس تلگرام

یک ربات حرفه‌ای و کامل برای چت ناشناس، گروه، لینک ناشناس، سیستم سکه و پرداخت — ساخته‌شده با Grammy، TypeScript، PostgreSQL و Drizzle ORM.

---

## ⚡ نصب سریع (یک دستور)

```bash
git clone https://github.com/YOUR_REPO/anymschatbot.git
cd anymschatbot
sudo bash install.sh
```

اسکریپت می‌خواهد:
1. **توکن ربات** از [@BotFather](https://t.me/BotFather)
2. **آیدی عددی ادمین** (Telegram ID)
3. **آدرس عمومی سرور** — برای webhook درگاه‌های پرداخت *(اختیاری، بعداً هم می‌توان اضافه کرد)*

همه چیز دیگر (Node.js، PostgreSQL، پکیج‌ها، دیتابیس، PM2) به‌صورت خودکار نصب و راه‌اندازی می‌شود.

---

## 🌐 اضافه کردن دامنه / آدرس سرور

برای فعال شدن درگاه‌های پرداخت آنلاین (Plisio، TetraPay) باید آدرس عمومی سرور تنظیم شود.

### روش ۱ — هنگام نصب (توصیه‌شده)
اسکریپت نصب آدرس را می‌پرسد و خودکار ذخیره می‌کند.

### روش ۲ — بعد از نصب (یک دستور)

```bash
bash -c "echo 'BASE_URL=https://yourdomain.com' >> /path/to/anymschatbot/.env && pm2 restart anchatbot"
```

> آدرس IP هم کار می‌کند: `http://1.2.3.4:5000`

### روش ۳ — ویرایش دستی فایل `.env`

```env
BASE_URL=https://yourdomain.com
```

سپس:
```bash
pm2 restart anchatbot
```

### تأیید تنظیم دامنه

پس از ری‌استارت، در پنل ادمین:
- **Admin → پرداخت → Plisio → 🔗 تشخیص خودکار Callback URL**

اگر آدرس درست باشد، URL زیر را می‌بینید:
```
https://yourdomain.com/webhook/plisio?json=true
```
همین URL را در پنل Plisio در فیلد **Status URL** وارد کنید.

---

## ✨ امکانات

### 🔗 چت ناشناس یک‌به‌یک
- صف هوشمند با ترجیح جنسیت (پسر / دختر / شانسی)
- تاگل هم‌سن — اتصال به کاربر هم‌سن
- سه اتصال رایگان روزانه؛ بیشتر با سکه
- گزارش، بلاک، پایان مکالمه

### 👥 گروه ناشناس
- گروه‌های ۳ تا ۱۰ نفر (قابل افزایش به ۲۵)
- نام‌گذاری گروه + لینک دعوت اختصاصی
- نقش‌ها: 👑 سازنده / ⭐ ادمین / عضو
- سازنده می‌تواند تا ۲ ادمین ارتقا دهد (هزینه سکه)
- مشاهده‌ی نام نمایشی اعضا در گروه

### 🔗 لینک ناشناس
- لینک ثابت اختصاصی
- لینک مدت‌دار (۱ساعت / ۶ساعت / ۲۴ساعت / ۷روز)
- صندوق پیام با شمارش خوانده‌نشده‌ها
- نوتیف روزانه برای پیام‌های جدید

### 💎 لینک ناشناس پرو
- لینک دائمی پرو (ap_)
- لینک داخل‌برنامه‌ای پرو (ai_)
- ارسال چند پیام متوالی در یک session
- نوتیف ۲۳:۰۰ برای صندوق پرو

### 💰 سیستم سکه و پرداخت
- خرید سکه از ۵ روش: کارت / کریپتو دستی / TetraPay / Plisio / ⭐ Telegram Stars
- Telegram Stars: پرداخت بومی تلگرام — بدون نیاز به درگاه خارجی
- تأیید خودکار (Plisio، TetraPay، Stars) یا دستی (کارت/کریپتو)
- جلوگیری از تراکنش تکراری (double-credit prevention)
- اعلان فوری به کاربر پس از تأیید یا انقضای پرداخت
- سابقه تراکنش‌ها
- مدیریت توسط ادمین (شارژ / کسر)

### 🎁 سیستم رفرال
- کد دعوت اختصاصی + لینک قابل اشتراک
- پاداش برای هر دو طرف (قابل تنظیم توسط ادمین)
- ضد تقلب (یک رفرال به ازای هر کاربر)

### 🔮 ناشناس از ما بهترون (Magic)
- پیام در بطری
- زنجیر احساس
- نامه به آینده
- فرکانس ناشناس

### 👑 پنل ادمین کامل
- آمار لحظه‌ای (کاربران، پرداخت‌ها، گزارش‌ها)
- جستجو و مدیریت کاربران
- تنظیم نرخ سکه برای هر بخش
- تنظیم پاداش رفرال
- پخش پیام (همه / کاربران فعال)
- بکاپ خودکار به گروه تلگرام
- مدیریت قابلیت‌های Magic
- فیلتر کلمات نامناسب

### 🌐 دو زبانه
- فارسی و انگلیسی کامل
- تشخیص خودکار زبان کاربر

---

## ⚙️ نصب دستی (بدون اسکریپت)

### پیش‌نیازها
- Node.js 22+
- PostgreSQL 14+
- pnpm 8+

### ۱. متغیرهای محیطی
فایل `.env` در ریشه پروژه بسازید:

```env
TELEGRAM_BOT_TOKEN=1234567890:AAF...
ADMIN_IDS=123456789
DATABASE_URL=postgresql://user:pass@localhost:5432/anchatbot
NODE_ENV=production
PORT=5000
BASE_URL=https://yourdomain.com
```

> `BASE_URL` برای webhook درگاه‌های Plisio و TetraPay الزامی است.
> اگر دامنه ندارید، IP عمومی هم کار می‌کند: `http://1.2.3.4:5000`

### ۲. نصب پکیج‌ها
```bash
pnpm install
```

### ۳. اعمال طرح دیتابیس
```bash
pnpm --filter @workspace/db run push-force
```

### ۴. ساخت پروژه
```bash
pnpm --filter @workspace/api-server run build
```

### ۵. اجرا
```bash
# توسعه (با hot-reload)
pnpm --filter @workspace/api-server run dev

# پروداکشن
pnpm --filter @workspace/api-server run start
```

### ۶. PM2 برای اجرای دائمی
```bash
npm install -g pm2
pm2 start "pnpm --filter @workspace/api-server run start" --name anchatbot
pm2 save
pm2 startup
```

---

## 👑 دستورات ادمین

| دستور | توضیح |
|-------|-------|
| `/admin` | پنل مدیریت |
| `/verify_backup <code>` | تأیید گروه بکاپ (در گروه اجرا شود) |

### بخش‌های پنل ادمین

| بخش | امکانات |
|-----|---------|
| 📊 آمار | کاربران، چت‌های فعال، تراکنش‌ها، گزارش‌های معلق |
| 👤 مدیریت کاربران | جستجو، مشاهده پروفایل، شارژ/کسر سکه، بن/آنبن |
| 💳 پرداخت | شماره کارت، کیف کریپتو، Plisio، TetraPay، Stars |
| 💰 نرخ‌ها | هزینه اتصال، گروه، لینک پرو، ادمین‌سازی، افزایش ظرفیت |
| 🎁 رفرال | پاداش دعوت‌کننده و دعوت‌شده (سکه) |
| 📢 پخش | ارسال به همه / کاربران فعال |
| 💾 بکاپ | گروه بکاپ، زمان‌بندی (دقیقه‌ای)، بکاپ دستی، بازیابی |
| 🔮 Magic | فعال/غیرفعال، هزینه، محدودیت روزانه |
| 💬 پشتیبانی | ست کردن لینک + فعال/غیرفعال |
| 🚫 کلمات | افزودن/حذف کلمات فیلتر |

---

## 💳 راه‌اندازی درگاه‌های پرداخت

### 💫 Plisio (کریپتو جهانی — خودکار)

> **پیش‌نیاز:** `BASE_URL` در `.env` تنظیم شده باشد.

1. ثبت‌نام در [plisio.net](https://plisio.net) و دریافت **Secret Key** از Account → API
2. در پنل ادمین: **Admin → پرداخت → 💫 Plisio**
3. کلیک روی **🔑 ثبت/تغییر کلید API** ← Secret Key را وارد کنید
4. کلیک روی **🔗 تشخیص خودکار Callback URL** ← URL زیر ذخیره می‌شود:
   ```
   https://yourdomain.com/webhook/plisio?json=true
   ```
5. همین URL را در پنل Plisio → Account → API → **Status URL** وارد کنید
6. کلیک روی **✅ فعال کردن Plisio**

**جریان پرداخت خودکار:**
- کاربر لینک Plisio را دریافت می‌کند (۳۰ دقیقه مهلت)
- پس از پرداخت، Plisio به webhook callback می‌فرستد
- سکه‌ها فوری و خودکار به حساب کاربر اضافه می‌شوند
- اگر مهلت تمام شود، کاربر پیام «⏰ لینک منقضی شد» دریافت می‌کند

---

### 🌐 TetraPay (درگاه آنلاین — خودکار)

1. API Key از پنل TetraPay دریافت کنید
2. **Admin → پرداخت → 🌐 TetraPay**
3. **🔑 ثبت API Key** ← کلید را وارد کنید
4. **🔄 تشخیص خودکار URL** ← callback URL خودکار تنظیم می‌شود
5. **🔌 تست اتصال** ← تأیید کنید
6. فعال‌سازی

---

### 💳 کارت به کارت (دستی)

1. **Admin → پرداخت → 💳 کارت**
2. شماره کارت و گروه ادمین را تنظیم کنید
3. کاربر رسید (عکس) ارسال می‌کند → به گروه ادمین فوروارد می‌شود
4. ادمین ✅ تأیید یا ❌ رد می‌کند

---

### ₿ کریپتو دستی

1. **Admin → پرداخت → ₿ کریپتو**
2. آدرس کیف پول و گروه ادمین را تنظیم کنید
3. مشابه کارت به کارت — تأیید دستی توسط ادمین

---

### ⭐ Telegram Stars (بومی تلگرام)

1. **Admin → پرداخت → ⭐ Stars**
2. فعال‌سازی — بدون نیاز به تنظیم اضافی
3. پرداخت مستقیم از تلگرام، تأیید خودکار

---

## 💾 راه‌اندازی بکاپ

### تنظیم اولیه
1. `/admin` → ⚙️ تنظیمات سیستم → 💾 بکاپ
2. روی **🔑 کد تأیید جدید** کلیک کنید
3. ربات را به یک گروه تلگرامی اضافه کنید (باید ادمین باشد)
4. در آن گروه تایپ کنید: `/verify_backup <کد>`
5. زمان‌بندی بکاپ را با **⏱️ تنظیم زمان‌بندی** انتخاب کنید (15 دقیقه تا 48 ساعت)
6. برای تست: **📤 ارسال بکاپ الان**

### بازیابی (Restore)
1. `/admin` → ⚙️ تنظیمات سیستم → 💾 بکاپ → **📥 راهنمای بازیابی**
2. فایل `.json.gz` بکاپ را مستقیماً برای ربات ارسال کنید
3. ربات جزئیات فایل را نشان می‌دهد — تأیید کنید تا بازیابی شروع شود

> ⚠️ بازیابی داده‌های موجود را بازنویسی می‌کند (upsert). داده‌های جدید حذف نمی‌شوند.

---

## 🔄 به‌روزرسانی (Update)

```bash
cd /path/to/anymschatbot
git pull
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/db run push-force
pm2 restart anchatbot
```

اگر از نسخه قدیمی آپدیت می‌کنید، این migration را هم اجرا کنید (یک‌بار کافی است):
```bash
sudo -u anchatbot psql anchatbot -c "ALTER TABLE backup_config RENAME COLUMN schedule_hours TO schedule_minutes;" 2>/dev/null || true
```

---

## 🏗️ ساختار پروژه

```
anymschatbot/
├── install.sh                      ← نصب‌کننده خودکار
├── .env                            ← متغیرهای محیطی (توسط install.sh ساخته می‌شود)
├── artifacts/
│   └── api-server/
│       └── src/
│           ├── bot/
│           │   ├── handlers/
│           │   │   ├── start.ts          ← شروع، رفرال، لینک‌های ورودی
│           │   │   ├── matching.ts       ← اتصال ناشناس
│           │   │   ├── group.ts          ← گروه ناشناس
│           │   │   ├── anonymous-link.ts ← لینک ناشناس + مدت‌دار
│           │   │   ├── pro-anon-link.ts  ← لینک پرو
│           │   │   ├── coins.ts          ← سکه + رفرال
│           │   │   ├── help.ts           ← راهنما و قوانین
│           │   │   ├── settings.ts       ← تنظیمات کاربر
│           │   │   ├── admin.ts          ← پنل ادمین
│           │   │   └── magic.ts          ← ناشناس از ما بهترون
│           │   ├── services/             ← لایه منطق کسب‌وکار
│           │   ├── keyboards/            ← کیبوردهای تلگرام
│           │   ├── middleware/           ← احراز هویت و rate limit
│           │   ├── i18n/                 ← ترجمه‌ها (fa, en)
│           │   └── index.ts              ← راه‌اندازی ربات
│           ├── routes/
│           │   ├── plisio.ts             ← webhook درگاه Plisio
│           │   └── tetrapay.ts           ← webhook درگاه TetraPay
│           ├── lib/
│           │   └── base-url.ts           ← تشخیص خودکار URL سرور
│           ├── app.ts
│           └── index.ts
└── lib/
    └── db/src/schema/                    ← Drizzle ORM schemas
```

---

## 🛠️ دستورات مفید

```bash
# وضعیت و لاگ
pm2 status                               # وضعیت ربات
pm2 logs anchatbot                       # لاگ زنده
pm2 monit                                # CPU/Memory monitor

# ری‌استارت و توقف
pm2 restart anchatbot                    # ری‌استارت
pm2 stop anchatbot                       # توقف

# اضافه/تغییر دامنه (یک دستور)
bash -c "echo 'BASE_URL=https://yourdomain.com' >> .env && pm2 restart anchatbot"

# دیتابیس
pnpm --filter @workspace/db run push-force   # اعمال تغییرات schema

# بیلد مجدد
pnpm --filter @workspace/api-server run build
```

---

## 🔒 امنیت

- Rate limiting (30 پیام / 10 ثانیه)
- فیلتر کلمات نامناسب با سیستم هشدار
- سیستم هشدار (۳ هشدار → محدودیت ۲۴ساعته → بن)
- بلاک بین کاربران (جلوگیری از تطابق مجدد)
- پنل ادمین فقط با آیدی عددی تأیید‌شده
- رفرال ضد تقلب (یک رفرال به ازای هر کاربر)
- **Plisio:** تأیید HMAC-SHA1 روی هر callback — جعل ناممکن
- **Plisio:** جلوگیری از double-credit با فلگ `callbackVerified`
- **Webhook:** همیشه HTTP 200 برمی‌گردد تا Plisio retry نکند

---

## 🧰 تکنولوژی‌ها

| بخش | تکنولوژی |
|-----|----------|
| Bot Framework | [Grammy](https://grammy.dev/) v1 |
| Runtime | Node.js 22 + TypeScript 5.9 |
| Database | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/) |
| Validation | Zod v4 |
| API Server | Express 5 |
| Scheduling | node-cron |
| Logging | Pino |
| Build | esbuild |
| Process Manager | PM2 |
