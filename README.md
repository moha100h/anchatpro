# 🤖 AnonymousChatBot — ربات چت ناشناس تلگرام

یک ربات حرفه‌ای و کامل برای چت ناشناس، تماس صوتی/تصویری، گروه، لینک ناشناس، سیستم سکه و پرداخت — ساخته‌شده با Grammy، TypeScript، PostgreSQL و Drizzle ORM.

---

## ⚡ نصب سریع (یک دستور)

```bash
git clone https://github.com/YOUR_REPO/anymschatbot.git
cd anymschatbot
sudo bash install.sh
```

اسکریپت **فقط** این ۳ ورودی را می‌خواهد:

| ورودی | مثال |
|-------|------|
| توکن ربات | از [@BotFather](https://t.me/BotFather) |
| آیدی عددی ادمین | Telegram User ID |
| دامین عمومی | `tisabuy.com` (بدون https://) |

همه چیز دیگر خودکار نصب و راه‌اندازی می‌شود:
- ✅ Node.js 22, pnpm, PostgreSQL, PM2
- ✅ **nginx** — ریورس پروکسی (HTTP/HTTPS)
- ✅ **Let's Encrypt SSL** — گواهی HTTPS رایگان
- ✅ **coturn** — TURN server برای تماس WebRTC
- ✅ دیتابیس و schema خودکار
- ✅ تمام تنظیمات تماس ناشناس خودکار (URL، TURN host)

---

## 📋 پیش‌نیازها

- سرور VPS با Ubuntu 20+ یا Debian 11+
- دامنه که به IP سرور اشاره کند (برای SSL)
- پورت‌های باز: `80`, `443`, `3478` (UDP/TCP)

---

## ✨ امکانات

### 📞 تماس ناشناس (Mini App)
- مینی‌اپ تلگرام برای تماس صوتی و تصویری ناشناس
- دکمه ثابت در منوی ربات و منوی BotFather
- هزینه قابل تنظیم (شانسی / با ترجیح جنسیت)
- TURN server (coturn) برای عبور از NAT/Firewall
- فعال/غیرفعال از پنل ادمین (دکمه BotFather به‌روز می‌شود)

### 🔗 چت ناشناس یک‌به‌یک
- صف هوشمند با ترجیح جنسیت (پسر / دختر / شانسی)
- تاگل هم‌سن — اتصال به کاربر هم‌سن
- سه اتصال رایگان روزانه؛ بیشتر با سکه
- گزارش، بلاک، پایان مکالمه

### 👥 گروه ناشناس
- گروه‌های ۳ تا ۱۰ نفر (قابل افزایش به ۲۵)
- نام‌گذاری گروه + لینک دعوت اختصاصی
- نقش‌ها: 👑 سازنده / ⭐ ادمین / عضو

### 🔗 لینک ناشناس
- لینک ثابت اختصاصی
- لینک مدت‌دار (۱ساعت / ۶ساعت / ۲۴ساعت / ۷روز)
- صندوق پیام با شمارش خوانده‌نشده‌ها

### 💎 لینک ناشناس پرو
- لینک دائمی پرو (ap_) و داخل‌برنامه‌ای (ai_)
- ارسال چند پیام متوالی در یک session

### 💰 سیستم سکه و پرداخت
- ۵ روش: کارت / کریپتو دستی / TetraPay / Plisio / ⭐ Telegram Stars
- تأیید خودکار یا دستی
- جلوگیری از تراکنش تکراری

### 👑 پنل ادمین کامل
- آمار لحظه‌ای، مدیریت کاربران
- تنظیم تمام هزینه‌ها
- پخش پیام، بکاپ خودکار
- فیلتر کلمات نامناسب

---

## ⚙️ نصب دستی (بدون اسکریپت)

### پیش‌نیازها
- Node.js 22+, PostgreSQL 14+, pnpm 8+
- nginx, certbot, coturn

### ۱. متغیرهای محیطی
فایل `.env` در ریشه پروژه:

```env
TELEGRAM_BOT_TOKEN=1234567890:AAF...
ADMIN_IDS=123456789
DATABASE_URL=postgresql://user:pass@localhost:5432/anchatbot
PUBLIC_DOMAIN=tisabuy.com
NODE_ENV=production
PORT=8080
```

### ۲. نصب و بیلد
```bash
pnpm install
pnpm --filter @workspace/db run push-force
pnpm --filter @workspace/api-server run build
```

### ۳. اجرا
```bash
pm2 start "pnpm --filter @workspace/api-server run start" --name anchatbot
pm2 save && pm2 startup
```

### ۴. nginx
```nginx
server {
    listen 443 ssl http2;
    server_name YOUR_DOMAIN;
    ssl_certificate     /etc/letsencrypt/live/YOUR_DOMAIN/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/YOUR_DOMAIN/privkey.pem;
    location / {
        proxy_pass http://127.0.0.1:8080;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection "upgrade";
        proxy_set_header Host $host;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

### ۵. SSL
```bash
certbot --nginx -d YOUR_DOMAIN
```

### ۶. coturn
```bash
# /etc/turnserver.conf
listening-port=3478
external-ip=YOUR_SERVER_IP
realm=YOUR_DOMAIN
fingerprint
lt-cred-mech
use-auth-secret
static-auth-secret=YOUR_RANDOM_SECRET
```

---

## 📞 راه‌اندازی تماس ناشناس

همه تنظیمات **خودکار** در startup اعمال می‌شوند:

| تنظیم | مقدار خودکار |
|--------|--------------|
| URL مینی‌اپ | `https://PUBLIC_DOMAIN/call/` |
| TURN Host | `PUBLIC_DOMAIN` |
| TURN Port | `3478` |

برای مدیریت از ربات:
- `/admin` → **هزینه‌ها** → **📞 تماس ناشناس**

گزینه‌های پنل:
- `📱 فعال/غیرفعال MiniApp` — دکمه BotFather را فوری به‌روز می‌کند
- هزینه تماس صوتی/تصویری (شانسی / با ترجیح جنسیت)
- حداقل موجودی و حداکثر مدت
- `⚙️ تنظیمات TURN Server` — تنظیم coturn

---

## 💳 راه‌اندازی درگاه‌های پرداخت

### 💫 Plisio
1. ثبت‌نام در [plisio.net](https://plisio.net)
2. `/admin` → پرداخت → 💫 Plisio → 🔑 ثبت کلید API
3. 🔗 تشخیص خودکار Callback URL
4. همان URL را در پنل Plisio وارد کنید

### 🌐 TetraPay
1. `/admin` → پرداخت → 🌐 TetraPay → 🔑 ثبت API Key
2. 🔄 تشخیص خودکار URL

### ⭐ Telegram Stars
- بدون تنظیم اضافی — فقط فعال کنید

---

## 💾 راه‌اندازی بکاپ

1. `/admin` → ⚙️ سیستم → 💾 بکاپ
2. 🔑 کد تأیید جدید
3. ربات را به گروه تلگرامی اضافه کنید
4. در آن گروه: `/verify_backup <کد>`
5. ⏱️ زمان‌بندی و 📤 تست

---

## 🔄 به‌روزرسانی

```bash
cd /path/to/anymschatbot
git pull
pnpm install --frozen-lockfile
pnpm --filter @workspace/api-server run build
pnpm --filter @workspace/db run push-force
pm2 restart anchatbot
```

---

## 👑 دستورات ادمین

| دستور | توضیح |
|-------|-------|
| `/admin` | پنل مدیریت |
| `/verify_backup <code>` | تأیید گروه بکاپ (در گروه) |

### بخش‌های پنل

| بخش | امکانات |
|-----|---------|
| 📊 آمار | کاربران، چت، تراکنش، گزارش |
| 👤 کاربران | جستجو، شارژ/کسر، بن/آنبن |
| 💳 پرداخت | کارت، کریپتو، Plisio، TetraPay، Stars |
| 💰 هزینه‌ها | اتصال، گروه، لینک، تماس ناشناس |
| 📢 پخش | ارسال به همه / کاربران فعال |
| 💾 بکاپ | گروه، زمان‌بندی، دستی، بازیابی |

---

## 🛠️ دستورات مفید

```bash
pm2 status                           # وضعیت
pm2 logs anchatbot                   # لاگ زنده
pm2 restart anchatbot                # ری‌استارت
systemctl status nginx               # وضعیت nginx
systemctl status coturn              # وضعیت TURN server
certbot renew --dry-run              # تست تمدید SSL
```

---

## 🔒 امنیت

- Rate limiting (30 پیام / 10 ثانیه)
- فیلتر کلمات نامناسب
- سیستم هشدار (۳ → محدودیت ۲۴ساعته → بن)
- Plisio: تأیید HMAC-SHA1
- SSL + nginx جلوی سرور
- TURN با احراز هویت secret

---

## 🏗️ ساختار پروژه

```
anymschatbot/
├── install.sh                      ← نصب‌کننده خودکار کامل
├── .env                            ← توسط install.sh ساخته می‌شود
├── artifacts/
│   ├── api-server/src/
│   │   ├── bot/handlers/           ← هندلرهای بات
│   │   ├── call/                   ← signaling WebRTC + API
│   │   ├── app.ts                  ← Express + static /call/
│   │   └── index.ts                ← startup + auto-config
│   └── mini-app/src/               ← Mini App (React + Vite)
└── lib/db/src/schema/              ← Drizzle ORM schemas
```

---

## 🧰 تکنولوژی‌ها

| بخش | تکنولوژی |
|-----|----------|
| Bot Framework | [Grammy](https://grammy.dev/) v1 |
| Runtime | Node.js 22 + TypeScript |
| Database | PostgreSQL + [Drizzle ORM](https://orm.drizzle.team/) |
| API Server | Express 5 |
| Mini App | React + Vite |
| Proxy | nginx + Let's Encrypt |
| WebRTC TURN | coturn |
| Process Manager | PM2 |
| Build | esbuild |
