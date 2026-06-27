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
  male: "👦 پسر",
  female: "👧 دختر",
  other: "🌈 سایر",

  // ─── Main menu ───────────────────────────────────────────────────────────────
  menuConnect: "🔗 اتصال به کاربر ناشناس",
  menuGroup: "👥 گروه ناشناس",
  menuCreateGroup: "🆕 ساخت گروه ناشناس",
  menuMyLink: "🔗 لینک ناشناس من",
  menuCoins: "💰 سکه‌های من",
  menuHelp: "📋 راهنما و قوانین",
  menuSettings: "⚙️ تنظیمات",
  menuReferral: "🎁 دعوت دوستان",
  menuMagic: "🔮 ناشناس از ما بهترون",

  // ─── Magic sub-menu button labels ────────────────────────────────────────────
  magicBtnBottle:  "🍾 پیام در بطری",
  magicBtnChain:   "🔗 زنجیر احساس",
  magicBtnLetter:  "✉️ نامه به آینده",
  magicBtnFreq:    "📡 فرکانس ناشناس",
  magicBtnHelp:    "📖 راهنما",
  magicSubTitle:   "🔮 ناشناس از ما بهترون\n\nیک ویژگی انتخاب کن:",

  // ─── Matching ────────────────────────────────────────────────────────────────
  selectGenderPref: "با چه جنسیتی می‌خواهید صحبت کنید؟",
  genderPrefFemale: "👧 دختر",
  genderPrefMale: "👦 پسر",
  genderPrefAny: "🎲 شانسی",
  insufficientCoins: "❌ سکه کافی ندارید!\n\n💰 برای اتصال به جنسیت خاص به 1 سکه نیاز دارید.\n\nاز منوی 💰 سکه‌های من سکه بخرید.",
  matchCostGender: "💰 اتصال به جنسیت خاص **۱ سکه** هزینه دارد.\n\nتأیید می‌کنید؟",
  matchCostAny: "⚠️ ۳ اتصال رایگان امروز تموم شد.\n\n💰 این اتصال **۱ سکه** هزینه دارد.\n\nتأیید می‌کنید؟",
  matchFreeAny: (left: number) =>
    left > 0
      ? `✅ این اتصال رایگان است — **${left}** اتصال رایگان دیگر تا آخر امروز دارید.\n\n⏳ در صف انتظار قرار گرفتید!\n\nبرای لغو دکمه زیر را بزنید.`
      : `✅ این اتصال رایگان است — آخرین اتصال رایگان امروز بود.\n\n⏳ در صف انتظار قرار گرفتید!\n\nبرای لغو دکمه زیر را بزنید.`,
  matchConfirmBtn: "✅ تأیید و اتصال",
  matchCancelBtn: "❌ انصراف",
  addedToQueue: "⏳ در صف انتظار قرار گرفتید!\n\nبرای لغو دکمه زیر را بزنید.",
  connected: "🎉 متصل شدید!\n\n⚠️ هویت شما کاملاً محفوظ است.\nمی‌توانید پیام، عکس، ویدیو، صدا و استیکر ارسال کنید.",

  connectedWith: (p: { firstName?: string | null; gender?: string | null; age?: number | null; city?: string | null }) => {
    const name = p.firstName ?? "ناشناس";
    const age  = p.age  ?? "؟";
    const pre  = p.gender === "male"   ? `با آقا **${name}** که سنش **${age}** ساله`
               : p.gender === "female" ? `با خانوم **${name}** که سنش **${age}** ساله`
               : `با دوست **${name}** که سنش **${age}** ساله`;
    const cityPart = p.city ? ` از **${p.city}**` : "";
    return (
      `🧚‍♂️ چت ناشناس ${pre}${cityPart} متصل شدی!\n\n` +
      `⚠️ هویت شما کاملاً محفوظ است.\nمی‌توانید پیام، عکس، ویدیو، صدا و استیکر ارسال کنید.`
    );
  },

  connectedWithMood: (p: { firstName?: string | null; gender?: string | null; age?: number | null; city?: string | null }, mood: string) => {
    const name = p.firstName ?? "ناشناس";
    const age  = p.age  ?? "؟";
    const pre  = p.gender === "male"   ? `با آقا **${name}** که سنش **${age}** ساله`
               : p.gender === "female" ? `با خانوم **${name}** که سنش **${age}** ساله`
               : `با دوست **${name}** که سنش **${age}** ساله`;
    const cityPart = p.city ? ` از **${p.city}**` : "";
    return (
      `🧚‍♂️ فرکانس پیدا شد!\n\n${pre}${cityPart} و امروز ${mood} هست متصل شدی 🌊\n\n` +
      `⚠️ هویت شما کاملاً محفوظ است.\nمی‌توانید پیام، عکس، ویدیو، صدا و استیکر ارسال کنید.`
    );
  },
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
  referralInfo: (code: string, link: string, total: number, coins: number, inviterReward: number, inviteeReward: number) =>
    `🎁 **برنامه دعوت دوستان**\n\n` +
    `کد دعوت شما: \`${code}\`\n` +
    `لینک دعوت:\n${link}\n\n` +
    `👥 تعداد دعوت‌شده‌ها: **${total}** نفر\n` +
    `💰 سکه‌های کسب‌شده: **${coins}** سکه\n\n` +
    `🎉 به ازای هر دعوت موفق:\n` +
    `• شما: **${inviterReward} سکه**\n` +
    (inviteeReward > 0 ? `• دوست شما: **${inviteeReward} سکه هدیه ثبت‌نام**\n` : "") +
    `\nلینک را برای دوستانتان بفرستید!`,
  referralInfoTitle: "🎁 **دعوت دوستان**",
  inviteBtnGetLink: "🔗 دریافت لینک دعوتم",
  inviteBtnStats: "📊 آمار دعوت‌های من",
  referralReward: (n: number) => `🎁 تبریک! ${n} سکه از دعوت دوست شما دریافت کردید.`,
  referralInviteeReward: (n: number) => `🎁 خوش آمدید! ${n} سکه هدیه ثبت‌نام به حساب شما اضافه شد.`,
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

  // ─── Help sections ────────────────────────────────────────────────────────────
  helpMenuTitle: "📋 **راهنما و قوانین**\n\nیک بخش را انتخاب کنید:",
  helpBtnConnect: "🔗 راهنمای اتصال",
  helpBtnGroup: "👥 راهنمای گروه",
  helpBtnLink: "🔗 راهنمای لینک ناشناس",
  helpBtnCoins: "💰 راهنمای سکه‌ها",
  helpBtnRules: "🚫 قوانین و مقررات",
  helpBtnMagic: "🔮 راهنمای ناشناس از ما بهترون",
  helpBtnSupport: "💬 پشتیبانی",
  helpSectionConnect:
    `🔗 **اتصال ناشناس**\n\n` +
    `با کلیک روی "🔗 اتصال به کاربر ناشناس" وارد صف می‌شوید.\n` +
    `به محض پیدا شدن کاربر مناسب، متصل می‌شوید.\n\n` +
    `💡 جنسیت خاص: **1 سکه** | شانسی: **رایگان**\n\n` +
    `پس از اتصال می‌توانید:\n` +
    `• پیام متنی، عکس، ویدیو، صدا و استیکر بفرستید\n` +
    `• کاربر را گزارش یا بلاک کنید\n` +
    `• هر زمان مکالمه را پایان دهید`,
  helpSectionGroup:
    `👥 **گروه ناشناس**\n\n` +
    `به گروه‌های ناشناس چندنفره بپیوندید!\n\n` +
    `📌 **گروه عمومی:** هزینه **1 سکه** — تا 10 نفر\n` +
    `📌 **ساخت گروه اختصاصی:** هزینه دارد\n` +
    `  • نام دلخواه + لینک اختصاصی\n` +
    `  • مدیریت اعضا (اخراج / مسدود)\n` +
    `  • ارتقا تا 2 نفر به ادمین\n` +
    `  • افزایش ظرفیت تا 25 نفر\n\n` +
    `هویت همه اعضا با نام مستعار (#001 و ...) محفوظ است.`,
  helpSectionLink:
    `🔗 **لینک ناشناس**\n\n` +
    `لینک اختصاصی شما برای دریافت پیام ناشناس از هر کسی!\n\n` +
    `📌 **لینک ثابت:** برای همیشه فعال است\n` +
    `📌 **لینک مدت‌دار:** خودتان مدت آن را تعیین کنید\n` +
    `  • ۱ ساعت / ۶ ساعت / ۲۴ ساعت / ۷ روز\n` +
    `  • بعد از انقضا لینک غیرفعال می‌شود\n\n` +
    `از هر پیام می‌توانید پاسخ بدهید یا فرستنده را بلاک کنید.`,
  helpSectionCoins:
    `💰 **سکه‌ها**\n\n` +
    `سکه ارز داخلی ربات است.\n\n` +
    `📋 **هزینه‌ها:**\n` +
    `• اتصال به جنسیت خاص: 1 سکه\n` +
    `• ورود به گروه: 1 سکه\n` +
    `• ساخت گروه: 3 سکه (پیش‌فرض)\n` +
    `• ویژگی‌های ناشناس از ما بهترون: متغیر\n\n` +
    `💡 **کسب سکه رایگان:**\n` +
    `• دعوت دوستان → سکه هدیه\n\n` +
    `🛒 **خرید سکه:** از منوی 💰 سکه‌های من`,
  helpSectionRules:
    `🚫 **قوانین و مقررات**\n\n` +
    `❌ موارد ممنوع:\n` +
    `• محتوای نامناسب، توهین‌آمیز یا جنسی\n` +
    `• تبلیغات و لینک‌های تبلیغاتی\n` +
    `• اطلاعات شخصی دیگران\n` +
    `• آزار و مزاحمت\n` +
    `• کلاهبرداری\n\n` +
    `⚠️ متخلفان پس از اخطار محدود یا مسدود می‌شوند.\n\n` +
    `🛡️ هویت شما در تمام بخش‌ها کاملاً محفوظ است.\n` +
    `می‌توانید کاربران مشکل‌ساز را گزارش یا بلاک کنید.`,
  helpSectionMagic:
    `🔮 **ناشناس از ما بهترون**\n\n` +
    `چهار تجربه منحصربه‌فرد:\n\n` +
    `🍾 **پیام در بطری** — پیامت را رها کن شاید کسی پیدا کند\n` +
    `🔗 **زنجیر احساس** — ۱۰ نفر ناشناس یک داستان می‌سازند\n` +
    `✉️ **نامه به آینده** — نامه‌ای به خودت در آینده بنویس\n` +
    `📡 **فرکانس ناشناس** — با کسی که همین احساس را دارد متصل شو\n\n` +
    `برای راهنمای هر بخش از منو "🔮 ناشناس از ما بهترون" → "📖 راهنما" استفاده کنید.`,
  helpSupportText: (link: string) =>
    `💬 **تماس با پشتیبانی**\n\n` +
    `برای هرگونه سوال، مشکل یا انتقاد با ما در تماس باشید:\n\n` +
    `${link}`,
  helpSupportNotSet: "⚠️ لینک پشتیبانی هنوز توسط ادمین تنظیم نشده.",

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

  // ─── 🔮 ناشناس از ما بهترون ──────────────────────────────────────────────────────────
  magicMenu: (cfg: { bottleCost: number; chainCost: number; letterCost: number; freqCost: number }) =>
    `🔮 **ناشناس از ما بهترون**\n\n` +
    `چهار تجربه منحصربه‌فرد که هیچ‌جا پیدا نمی‌شود:\n\n` +
    `🍾 *پیام در بطری* — ${cfg.bottleCost} سکه\n` +
    `پیامت را به اقیانوس رها کن. شاید کسی پیدایش کند...\n\n` +
    `🔗 *زنجیر احساس* — ${cfg.chainCost} سکه\n` +
    `یک جمله بنویس. ۱۰ نفر ادامه می‌دهند. نتیجه را ببین!\n\n` +
    `✉️ *نامه به آینده* — ${cfg.letterCost} سکه\n` +
    `برای خودت نامه بنویس. ۷ تا ۹۰ روز دیگر دریافت کنی.\n\n` +
    `📡 *فرکانس ناشناس* — ${cfg.freqCost} سکه\n` +
    `احساس خود را انتخاب کن. با کسی که همین حس را دارد متصل شو.`,

  // ─ Confirm (shown before coin deduction) ─
  magicConfirmBottle: (cost: number, daily: number) =>
    `🍾 **پیام در بطری**\n\n` +
    `یک پیام ناشناس می‌نویسی و به اقیانوس رها می‌کنی.\n` +
    `سیستم آن را به یک کاربر تصادفی می‌رساند.\n` +
    `اگر جواب داد → چت ناشناس شروع می‌شود 💬\n\n` +
    `💰 هزینه: **${cost} سکه**\n` +
    `📊 محدودیت روزانه: **${daily} بار**\n\n` +
    `آیا ادامه می‌دهی؟`,
  magicConfirmChain: (cost: number, daily: number) =>
    `🔗 **زنجیر احساس**\n\n` +
    `یک جمله می‌نویسی — اگر زنجیری در انتظار باشد ادامه‌اش می‌دهی، وگرنه یک زنجیر جدید شروع می‌شود!\n` +
    `بعد از ۱۰ نفر، کل زنجیر برای همه ارسال می‌شود 🎉\n\n` +
    `💰 هزینه: **${cost} سکه**\n` +
    `📊 محدودیت روزانه: **${daily} بار**\n\n` +
    `آیا ادامه می‌دهی؟`,
  magicConfirmLetter: (cost: number, daily: number) =>
    `✉️ **نامه به آینده**\n\n` +
    `امروز یک نامه برای خودت می‌نویسی.\n` +
    `زمان تحویل را انتخاب می‌کنی: ۷، ۳۰، ۶۰ یا ۹۰ روز.\n` +
    `دقیقاً در آن روز برایت می‌رسد 📅\n\n` +
    `💰 هزینه: **${cost} سکه**\n` +
    `📊 محدودیت روزانه: **${daily} بار**\n\n` +
    `آیا ادامه می‌دهی؟`,
  magicConfirmFreq: (cost: number, daily: number) =>
    `📡 **فرکانس ناشناس**\n\n` +
    `احساس لحظه‌ات را انتخاب می‌کنی.\n` +
    `با کسی که دقیقاً همین احساس را دارد متصل می‌شوی 🌊\n\n` +
    `💰 هزینه: **${cost} سکه**\n` +
    `📊 محدودیت روزانه: **${daily} بار**\n\n` +
    `آیا ادامه می‌دهی؟`,

  // ─ Help ─
  magicHelpMenu: "📖 **راهنمای ناشناس از ما بهترون**\n\nیک بخش را انتخاب کنید:",
  magicHelpBottle:
    `🍾 **پیام در بطری**\n\n` +
    `یک پیام ناشناس می‌نویسی و به اقیانوس می‌فرستی.\n` +
    `سیستم آن را به یک کاربر تصادفی می‌رساند.\n` +
    `اگر آن کاربر جواب داد → چت ناشناس شروع می‌شود.\n` +
    `اگر در ۲۴ ساعت جوابی نداد → پیام در اقیانوس گم می‌شود 🌊\n\n` +
    `💡 نکته: نه نام، نه عکس، نه هیچ. فقط کلمات.`,
  magicHelpChain:
    `🔗 **زنجیر احساس**\n\n` +
    `تو یک جمله می‌نویسی.\n` +
    `سیستم آن را به ۹ کاربر دیگر می‌رساند.\n` +
    `هر کدام یک جمله اضافه می‌کنند.\n` +
    `بعد از ۱۰ نفر، کل زنجیر برای همه فرستاده می‌شود!\n\n` +
    `💡 نکته: نتیجه همیشه غیرقابل پیش‌بینی است.`,
  magicHelpLetter:
    `✉️ **نامه به آینده**\n\n` +
    `امروز یک نامه برای خودت می‌نویسی.\n` +
    `زمان تحویل را انتخاب می‌کنی: ۷، ۳۰، ۶۰ یا ۹۰ روز.\n` +
    `بات آن را دقیقاً در آن روز برایت می‌فرستد.\n\n` +
    `💡 نکته: خودت تنها کسی هستی که این نامه را می‌خوانی.`,
  magicHelpFreq:
    `📡 **فرکانس ناشناس**\n\n` +
    `احساس لحظه‌ات را انتخاب می‌کنی.\n` +
    `سیستم تو را با کسی که دقیقاً همین احساس را دارد متصل می‌کند.\n` +
    `یک چت ناشناس — کوتاه یا بلند، هر قدر که بخواهید.\n\n` +
    `💡 نکته: وقتی احساسات یکی باشند، حرف‌ها عمیق‌تر می‌شوند.`,

  // ─ Bottle ─
  bottleAskMessage: "🍾 پیامت را برای اقیانوس بنویس:\n\n(حداکثر ۵۰۰ کاراکتر — فقط متن)",
  bottleTooLong: "❌ پیام خیلی طولانی است. حداکثر ۵۰۰ کاراکتر.",
  bottleSent: "🌊 پیامت به اقیانوس فرستاده شد!\n\nشاید کسی پیدایش کند...",
  bottleReceived: (msg: string) =>
    `🍾 **یک پیام از اقیانوس برایت آمد!**\n\n_«${msg}»_\n\nمی‌خواهی پاسخ دهی؟`,
  bottleReplyBtn: "💬 پاسخ دادن",
  bottleIgnoreBtn: "🌊 رها کردن",
  bottleIgnored: "🌊 پیام را رها کردی. باشه!",
  bottleExpiredSender: "🌊 پیامت در اقیانوس گم شد. کسی پیدایش نکرد.",
  bottleReplied: "✅ پاسخت فرستاده شد! چت ناشناس شروع شد.",
  bottleNoFloating: "🌊 الان هیچ پیامی در اقیانوس نیست. بعداً دوباره امتحان کن.",

  // ─ Chain ─
  chainAskFirst: "🔗 **زنجیر احساس**\n\nاولین جمله‌ات را بنویس تا زنجیر شروع شود:",
  chainAskNext: (step: number, prev: string) =>
    `🔗 **زنجیر احساس — مرحله ${step} از ۱۰**\n\n` +
    `آنچه تا الان نوشته شده:\n_${prev}_\n\n` +
    `حالا نوبت توست. جمله بعدی را اضافه کن:`,
  chainSent: "🔗 جمله‌ات به زنجیر اضافه شد! منتظر ۹ نفر دیگر باش...",
  chainComplete: (text: string) =>
    `🎉 **زنجیر احساس کامل شد!**\n\nاین داستانی بود که ۱۰ نفر ناشناس با هم ساختند:\n\n${text}\n\n🌊 یادگاری زیبایی شد!`,
  chainNoChain: "🔗 الان هیچ زنجیری در انتظار نیست. یک زنجیر جدید شروع می‌شود!",

  // ─ Future letter ─
  letterAskDelay: "✉️ **نامه به آینده**\n\nچه موقع می‌خواهی این نامه را دریافت کنی؟",
  letterDelay7:  "📅 ۷ روز دیگر",
  letterDelay30: "📅 ۳۰ روز دیگر",
  letterDelay60: "📅 ۶۰ روز دیگر",
  letterDelay90: "📅 ۹۰ روز دیگر",
  letterAskContent: (days: number) =>
    `✉️ نامه‌ات را بنویس — ${days} روز دیگر دریافت می‌کنی:\n\n(بدون محدودیت متن)`,
  letterSaved: (days: number) =>
    `✅ نامه‌ات ذخیره شد!\n\n📅 دقیقاً **${days} روز دیگر** برایت می‌رسد.\n\nخودت را فراموش نکن 💙`,
  letterDelivered: (msg: string) =>
    `✉️ **نامه‌ای از گذشته‌ات آمد!**\n\n📅 ${new Date().toLocaleDateString("fa-IR")} — از ${new Date().toLocaleDateString("fa-IR")}\n\n_«${msg}»_`,

  // ─ Frequency ─
  freqAskMood: "📡 **فرکانس ناشناس**\n\nالان چه احساسی داری؟\n\nبا کسی که همین فرکانس را دارد متصل می‌شوی:",
  freqSearching: (mood: string) =>
    `📡 در حال جستجو برای کسی با احساس **${mood}**...\n\nمنتظر باش، اگر ۱۰ دقیقه نتیجه‌ای نبود از صف خارج می‌شوی.`,
  freqConnected: (mood: string) =>
    `📡 **فرکانس پیدا شد!**\n\nهر دوی شما احساس **${mood}** دارید.\n\nمکالمه ناشناس شروع شد 🌊`,
  freqTimeout: "📡 متأسفم، کسی با این فرکانس پیدا نشد. بعداً دوباره امتحان کن.",
  freqCancelBtn: "❌ لغو جستجو",
  freqCancelled: "📡 از صف فرکانس خارج شدی.",

  // ─ Common errors ─
  magicDisabled: "❌ این ویژگی در حال حاضر غیرفعال است.",
  magicLimitReached: (limit: number) => `⏳ امروز ${limit} بار از این ویژگی استفاده کردی. فردا دوباره بیا!`,
  magicNotEnoughCoins: (cost: number) => `💰 برای این ویژگی به ${cost} سکه نیاز داری.\n\nاز منوی سکه‌ها بخر!`,

  // ─── Coins sub-menu ──────────────────────────────────────────────────────────
  coinsBtnHistory: "📋 تراکنش‌های من",
  coinsBtnBuy: "🛒 خرید سکه",

  // ─── Magic help sub-menu (reply keyboard — unique labels) ────────────────────
  magicHelpBtnBottle: "🍾 راهنمای بطری",
  magicHelpBtnChain: "🔗 راهنمای زنجیر",
  magicHelpBtnLetter: "✉️ راهنمای نامه",
  magicHelpBtnFreq: "📡 راهنمای فرکانس",
  magicHelpMenuTitle: "📖 **راهنمای ناشناس از ما بهترون**\n\nیک ویژگی را برای توضیحات انتخاب کنید:",

  // ─── Group sub-menu & management ─────────────────────────────────────────────
  groupSubMenuJoin: "👥 پیوستن به گروه ناشناس",
  groupSubMenuMine: "📋 گروه‌های من",
  myGroupsEmpty: "📋 شما هنوز گروهی نساخته‌اید.\n\nبرای ساخت گروه از «🆕 ساخت گروه ناشناس» استفاده کنید.",
  myGroupsTitle: "📋 **گروه‌های من:**\n\n",
  groupNoName: "بدون نام",
  groupInviteLinkBtn: "🔗 لینک دعوت گروه",
  groupAdminPromoteBtn: "⭐ ارتقا به ادمین",
  groupExpandBtn: "⬆️ افزایش ظرفیت به ۲۵ نفر",
  groupAdminPromoteCost: (cost: number) =>
    `⭐ **ارتقا عضو به ادمین گروه**\n\n` +
    `ادمین می‌تواند اعضا را اخراج یا مسدود کند.\n` +
    `حداکثر ۲ ادمین در هر گروه مجاز است.\n\n` +
    `💰 هزینه: **${cost} سکه**\n\nآیا تأیید می‌کنید؟`,
  groupExpandCost: (cost: number, newMax: number) =>
    `⬆️ **افزایش ظرفیت گروه**\n\n` +
    `ظرفیت گروه از 10 به **${newMax}** نفر افزایش می‌یابد.\n\n` +
    `💰 هزینه: **${cost} سکه**\n\nآیا تأیید می‌کنید؟`,
  promotedToAdmin: (alias: string) => `⭐ کاربر ${alias} به ادمین گروه ارتقا یافت.`,
  youWerePromotedAdmin: "⭐ شما به ادمین این گروه ارتقا یافتید!",
  groupExpanded: (max: number) => `✅ ظرفیت گروه به **${max}** نفر افزایش یافت.`,
  groupAdminAlreadyExists: "❌ این کاربر از قبل ادمین است.",
  groupAdminMaxReached: "❌ حداکثر ۲ ادمین در هر گروه مجاز است.",
  groupNotAdmin: "❌ شما ادمین یا سازنده این گروه نیستید.",
  groupAlreadyMaxExpanded: "❌ این گروه قبلاً به حداکثر ظرفیت (۲۵ نفر) ارتقا یافته.",
  createGroupAskName:
    `📝 **نام گروه خود را وارد کنید:**\n\n` +
    `• حداکثر ۳۰ کاراکتر\n` +
    `• این نام به همه اعضا نمایش داده می‌شود\n\n` +
    `برای رد شدن از این مرحله، نقطه «.» بفرستید.`,
  groupNameTooLong: "❌ نام خیلی طولانی است. حداکثر ۳۰ کاراکتر.",
  groupCreatedWithName: (name: string) =>
    `🎉 گروه **«${name}»** ایجاد شد!\n\nمنتظر پیوستن اعضا هستیم...\nشما سازنده این گروه هستید.`,
  groupInfoLine: (name: string, count: number, max: number, link: string) =>
    `📌 **${name}**\n👥 ${count}/${max} عضو\n🔗 ${link}\n`,
  groupSelectForAdmin: "👥 **عضو مورد نظر برای ارتقا به ادمین را انتخاب کنید:**\n\n",

  // ─── My Link sub-menu ─────────────────────────────────────────────────────────
  myLinkBtnPermanent: "🔗 لینک ثابت ناشناس من",
  myLinkBtnTimed: "⏱️ ساخت لینک مدت‌دار",
  myLinkMenuTitle: "🔗 **لینک ناشناس من**\n\nنوع لینک را انتخاب کنید:",

  // ─── Timed anonymous link ─────────────────────────────────────────────────────
  timedLinkTitle: "⏱️ **لینک ناشناس مدت‌دار**\n\nچه مدت این لینک فعال باشد؟",
  timedLink1h: "⏱️ ۱ ساعت",
  timedLink6h: "⏱️ ۶ ساعت",
  timedLink24h: "⏱️ ۲۴ ساعت",
  timedLink7d: "📅 ۷ روز",
  timedLinkCreated: (link: string, expiry: string) =>
    `⏱️ **لینک ناشناس مدت‌دار شما:**\n\n${link}\n\n` +
    `🕐 منقضی می‌شود: ${expiry}\n\n` +
    `این لینک را به هر کسی بدهید تا برایتان پیام ناشناس بفرستد.`,
  timedLinkExpiredOwner: "⏱️ لینک مدت‌دار شما منقضی شد. می‌توانید لینک جدید بسازید.",
  timedLinkInvalid: "⏱️ این لینک منقضی شده یا معتبر نیست.",

  // ─── Admin: magic settings ────────────────────────────────────────────────
  adminMagicPanel: (cfgs: Record<string, { enabled: boolean; cost: number; daily: number }>) =>
    `🔮 **تنظیمات ناشناس از ما بهترون**\n\n` +
    Object.entries(cfgs).map(([k, v]) =>
      `${v.enabled ? "✅" : "❌"} **${k}** — هزینه: ${v.cost} سکه | روزانه: ${v.daily} بار`
    ).join("\n"),
  adminMagicFeaturePanel: (name: string, enabled: boolean, cost: number, daily: number) =>
    `⚙️ **تنظیمات ${name}**\n\n` +
    `وضعیت: ${enabled ? "✅ فعال" : "❌ غیرفعال"}\n` +
    `هزینه: ${cost} سکه\n` +
    `محدودیت روزانه: ${daily} بار`,

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
