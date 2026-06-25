export const fa = {
  // Setup
  welcome: "👋 سلام! به ربات ناشناس خوش آمدید!\n\nلطفاً زبان خود را انتخاب کنید:",
  selectGender: "👤 جنسیت خود را انتخاب کنید:",
  selectAge: "🎂 سن خود را وارد کنید (عدد):",
  invalidAge: "❌ سن نامعتبر! لطفاً یک عدد بین 13 تا 100 وارد کنید.",
  profileComplete: "✅ پروفایل شما با موفقیت تنظیم شد!\n\nبه منوی اصلی خوش آمدید:",
  profileUpdated: "✅ پروفایل با موفقیت بروزرسانی شد!",

  // Genders
  male: "👦 مرد",
  female: "👧 زن",
  other: "🌈 سایر",

  // Main menu
  menuConnect: "🔗 اتصال به کاربر ناشناس",
  menuGroup: "👥 گروه ناشناس",
  menuMyLink: "🔗 لینک ناشناس من",
  menuCoins: "💰 سکه‌های من",
  menuHelp: "❓ راهنما",
  menuSettings: "⚙️ تنظیمات",
  menuReferral: "🎁 دعوت دوستان",

  // Matching
  selectGenderPref: "با چه جنسیتی می‌خواهید صحبت کنید؟",
  genderPrefFemale: "👧 زن",
  genderPrefMale: "👦 مرد",
  genderPrefAny: "🎲 هر کسی",
  insufficientCoins: "❌ سکه کافی ندارید!\n\n💰 برای اتصال به کاربر دیگر به 1 سکه نیاز دارید.\n\nاز منوی 💰 سکه‌های من سکه بخرید.",
  addedToQueue: "⏳ در صف انتظار قرار گرفتید!\n\nاگر ظرف 1 دقیقه متصل نشدید، دوباره تلاش کنید.",
  connected: "🎉 متصل شدید! می‌توانید با کاربر ناشناس صحبت کنید.\n\n⚠️ هویت شما کاملاً محفوظ است.",
  alreadyInQueue: "⏳ شما قبلاً در صف انتظار هستید.",
  alreadyInChat: "💬 شما هم‌اکنون در حال مکالمه هستید.",
  alreadyInGroup: "👥 شما هم‌اکنون در یک گروه هستید.",
  chatEnded: "🔴 مکالمه پایان یافت.",
  chatEndedByPartner: "🔴 طرف مقابل مکالمه را پایان داد.",
  endChat: "🔴 پایان مکالمه",
  reportUser: "🚨 گزارش کاربر",
  blockUser: "🚫 بلاک کاربر",
  notInChat: "❌ شما در حال مکالمه نیستید.",
  queueTimeout: "⏱️ زمان انتظار تمام شد. لطفاً دوباره تلاش کنید.",
  removedFromQueue: "✅ از صف خارج شدید.",
  cancelSearch: "❌ لغو جستجو",
  coinsDeducted: (n: number) => `💰 ${n} سکه کسر شد.`,

  // Chat controls
  chatHeader: "💬 مکالمه فعال",
  partnerIsTyping: "... در حال تایپ",
  messageForwarded: "✉️ پیام ارسال شد",
  cannotSendMedia: "⚠️ این نوع فایل پشتیبانی نمی‌شود.",

  // Report
  reportReasons: ["هرزه‌نگاری", "آزار و اذیت", "کلاهبرداری", "اسپم", "محتوای نامناسب", "سایر"],
  selectReportReason: "🚨 دلیل گزارش را انتخاب کنید:",
  reportSent: "✅ گزارش شما با موفقیت ثبت شد. ممنون از همکاری شما.",
  alreadyReported: "⚠️ شما قبلاً این کاربر را گزارش داده‌اید.",

  // Block
  blockReasons: ["هرزه‌نگاری", "آزار و اذیت", "اسپم", "مزاحمت", "سایر"],
  selectBlockReason: "🚫 دلیل بلاک را انتخاب کنید:",
  userBlocked: "🚫 کاربر بلاک شد.",
  alreadyBlocked: "⚠️ این کاربر قبلاً بلاک شده.",

  // Group chat
  joinGroup: "👥 پیوستن به گروه ناشناس",
  groupJoined: "🎉 به گروه ناشناس پیوستید!\n\nاعضا: {count} نفر\nمی‌توانید با همه صحبت کنید.",
  groupMessage: (id: string) => `[گروه] کاربر ${id}:\n`,
  leaveGroup: "🚪 خروج از گروه",
  groupLeft: "✅ از گروه خارج شدید.",
  groupEnded: "🔴 گروه منحل شد.",
  groupCostInfo: "💰 پیوستن به گروه 1 سکه هزینه دارد.",
  noGroupAvailable: "❌ گروهی در حال حاضر موجود نیست. یک گروه جدید ایجاد شد، منتظر باشید.",
  newGroupCreated: "🆕 گروه جدید ایجاد شد! منتظر سایر اعضا هستیم...",

  // Anonymous link
  myLink: "🔗 لینک ناشناس شما:",
  linkInfo: "هر کسی می‌تواند از طریق این لینک برای شما پیام ناشناس بفرستد.",
  anonMsgReceived: "📩 پیام ناشناس جدید دریافت کردید:",
  replyAnon: "↩️ پاسخ ناشناس",
  replyPrompt: "پاسخ خود را وارد کنید:",
  replySent: "✅ پاسخ ارسال شد.",
  yourReply: "📤 پاسخ دریافت شد:",
  sendAnonMsg: "پیام ناشناس خود را برای این کاربر بنویسید:",
  anonMsgSent: "✅ پیام ناشناس شما ارسال شد.",
  blockSender: "🚫 بلاک فرستنده",
  reportSender: "🚨 گزارش فرستنده",

  // Coins
  coinsBalance: (n: number) => `💰 موجودی شما: **${n} سکه**`,
  buyCoins: "🛒 خرید سکه",
  coinHistory: "📋 تاریخچه سکه‌ها",
  selectPackage: "📦 بسته مورد نظر را انتخاب کنید:",
  packageInfo: (coins: number, price: number, currency: string) => `💰 ${coins} سکه — ${price.toLocaleString()} ${currency}`,
  selectPaymentMethod: "💳 روش پرداخت را انتخاب کنید:",
  payByCard: "💳 پرداخت با کارت",
  payByCrypto: "₿ پرداخت با ارز دیجیتال",
  payByGateway: "🌐 درگاه آنلاین",
  cardPaymentInfo: (cardNo: string, amount: number) => `💳 **پرداخت با کارت**\n\nشماره کارت: \`${cardNo}\`\nمبلغ: ${amount.toLocaleString()} تومان\n\nبعد از واریز، رسید را آپلود کنید.`,
  cryptoPaymentInfo: (wallet: string, amount: string) => `₿ **پرداخت با ارز دیجیتال**\n\nآدرس کیف پول: \`${wallet}\`\nمبلغ: ${amount}\n\nبعد از ارسال، رسید را آپلود کنید.`,
  uploadReceipt: "📷 رسید پرداخت را آپلود کنید:",
  receiptSubmitted: "✅ رسید شما ارسال شد و در صف بررسی قرار گرفت.",
  paymentApproved: (coins: number) => `✅ پرداخت تأیید شد! ${coins} سکه به حساب شما اضافه شد.`,
  paymentRejected: "❌ پرداخت شما رد شد. برای اطلاعات بیشتر با پشتیبانی تماس بگیرید.",
  gatewayUnavailable: "⚠️ درگاه آنلاین در حال حاضر در دسترس نیست.",
  paymentMethodDisabled: "⚠️ این روش پرداخت در حال حاضر غیرفعال است.",

  // Referral
  referralInfo: (code: string, link: string, total: number, coins: number) =>
    `🎁 **برنامه دعوت**\n\nکد دعوت شما: \`${code}\`\nلینک دعوت:\n${link}\n\n👥 تعداد دعوت‌شده‌ها: ${total}\n💰 سکه‌های کسب‌شده: ${coins}\n\nبه ازای هر دعوت موفق، 5 سکه دریافت می‌کنید!`,
  referralReward: (n: number) => `🎁 تبریک! ${n} سکه از دعوت دوست شما دریافت کردید.`,
  referralWelcome: (name: string) => `👋 سلام! شما توسط ${name} دعوت شده‌اید.`,

  // Settings
  settingsMenu: "⚙️ تنظیمات پروفایل:",
  changeGender: "👤 تغییر جنسیت",
  changeAge: "🎂 تغییر سن",
  changeLanguage: "🌐 تغییر زبان",
  currentProfile: (gender: string, age: number) => `👤 جنسیت: ${gender}\n🎂 سن: ${age}`,

  // Help
  helpText: `❓ **راهنمای ربات**

🔗 **اتصال ناشناس:**
با کلیک روی "اتصال به کاربر ناشناس" می‌توانید با یک کاربر تصادفی و ناشناس صحبت کنید.

👥 **گروه ناشناس:**
به گروه‌های 3 تا 10 نفره وارد شوید و با چند نفر به صورت ناشناس چت کنید.

🔗 **لینک ناشناس:**
لینک اختصاصی شما که می‌توانید آن را با دیگران به اشتراک بگذارید تا پیام ناشناس بفرستند.

💰 **سکه‌ها:**
• اتصال به کاربر جنسیت خاص: 1 سکه
• ورود به گروه: 1 سکه
• دریافت با دعوت دوستان یا خرید

🎁 **دعوت دوستان:**
به ازای هر دعوت موفق 5 سکه دریافت کنید!

🚫 **قوانین:**
• ارسال محتوای نامناسب ممنوع است
• آزار و اذیت کاربران ممنوع است
• تبلیغات ممنوع است

🛡️ **امنیت:**
• هویت شما کاملاً محفوظ است
• می‌توانید کاربران را گزارش یا بلاک کنید`,

  // Safety
  warningIssued: (n: number) => `⚠️ اخطار ${n} از 3. در صورت تکرار، حساب شما محدود می‌شود.`,
  userRestricted: "🚫 حساب شما به مدت 24 ساعت محدود شده است.",
  userBanned: "🔨 حساب شما مسدود شده است. برای اعتراض با پشتیبانی تماس بگیرید.",
  messageBlocked: "⚠️ پیام شما حاوی محتوای نامناسب است و ارسال نشد.",
  rateLimitExceeded: "⏱️ پیام‌های خیلی زیادی ارسال کردید. لطفاً کمی صبر کنید.",

  // Admin
  adminWelcome: "👑 پنل ادمین",
  adminStats: (stats: any) => `📊 **آمار کلی**\n\n👥 کل کاربران: ${stats.totalUsers}\n🟢 کاربران فعال: ${stats.activeUsers}\n💬 کل مکالمات: ${stats.totalChats}\n💰 کل تراکنش‌ها: ${stats.totalTransactions}\n📋 گزارش‌های جدید: ${stats.pendingReports}`,
  adminNotFound: "❌ کاربر یافت نشد.",
  adminUserInfo: (u: any) => `👤 **اطلاعات کاربر**\n\nID: ${u.telegramId}\nنام: ${u.firstName}\nجنسیت: ${u.gender}\nسن: ${u.age}\n💰 سکه: ${u.coins}\n📅 عضویت: ${u.createdAt}\nوضعیت: ${u.status}`,
  adminCoinsAdded: (n: number, uid: number) => `✅ ${n} سکه به کاربر ${uid} اضافه شد.`,
  adminCoinsRemoved: (n: number, uid: number) => `✅ ${n} سکه از کاربر ${uid} کسر شد.`,
  adminUserBanned: (uid: number) => `🔨 کاربر ${uid} مسدود شد.`,
  adminUserUnbanned: (uid: number) => `✅ مسدودیت کاربر ${uid} برداشته شد.`,
  adminBroadcastSent: (n: number) => `✅ پیام برای ${n} کاربر ارسال شد.`,
  backupSent: "✅ بکاپ با موفقیت ارسال شد.",
  backupFailed: "❌ ارسال بکاپ با خطا مواجه شد.",
  backupConfigured: "✅ تنظیمات بکاپ ذخیره شد.",

  // Payment review (admin group)
  paymentReviewMsg: (p: any) => `💳 **درخواست پرداخت جدید**\n\nکاربر: ${p.userId}\nبسته: ${p.coins} سکه\nمبلغ: ${p.price.toLocaleString()} ${p.currency}\nروش: ${p.method}\nزمان: ${new Date(p.createdAt).toLocaleString("fa-IR")}`,
  approvePayment: "✅ تأیید",
  rejectPayment: "❌ رد",
  paymentAlreadyProcessed: "⚠️ این پرداخت قبلاً پردازش شده است.",

  // Errors
  errorGeneral: "❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.",
  errorNotRegistered: "❌ لطفاً ابتدا ثبت‌نام کنید. /start را بزنید.",
  back: "🔙 بازگشت",
  cancel: "❌ لغو",
  confirm: "✅ تأیید",

  // Misc
  yes: "✅ بله",
  no: "❌ خیر",
  enterAmount: "مقدار سکه را وارد کنید:",
  enterUserId: "آیدی عددی کاربر را وارد کنید:",
  enterMessage: "متن پیام را وارد کنید:",
  done: "✅ انجام شد",
};

export type LangKeys = typeof fa;
