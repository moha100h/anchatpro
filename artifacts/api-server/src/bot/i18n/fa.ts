export const fa = {
  // ─── Setup ───────────────────────────────────────────────────────────────────
  welcome: "👋 سلام! به ربات ناشناس خوش آمدید!\n\nلطفاً زبان خود را انتخاب کنید:",
  selectGender: "👤 جنسیت خود را انتخاب کنید:",
  selectAge: "🎂 سن خود را وارد کنید (یک عدد بین 13 تا 100):",
  selectCity: "🏙️ شهر خود را وارد کنید:\n\n(برای رد کردن این مرحله، یک نقطه «.» بفرستید)",
  invalidAge: "❌ سن نامعتبر! لطفاً یک عدد بین 13 تا 100 وارد کنید.",
  profileComplete: "✅ پروفایل شما با موفقیت تنظیم شد!\n\nبه منوی اصلی خوش آمدید:",
  profileUpdated: "✅ پروفایل با موفقیت بروزرسانی شد!",

  // ─── Genders ─────────────────────────────────────────────────────────────────
  male: "👦 مرد",
  female: "👧 زن",
  other: "🌈 سایر",

  // ─── Main menu ───────────────────────────────────────────────────────────────
  menuConnect: "🔗 اتصال به کاربر ناشناس",
  menuGroup: "👥 گروه ناشناس",
  menuCreateGroup: "🆕 ساخت گروه ناشناس",
  menuMyLink: "🔗 لینک ناشناس من",
  menuCoins: "💰 سکه‌های من",
  menuHelp: "❓ راهنما",
  menuSettings: "⚙️ تنظیمات",
  menuReferral: "🎁 دعوت دوستان",

  // ─── Matching ────────────────────────────────────────────────────────────────
  selectGenderPref: "با چه جنسیتی می‌خواهید صحبت کنید؟",
  genderPrefFemale: "👧 زن",
  genderPrefMale: "👦 مرد",
  genderPrefAny: "🎲 هر کسی",
  insufficientCoins: "❌ سکه کافی ندارید!\n\n💰 برای اتصال به جنسیت خاص به 1 سکه نیاز دارید.\n\nاز منوی 💰 سکه‌های من سکه بخرید.",
  addedToQueue: "⏳ در صف انتظار قرار گرفتید!\n\nبرای لغو دکمه زیر را بزنید.",
  connected: "🎉 متصل شدید!\n\n⚠️ هویت شما کاملاً محفوظ است.\nمی‌توانید پیام، عکس، ویدیو، صدا و استیکر ارسال کنید.",
  alreadyInQueue: "⏳ شما قبلاً در صف انتظار هستید.",
  alreadyInChat: "💬 شما هم‌اکنون در حال مکالمه هستید.",
  alreadyInGroup: "👥 شما هم‌اکنون در یک گروه هستید.",
  chatEnded: "🔴 مکالمه پایان یافت.\n\nبرای مکالمه جدید از منوی اصلی استفاده کنید.",
  chatEndedByPartner: "🔴 طرف مقابل مکالمه را پایان داد.\n\nبرای مکالمه جدید از منوی اصلی استفاده کنید.",
  endChat: "🔴 پایان مکالمه",
  reportUser: "🚨 گزارش کاربر",
  blockUser: "🚫 بلاک کاربر",
  notInChat: "❌ شما در حال مکالمه نیستید.",
  queueTimeout: "⏱️ زمان انتظار تمام شد. لطفاً دوباره تلاش کنید.",
  removedFromQueue: "✅ از صف خارج شدید.",
  cancelSearch: "❌ لغو جستجو",
  coinsDeducted: (n: number) => `💰 ${n} سکه کسر شد.`,

  // ─── Chat controls ───────────────────────────────────────────────────────────
  chatHeader: "💬 مکالمه فعال",
  partnerIsTyping: "... در حال تایپ",
  messageForwarded: "✉️ پیام ارسال شد",
  cannotSendMedia: "⚠️ این نوع فایل پشتیبانی نمی‌شود.",

  // ─── Report ──────────────────────────────────────────────────────────────────
  reportReasons: ["هرزه‌نگاری", "آزار و اذیت", "کلاهبرداری", "اسپم", "محتوای نامناسب", "سایر"],
  selectReportReason: "🚨 دلیل گزارش را انتخاب کنید:",
  reportSent: "✅ گزارش شما با موفقیت ثبت شد. ممنون از همکاری شما.",
  alreadyReported: "⚠️ شما قبلاً این کاربر را گزارش داده‌اید.",

  // ─── Block ───────────────────────────────────────────────────────────────────
  blockReasons: ["هرزه‌نگاری", "آزار و اذیت", "اسپم", "مزاحمت", "سایر"],
  selectBlockReason: "🚫 دلیل بلاک را انتخاب کنید:",
  userBlocked: "🚫 کاربر بلاک شد.",
  alreadyBlocked: "⚠️ این کاربر قبلاً بلاک شده.",

  // ─── Group chat ──────────────────────────────────────────────────────────────
  joinGroup: "👥 پیوستن به گروه ناشناس",
  groupJoined: "🎉 به گروه ناشناس پیوستید!\n\n👥 اعضا: {count} نفر\nمی‌توانید با همه صحبت کنید.",
  groupMessage: (id: string) => `[گروه] کاربر ${id}:\n`,
  leaveGroup: "🚪 خروج از گروه",
  groupLeft: "✅ از گروه خارج شدید.",
  groupEnded: "🔴 گروه منحل شد.",
  groupCostInfo: "💰 پیوستن به گروه 1 سکه هزینه دارد.",
  noGroupAvailable: "❌ گروهی موجود نیست. یک گروه جدید ایجاد شد، منتظر باشید.",
  newGroupCreated: "🆕 گروه جدید ایجاد شد! منتظر سایر اعضا هستیم...",
  memberJoined: (id: string, count: number) => `👥 کاربر ${id} به گروه پیوست. (${count} نفر)`,
  memberLeft: (id: string, count: number) => `🚪 کاربر ${id} از گروه خارج شد. (${count} نفر)`,

  // ─── Group creation (paid) ────────────────────────────────────────────────
  createGroupInfo: (cost: number) =>
    `🆕 **ساخت گروه ناشناس**\n\n` +
    `💰 هزینه: **${cost} سکه**\n\n` +
    `شما سازنده گروه خواهید بود و می‌توانید اعضا را اخراج یا مسدود کنید.\n\n` +
    `آیا تأیید می‌کنید؟`,
  groupCreatedSuccess: "🎉 گروه ناشناس شما ایجاد شد!\n\nمنتظر پیوستن اعضا هستیم...\nشما سازنده این گروه هستید.",
  manageMembers: "👥 مدیریت اعضا",
  memberListTitle: "👥 **اعضای فعلی گروه:**\n\n",
  noMembersToManage: "❌ هیچ عضوی برای مدیریت وجود ندارد.",
  kickBtn: "🚫 اخراج",
  banBtn: "🔨 مسدود",
  youWereKicked: "🚫 شما توسط سازنده از گروه اخراج شدید.",
  youWereBanned: "🔨 شما توسط سازنده از این گروه مسدود شدید و نمی‌توانید دوباره وارد شوید.",
  memberKickedNotif: (alias: string) => `✅ کاربر ${alias} از گروه اخراج شد.`,
  memberBannedNotif: (alias: string) => `✅ کاربر ${alias} از گروه مسدود شد.`,
  notGroupCreator: "❌ شما سازنده این گروه نیستید.",
  cannotKickCreator: "❌ نمی‌توانید سازنده گروه را اخراج کنید.",
  groupActiveNotif: (count: number) => `🎉 گروه شما فعال شد! **${count}** عضو دارد.`,

  // ─── Anonymous link ──────────────────────────────────────────────────────────
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

  // ─── Coins ───────────────────────────────────────────────────────────────────
  coinsBalance: (n: number) => `💰 موجودی شما: **${n} سکه**`,
  buyCoins: "🛒 خرید سکه",
  coinHistory: "📋 تاریخچه سکه‌ها",
  selectPackage: "📦 بسته مورد نظر را انتخاب کنید:",
  packageInfo: (coins: number, price: number, currency: string) =>
    `💰 ${coins} سکه — ${price.toLocaleString()} ${currency}`,
  selectPaymentMethod: "💳 روش پرداخت را انتخاب کنید:",
  payByCard: "💳 پرداخت با کارت",
  payByCrypto: "₿ پرداخت با ارز دیجیتال",
  payByGateway: "🌐 درگاه آنلاین (TetraPay)",
  cardPaymentInfo: (cardNo: string, amount: number) =>
    `💳 **پرداخت با کارت بانکی**\n\n` +
    `شماره کارت:\n\`${cardNo}\`\n\n` +
    `مبلغ: **${amount.toLocaleString()} تومان**\n\n` +
    `⚠️ بعد از واریز، رسید (عکس فیش) را در همین چت آپلود کنید.`,
  cryptoPaymentInfo: (wallet: string, amount: string) =>
    `₿ **پرداخت با ارز دیجیتال (USDT TRC20)**\n\n` +
    `آدرس کیف پول:\n\`${wallet}\`\n\n` +
    `مبلغ: **${amount}**\n\n` +
    `🌐 شبکه: **TRON (TRC20)**\n\n` +
    `⚠️ بعد از ارسال، رسید (عکس تراکنش) را در همین چت آپلود کنید.`,
  cryptoPaymentLinkBtn: "🔗 باز کردن در Trust Wallet",
  gatewayPaymentInfo: (amount: number) =>
    `🌐 **پرداخت آنلاین (TetraPay)**\n\n` +
    `مبلغ: **${amount.toLocaleString()} تومان**\n\n` +
    `روی یکی از دکمه‌های زیر کلیک کنید و پرداخت را انجام دهید.\n` +
    `پس از پرداخت، سکه‌ها به صورت خودکار اضافه می‌شوند.`,
  openPaymentBot: "🤖 پرداخت از طریق ربات",
  openPaymentWeb: "🌐 پرداخت از طریق مرورگر",
  gatewayCreating: "⏳ در حال ایجاد لینک پرداخت...",
  gatewayError: (msg: string) => `❌ خطا در ایجاد درگاه پرداخت:\n${msg}`,
  uploadReceipt: "📷 رسید پرداخت را آپلود کنید:",
  receiptSubmitted: "✅ رسید شما ارسال شد و در صف بررسی قرار گرفت.\n\nنتیجه پس از بررسی ادمین اعلام می‌شود.",
  paymentCancelled: "❌ پرداخت لغو شد.",
  paymentApproved: (coins: number) => `✅ پرداخت تأیید شد!\n\n💰 **${coins} سکه** به حساب شما اضافه شد.`,
  paymentRejected: "❌ پرداخت شما رد شد. برای اطلاعات بیشتر با پشتیبانی تماس بگیرید.",
  gatewayUnavailable: "⚠️ درگاه آنلاین در حال حاضر در دسترس نیست.",
  paymentMethodDisabled: "⚠️ این روش پرداخت در حال حاضر غیرفعال است.",

  // ─── Referral ────────────────────────────────────────────────────────────────
  referralInfo: (code: string, link: string, total: number, coins: number) =>
    `🎁 **برنامه دعوت دوستان**\n\n` +
    `کد دعوت شما: \`${code}\`\n` +
    `لینک دعوت:\n${link}\n\n` +
    `👥 تعداد دعوت‌شده‌ها: **${total}** نفر\n` +
    `💰 سکه‌های کسب‌شده: **${coins}** سکه\n\n` +
    `🎉 به ازای هر دعوت موفق، **5 سکه** دریافت می‌کنید!`,
  referralReward: (n: number) => `🎁 تبریک! ${n} سکه از دعوت دوست شما دریافت کردید.`,
  referralWelcome: (name: string) => `👋 سلام! شما توسط **${name}** دعوت شده‌اید.`,

  // ─── Settings ────────────────────────────────────────────────────────────────
  settingsMenu: "⚙️ تنظیمات پروفایل:",
  changeGender: "👤 تغییر جنسیت",
  changeAge: "🎂 تغییر سن",
  changeLanguage: "🌐 تغییر زبان",
  changeCity: "🏙️ تغییر شهر",
  currentProfile: (gender: string, age: number, city?: string | null) =>
    `👤 جنسیت: **${gender}**\n🎂 سن: **${age}**` + (city ? `\n🏙️ شهر: **${city}**` : ""),
  cancelledAction: "❌ عملیات لغو شد.",

  // ─── Force Join ───────────────────────────────────────────────────────────────
  forceJoinEnabled: "✅ اجبار عضویت فعال شد.",
  forceJoinDisabled: "✅ اجبار عضویت غیرفعال شد.",
  forceJoinChannelSet: (ch: string) => `✅ کانال اجبار عضویت به «${ch}» تنظیم شد.`,
  forceJoinStatus: (enabled: boolean, channel: string | null) =>
    `📢 **تنظیمات اجبار عضویت**\n\n` +
    `وضعیت: ${enabled ? "✅ فعال" : "❌ غیرفعال"}\n` +
    `کانال: ${channel ?? "تنظیم نشده"}`,
  forceJoinEnterChannel: "آدرس کانال را وارد کنید (مثال: @mychannel):",
  toggleForceJoin: "🔄 تغییر وضعیت اجبار عضویت",
  setForceJoinChannel: "📢 تنظیم کانال",

  // ─── Help ─────────────────────────────────────────────────────────────────────
  helpText:
    `❓ **راهنمای ربات**\n\n` +
    `🔗 **اتصال ناشناس:**\n` +
    `با کلیک روی "اتصال به کاربر ناشناس" با یک کاربر تصادفی صحبت کنید.\n` +
    `اتصال به جنسیت خاص = 1 سکه | هر کسی = رایگان\n\n` +
    `👥 **گروه ناشناس:**\n` +
    `به گروه‌های 3 تا 10 نفره وارد شوید. هزینه: 1 سکه\n\n` +
    `🆕 **ساخت گروه:**\n` +
    `گروه اختصاصی بسازید و اعضا را مدیریت کنید.\n\n` +
    `🔗 **لینک ناشناس:**\n` +
    `لینک اختصاصی برای دریافت پیام ناشناس از دیگران.\n\n` +
    `💰 **سکه‌ها:**\n` +
    `• اتصال به جنسیت خاص: 1 سکه\n` +
    `• ورود به گروه: 1 سکه\n` +
    `• ساخت گروه: 3 سکه (پیش‌فرض)\n` +
    `• خرید سکه: از منوی 💰 سکه‌های من\n` +
    `• دریافت رایگان با دعوت دوستان\n\n` +
    `🎁 **دعوت دوستان:**\n` +
    `به ازای هر دعوت موفق 5 سکه دریافت کنید!\n\n` +
    `🚫 **قوانین:**\n` +
    `• محتوای نامناسب، تبلیغات و آزار ممنوع است\n` +
    `• تخلف = اخطار، محدودیت، یا مسدود شدن\n\n` +
    `🛡️ **امنیت:**\n` +
    `• هویت شما کاملاً محفوظ است\n` +
    `• می‌توانید کاربران را گزارش یا بلاک کنید`,

  // ─── Safety ──────────────────────────────────────────────────────────────────
  warningIssued: (n: number) =>
    `⚠️ اخطار ${n} از 3 صادر شد.\nدر صورت تکرار، حساب شما محدود خواهد شد.`,
  userRestricted: "🚫 حساب شما به مدت 24 ساعت محدود شده است.",
  userBanned: "🔨 حساب شما مسدود شده است. برای اعتراض با پشتیبانی تماس بگیرید.",
  messageBlocked: "⚠️ پیام شما حاوی محتوای نامناسب بود و ارسال نشد.",
  rateLimitExceeded: "⏱️ پیام‌های بیش از حد ارسال کردید. کمی صبر کنید.",

  // ─── Admin ───────────────────────────────────────────────────────────────────
  adminWelcome: "👑 پنل ادمین",
  adminStats: (stats: any) =>
    `📊 **آمار کلی**\n\n` +
    `👥 کل کاربران: ${stats.totalUsers}\n` +
    `🟢 کاربران فعال (7 روز): ${stats.activeUsers}\n` +
    `💬 کل مکالمات: ${stats.totalChats}\n` +
    `💰 کل تراکنش‌ها: ${stats.totalTransactions}\n` +
    `📋 گزارش‌های جدید: ${stats.pendingReports}`,
  adminNotFound: "❌ کاربر یافت نشد.",
  adminUserInfo: (u: any) =>
    `👤 **اطلاعات کاربر**\n\n` +
    `ID: \`${u.telegramId}\`\n` +
    `نام: ${u.firstName}\n` +
    `جنسیت: ${u.gender ?? "—"}\n` +
    `سن: ${u.age ?? "—"}\n` +
    `🏙️ شهر: ${u.city ?? "—"}\n` +
    `💰 سکه: ${u.coins}\n` +
    `📅 عضویت: ${new Date(u.createdAt).toLocaleDateString("fa-IR")}\n` +
    `وضعیت: ${u.status}`,
  adminCoinsAdded: (n: number, uid: number) => `✅ ${n} سکه به کاربر ${uid} اضافه شد.`,
  adminCoinsRemoved: (n: number, uid: number) => `✅ ${n} سکه از کاربر ${uid} کسر شد.`,
  adminUserBanned: (uid: number) => `🔨 کاربر ${uid} مسدود شد.`,
  adminUserUnbanned: (uid: number) => `✅ مسدودیت کاربر ${uid} برداشته شد.`,
  adminBroadcastSent: (n: number) => `✅ پیام برای ${n} کاربر ارسال شد.`,
  adminCannotBanOwner: "🛡️ اوونر ربات قابل مسدود شدن نیست.",
  backupSent: "✅ بکاپ با موفقیت ارسال شد.",
  backupFailed: "❌ ارسال بکاپ با خطا مواجه شد.",
  backupConfigured: "✅ تنظیمات بکاپ ذخیره شد.",

  // ─── Admin: sub-admin management ─────────────────────────────────────────────
  adminManageAdmins: "👤 مدیریت ادمین‌ها",
  adminWelcomeMsg: "📝 پیام خوشامد",
  addSubAdmin: "➕ اضافه کردن ادمین",
  removeSubAdmin: "➖ حذف ادمین",
  currentSubAdmins: "👥 **ادمین‌های فعلی:**\n",
  noSubAdmins: "❌ هیچ ادمین فرعی‌ای تنظیم نشده.",
  adminLevelAdmin: "مدیر کامل",
  adminLevelModerator: "ناظر",
  enterAdminId: "آیدی عددی ادمین جدید را وارد کنید:",
  selectAdminLevel: "سطح دسترسی ادمین را انتخاب کنید:",
  adminAdded: (id: number, level: string) => `✅ ادمین ${id} با سطح «${level}» اضافه شد.`,
  adminRemoved: (id: number) => `✅ ادمین ${id} حذف شد.`,
  adminAlreadyExists: "⚠️ این کاربر قبلاً ادمین است.",
  setWelcomeMsgPrompt: "📝 پیام خوشامد جدید را وارد کنید:\n\n(برای پاک کردن پیام، عدد 0 را ارسال کنید)",
  welcomeMsgSet: "✅ پیام خوشامد تنظیم شد.",
  welcomeMsgCleared: "✅ پیام خوشامد پاک شد.",
  currentWelcomeMsg: (msg: string) => `📝 **پیام خوشامد فعلی:**\n\n${msg}`,
  noWelcomeMsg: "📝 پیام خوشامد تنظیم نشده.",

  // ─── Admin: TetraPay + Force Join settings ────────────────────────────────────
  adminTetraPay: "💳 تنظیمات TetraPay",
  tetraPayApiKeySet: "✅ کلید API TetraPay تنظیم شد.",
  tetraPayCallbackSet: "✅ آدرس کالبک TetraPay تنظیم شد.",
  enterTetraPayApiKey: "🔑 کلید API TetraPay را وارد کنید:",
  enterTetraPayCallback: "🌐 آدرس کالبک TetraPay را وارد کنید (مثال: https://yourdomain.com/webhook/tetrapay):",
  tetraPayStatus: (hasKey: boolean, callbackUrl: string | null) =>
    `💳 **وضعیت TetraPay**\n\n` +
    `🔑 API Key: ${hasKey ? "✅ تنظیم شده" : "❌ تنظیم نشده"}\n` +
    `🌐 Callback URL:\n\`${callbackUrl ?? "تنظیم نشده"}\``,
  setApiKey: "🔑 تنظیم API Key",
  setCallbackUrl: "🌐 تنظیم Callback URL دستی",
  autoDetectCallbackUrl: "🔄 تشخیص خودکار URL",
  callbackUrlAutoSet: (url: string) => `✅ Callback URL بصورت خودکار تنظیم شد:\n\`${url}\``,
  adminForceJoin: "📢 اجبار عضویت",

  // ─── Payment review (admin group) ────────────────────────────────────────────
  paymentReviewMsg: (p: any) =>
    `💳 **درخواست پرداخت جدید**\n\n` +
    `کاربر: \`${p.userId}\`\n` +
    `بسته: ${p.coins} سکه\n` +
    `مبلغ: ${p.price.toLocaleString()} ${p.currency}\n` +
    `روش: ${p.method}\n` +
    `زمان: ${new Date(p.createdAt).toLocaleString("fa-IR")}`,
  approvePayment: "✅ تأیید",
  rejectPayment: "❌ رد",
  paymentAlreadyProcessed: "⚠️ این پرداخت قبلاً پردازش شده است.",

  // ─── Errors / Misc ───────────────────────────────────────────────────────────
  errorGeneral: "❌ خطایی رخ داد. لطفاً دوباره تلاش کنید.",
  errorNotRegistered: "❌ لطفاً ابتدا ثبت‌نام کنید. /start را بزنید.",
  back: "🔙 بازگشت",
  cancel: "❌ لغو",
  confirm: "✅ تأیید",
  yes: "✅ بله",
  no: "❌ خیر",
  enterAmount: "مقدار سکه را وارد کنید:",
  enterUserId: "آیدی عددی کاربر را وارد کنید:",
  enterMessage: "متن پیام را وارد کنید:",
  done: "✅ انجام شد",
};

export type LangKeys = typeof fa;
