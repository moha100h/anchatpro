# 🤖 AnymsChatBot — راهنمای نصب و راه‌اندازی

> ربات چت ناشناس تلگرام | Grammy v1 + TypeScript + Express + PostgreSQL

---

## 📋 پیش‌نیازها (سرور)

| مورد | نسخه | توضیح |
|------|------|-------|
| سیستم‌عامل | Ubuntu 20+ / Debian 11+ / CentOS 8+ | اسکریپت نصب خودکار تشخیص می‌دهد |
| معماری | x86_64 (پیشنهادی) / ARM64 (پشتیبانی) | — |
| RAM | حداقل 512 MB | 1 GB توصیه می‌شود |
| دیسک | حداقل 2 GB آزاد | — |
| دسترسی | root یا sudo | برای نصب پکیج‌ها و PostgreSQL |

> **توجه:** Node.js، pnpm و PostgreSQL به‌صورت خودکار توسط اسکریپت نصب نصب می‌شوند.

---

## 🚀 نصب سریع (یک دستور)

```bash
git clone https://github.com/moha100h/anchatpro.git ~/anchatpro && cd ~/anchatpro && sudo bash install.sh
```

یا به‌صورت مرحله‌ای:

```bash
# ۱. کلون ریپو
git clone https://github.com/moha100h/anchatpro.git ~/anchatpro
cd ~/anchatpro

# ۲. اجرای نصب خودکار
sudo bash install.sh
```

اسکریپت از شما می‌خواهد:
- **Bot Token** — از @BotFather در تلگرام بگیرید
- **Admin Telegram ID** — آیدی عددی ادمین اصلی (مثال: `277236314`)
- **آدرس عمومی سرور** (اختیاری) — برای درگاه‌های پرداخت Plisio و TetraPay

---

## 📝 مراحل نصب به ترتیب

```
Step 1  — دریافت اطلاعات (Token، Admin ID، URL)
Step 2  — نصب Node.js 22 LTS (اگر نصب نیست)
Step 3  — نصب pnpm
Step 4  — نصب و راه‌اندازی PostgreSQL
Step 5  — ساخت فایل .env
Step 6  — نصب وابستگی‌های Node.js
Step 7  — Build پروژه (esbuild)
Step 8  — اعمال Schema دیتابیس (drizzle-kit)
Step 9  — Migration های SQL (column های اضافی، reset sequence ها)
Step 10 — راه‌اندازی PM2 با ecosystem.config.cjs
Step 11 — نصب و پیکربندی Nginx (reverse proxy)
Step 12 — بررسی سلامت (Health Check)
```

---

## 📁 ساختار فایل‌های مهم

```
~/anchatpro/
├── install.sh              ← اسکریپت نصب اولیه
├── update.sh               ← اسکریپت آپدیت
├── ecosystem.config.cjs    ← تنظیمات PM2 (پس از نصب ایجاد می‌شود)
├── .env                    ← متغیرهای محیطی (پس از نصب ایجاد می‌شود)
├── artifacts/
│   └── api-server/
│       └── dist/           ← فایل‌های Build شده
└── lib/
    └── db/
        └── drizzle.config.ts
```

---

## ⚙️ فایل .env (نمونه)

```env
TELEGRAM_BOT_TOKEN=1234567890:AAxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
ADMIN_IDS=277236314,98765432
DATABASE_URL=postgresql://anchatbot:RANDOMPASS@localhost:5432/anchatbot
NODE_ENV=production
PORT=5000
BASE_URL=https://mybotdomain.com
```

> فایل `.env` با دسترسی `600` (فقط root) ایجاد می‌شود.

---

## 🔄 آپدیت ربات

```bash
cd ~/anchatpro
sudo bash update.sh
```

**مراحل آپدیت:**
1. `git pull` — دریافت آخرین کد
2. `pnpm install` — آپدیت پکیج‌ها
3. Build مجدد
4. Schema push
5. Migration های SQL
6. Restart PM2

---

## 🛠️ دستورات PM2

```bash
# وضعیت ربات
pm2 status

# لاگ‌های زنده
pm2 logs anchatbot

# آخرین ۳۰ لاگ
pm2 logs anchatbot --lines 30 --nostream

# ریستارت
pm2 restart anchatbot

# توقف
pm2 stop anchatbot

# شروع مجدد
pm2 start ecosystem.config.cjs

# مانیتور CPU/RAM زنده
pm2 monit

# ذخیره وضعیت PM2 (بعد از تغییر)
pm2 save
```

---

## 🗄️ دستورات PostgreSQL

```bash
# ورود به دیتابیس
sudo -u postgres psql -d anchatbot

# بررسی وضعیت کاربر
sudo -u postgres psql -c "\du"

# بک‌آپ دستی دیتابیس
sudo -u postgres pg_dump anchatbot > backup_$(date +%Y%m%d).sql

# بازیابی بک‌آپ
sudo -u postgres psql anchatbot < backup_20250101.sql

# reset sequence ها (بعد از restore)
sudo -u postgres psql -d anchatbot -c "
DO \$\$
DECLARE seq_rec RECORD; max_val BIGINT;
BEGIN
  FOR seq_rec IN
    SELECT s.relname AS seq_name, a.attrelid::regclass::text AS tbl_name, a.attname AS col_name
    FROM pg_class s JOIN pg_depend d ON d.objid=s.oid
    JOIN pg_attribute a ON a.attrelid=d.refobjid AND a.attnum=d.refobjsubid
    WHERE s.relkind='S' AND d.deptype='a'
  LOOP
    EXECUTE format('SELECT COALESCE(MAX(%I),1) FROM %s', seq_rec.col_name, seq_rec.tbl_name) INTO max_val;
    EXECUTE format('SELECT setval(%L, %s)', seq_rec.seq_name, max_val);
  END LOOP;
END \$\$;
"
```

---

## 🔧 رفع مشکلات رایج

### ❌ خطا: `42501 permission denied`
```bash
# مشکل: کاربر دیتابیس SUPERUSER ندارد
sudo -u postgres psql -c "ALTER USER anchatbot WITH SUPERUSER;"
sudo -u postgres psql -d anchatbot -c "GRANT ALL ON SCHEMA public TO anchatbot;"
```

### ❌ خطا: `duplicate key value violates unique constraint`
```bash
# مشکل: sequence دیتابیس از sync خارج شده (معمولاً بعد از restore)
# راه‌حل: اجرای reset sequence از بخش دستورات PostgreSQL بالا
sudo bash update.sh  # یا دستور SQL بالا را مستقیم اجرا کنید
```

### ❌ خطا: ربات start نمی‌شود
```bash
# بررسی لاگ‌های خطا
pm2 logs anchatbot --lines 50 --nostream

# بررسی فایل .env
cat ~/anchatpro/.env

# ریستارت دستی
cd ~/anchatpro
pm2 delete anchatbot
pm2 start ecosystem.config.cjs
pm2 save
```

### ❌ خطا: `DATABASE_URL is not defined`
```bash
# مشکل: PM2 متغیر محیطی را بارگذاری نمی‌کند
# راه‌حل: ecosystem.config.cjs از --env-file استفاده می‌کند، فقط ریستارت کنید:
pm2 restart anchatbot

# اگر حل نشد:
pm2 delete anchatbot
pm2 start ecosystem.config.cjs
pm2 save
```

### ❌ خطا: `pnpm install` fail می‌شود
```bash
# پاک‌سازی و نصب مجدد
rm -rf node_modules
pnpm install
```

### ❌ ربات بعد از ریبوت سرور شروع نمی‌شود
```bash
# راه‌اندازی مجدد auto-start
pm2 startup
# دستوری که چاپ می‌شود را اجرا کنید، مثال:
# sudo env PATH=$PATH:/usr/bin pm2 startup systemd -u root --hp /root
pm2 save
```

---

## 💳 تنظیم درگاه‌های پرداخت

### Plisio (کریپتو)
1. آدرس سرور را در فایل `.env` تنظیم کنید:
   ```bash
   echo 'BASE_URL=https://yourdomain.com' >> ~/anchatpro/.env
   pm2 restart anchatbot
   ```
2. در تلگرام: ادمین → پرداخت → Plisio → 🔑 ورود API Key
3. در تلگرام: ادمین → پرداخت → Plisio → 🔗 تشخیص خودکار Callback URL
4. URL نمایش‌داده‌شده را در پنل Plisio در فیلد **Status URL** وارد کنید:
   ```
   https://yourdomain.com/webhook/plisio?json=true
   ```

### TetraPay (ریالی)
1. در تلگرام: ادمین → پرداخت → TetraPay → 🔑 ورود API Key
2. در تلگرام: ادمین → پرداخت → TetraPay → 🔄 تشخیص خودکار URL
3. URL را در پنل TetraPay وارد کنید:
   ```
   https://yourdomain.com/webhook/tetrapay
   ```

---

## 💾 بک‌آپ و بازیابی از داخل ربات

| عملیات | مسیر در ربات |
|--------|-------------|
| ارسال بک‌آپ | ادمین → 💾 Backup → 📤 Send now |
| تنظیم گروه بک‌آپ | ادمین → 💾 Backup → 🔑 Generate code → در گروه: `/verify_backup CODE` |
| بازیابی | فایل `backup_*.json.gz` را مستقیم به ربات بفرستید |

---

## 🔐 امنیت

- فایل `.env` با دسترسی `chmod 600` ایجاد می‌شود (فقط root قابل خواندن)
- رمز دیتابیس به‌صورت تصادفی ۲۸ کاراکتری تولید می‌شود
- کاربر دیتابیس `anchatbot` دسترسی محدود به host `localhost` دارد
- ADMIN_IDS در `.env` ادمین‌های مجاز را تعریف می‌کند

---

## 📊 مشخصات فنی

| مورد | مقدار |
|------|-------|
| Port | 5000 (قابل تغییر در .env) |
| Process Manager | PM2 با auto-restart |
| Max Restarts | 20 بار با ۵ ثانیه تأخیر |
| Log PM2 | `~/.pm2/logs/anchatbot-*.log` |
| DB Backup | JSON + gzip |
| Node.js | 22 LTS |

---

## 📞 دستورات اول راه‌اندازی در تلگرام

```
1. /start          — شروع و ثبت‌نام
2. /admin          — باز کردن پنل ادمین
3. Admin → 💾 Backup → 🔑 Generate code
4. در گروه بک‌آپ:  /verify_backup <CODE>
5. Admin → پرداخت → تنظیم درگاه‌ها
```

---

*آخرین ویرایش: نسخه v3 — نصب خودکار کامل با پشتیبانی ARM64*
