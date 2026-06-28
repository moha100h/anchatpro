export const en = {
  // ─── Setup ───────────────────────────────────────────────────────────────────
  welcome: "👋 Welcome to the Anonymous Chat Bot!\n\nPlease select your language:",
  selectGender: "👤 Select your gender:",
  selectAge: "🎂 Enter your age (a number between 13 and 100):",
  selectCity: "🏙️ Enter your city:\n\n(Send a dot «.» to skip this step)",
  invalidAge: "❌ Invalid age! Please enter a number between 13 and 100.",
  profileComplete: "✅ Your profile has been set up successfully!\n\nWelcome to the main menu:",
  signupBonus: (n: number) => `🎁 **${n} bonus coins** added to your account as a welcome gift!`,
  profileUpdated: "✅ Profile updated successfully!",

  // ─── Genders ─────────────────────────────────────────────────────────────────
  male: "👦 Male",
  female: "👧 Female",
  other: "🌈 Other",

  // ─── Main menu ───────────────────────────────────────────────────────────────
  menuConnect: "🔗 Connect Anonymously",
  menuGroup: "👥 Anonymous Group",
  menuCreateGroup: "Create Anonymous Group 🆕",
  menuMyLink: "🔗 My Anonymous Link",
  menuAnonProLink: "💎 Pro Anonymous Link",
  anonProLinkComingSoon: "🔗 **Create Pro Anon Link**\n\n✨ Coming soon...\n\nThis feature will let you create more powerful anonymous links.",
  menuCoins: "💰 My Coins",
  menuHelp: "📋 Help & Rules",
  menuSettings: "⚙️ Settings",
  menuReferral: "🎁 Invite Friends & Earn Coins",
  menuMagic: "🔮 Strangers Like Us",

  // ─── Magic sub-menu button labels ────────────────────────────────────────────
  magicBtnBottle:  "🍾 Message in a Bottle",
  magicBtnChain:   "🔗 Emotion Chain",
  magicBtnLetter:  "✉️ Letter to the Future",
  magicBtnFreq:    "📡 Anonymous Frequency",
  magicBtnHelp:    "📖 Help Guide",
  magicSubTitle:   "🔮 Strangers Like Us\n\nChoose a feature:",

  // ─── Matching ────────────────────────────────────────────────────────────────
  selectGenderPref: "Which gender would you like to talk to?",
  genderPrefFemale: "👧 Female",
  genderPrefMale: "👦 Male",
  genderPrefAny: "🎲 Random",
  genderPrefSameAgeOff: "🎯 Same Age",
  genderPrefSameAgeOn: "✅ Same Age (On)",
  insufficientCoins: "❌ Insufficient coins!\n\n💰 You need 1 coin to connect to a specific gender.\n\nBuy coins from the 💰 My Coins menu.",
  matchCostGender: "💰 Connecting to a specific gender costs **1 coin**.\n\nConfirm?",
  matchCostAny: "⚠️ You've used all 3 free chats today.\n\n💰 This connection costs **1 coin**.\n\nConfirm?",
  matchFreeAny: (left: number) =>
    left > 0
      ? `✅ This connection is free — **${left}** free connection(s) remaining today.\n\n⏳ You've been added to the waiting queue!\n\nPress Cancel to leave the queue.`
      : `✅ This connection is free — last free connection for today.\n\n⏳ You've been added to the waiting queue!\n\nPress Cancel to leave the queue.`,
  matchConfirmBtn: "✅ Confirm & Connect",
  matchCancelBtn: "❌ Cancel",
  addedToQueue: "⏳ You've been added to the waiting queue!\n\nPress Cancel to leave the queue.",
  connected: "🎉 Connected!\n\n⚠️ Your identity is completely protected.\nYou can send messages, photos, videos, voice notes, and stickers.",

  connectedWith: (p: { firstName?: string | null; gender?: string | null; age?: number | null; city?: string | null }) => {
    const name = p.firstName ?? "Anonymous";
    const age  = p.age  ?? "?";
    const pre  = p.gender === "male"   ? `with **Mr. ${name}**, age **${age}**`
               : p.gender === "female" ? `with **Ms. ${name}**, age **${age}**`
               : `with **${name}**, age **${age}**`;
    const cityPart = p.city ? ` from **${p.city}**` : "";
    return (
      `🧚‍♂️ Anonymous chat ${pre}${cityPart} — connected!\n\n` +
      `⚠️ Your identity is completely protected.\nYou can send messages, photos, videos, voice notes, and stickers.`
    );
  },

  connectedWithMood: (p: { firstName?: string | null; gender?: string | null; age?: number | null; city?: string | null }, mood: string) => {
    const name = p.firstName ?? "Anonymous";
    const age  = p.age  ?? "?";
    const pre  = p.gender === "male"   ? `with **Mr. ${name}**, age **${age}**`
               : p.gender === "female" ? `with **Ms. ${name}**, age **${age}**`
               : `with **${name}**, age **${age}**`;
    const cityPart = p.city ? ` from **${p.city}**` : "";
    return (
      `🧚‍♂️ Frequency matched!\n\n${pre}${cityPart} — both feeling ${mood} 🌊\n\n` +
      `⚠️ Your identity is completely protected.\nYou can send messages, photos, videos, voice notes, and stickers.`
    );
  },
  alreadyInQueue: "⏳ You are already in the queue.",
  alreadyInChat: "💬 You are already in a chat.",
  alreadyInGroup: "👥 You are already in a group.",
  chatEnded: "🔴 Chat ended.\n\nUse the main menu to start a new chat.",
  chatEndedByPartner: "🔴 Your partner ended the chat.\n\nUse the main menu to start a new chat.",
  endChat: "🔴 End Chat",
  reportUser: "🚨 Report User",
  blockUser: "🚫 Block User",
  notInChat: "❌ You are not in a chat.",
  queueTimeout: "⏱️ Queue timed out. Please try again.",
  removedFromQueue: "✅ Removed from queue.",
  cancelSearch: "❌ Cancel Search",
  coinsDeducted: (n: number) => `💰 ${n} coin(s) deducted.`,

  // ─── Chat controls ───────────────────────────────────────────────────────────
  chatHeader: "💬 Active Chat",
  partnerIsTyping: "... is typing",
  messageForwarded: "✉️ Message sent",
  cannotSendMedia: "⚠️ This media type is not supported.",

  // ─── Report ──────────────────────────────────────────────────────────────────
  reportReasons: ["Pornography", "Harassment", "Fraud", "Spam", "Inappropriate Content", "Other"],
  selectReportReason: "🚨 Select a reason for reporting:",
  reportSent: "✅ Report submitted successfully. Thank you for keeping us safe.",
  alreadyReported: "⚠️ You have already reported this user.",

  // ─── Block ───────────────────────────────────────────────────────────────────
  blockReasons: ["Pornography", "Harassment", "Spam", "Disturbance", "Other"],
  selectBlockReason: "🚫 Select a reason for blocking:",
  userBlocked: "🚫 User blocked.",
  alreadyBlocked: "⚠️ This user is already blocked.",

  // ─── Group chat ──────────────────────────────────────────────────────────────
  joinGroup: "👥 Join Anonymous Group",
  groupJoined: "🎉 Joined anonymous group!\n\n👥 Members: {count}\nYou can chat with everyone.",
  groupMessage: (id: string) => `[Group] User ${id}:\n`,
  leaveGroup: "🚪 Leave Group",
  groupLeft: "✅ Left the group.",
  groupEnded: "🔴 Group has been dissolved.",
  groupCostInfo: "💰 Joining a group costs 1 coin.",
  noGroupAvailable: "❌ No group available. A new group was created, please wait.",
  newGroupCreated: "🆕 New group created! Waiting for more members...",
  memberJoined: (id: string, count: number) => `👥 User ${id} joined the group. (${count} members)`,
  memberLeft: (id: string, count: number) => `🚪 User ${id} left the group. (${count} members)`,

  // ─── Group creation (paid) ────────────────────────────────────────────────
  createGroupInfo: (cost: number) =>
    `🆕 **Create Anonymous Group**\n\n` +
    `💰 Cost: **${cost} coins**\n\n` +
    `As the creator, you can kick or ban members from your group.\n\n` +
    `Confirm?`,
  groupCreatedSuccess: "🎉 Your anonymous group has been created!\n\nWaiting for members to join...\nYou are the group creator.",
  manageMembers: "👥 Manage Members",
  memberListTitle: "👥 **Current Group Members:**\n\n",
  noMembersToManage: "❌ No members to manage.",
  kickBtn: "🚫 Kick",
  banBtn: "🔨 Ban",
  youWereKicked: "🚫 You were kicked from the group by the creator.",
  youWereBanned: "🔨 You were banned from this group by the creator and cannot rejoin.",
  memberKickedNotif: (alias: string) => `✅ User ${alias} has been kicked from the group.`,
  memberBannedNotif: (alias: string) => `✅ User ${alias} has been banned from the group.`,
  notGroupCreator: "❌ You are not the group creator.",
  cannotKickCreator: "❌ You cannot kick the group creator.",
  groupActiveNotif: (count: number) => `🎉 Your group is now active! **${count}** members.`,

  // ─── Anonymous link ──────────────────────────────────────────────────────────
  myLink: "🔗 Your Anonymous Link:",
  linkInfo: "Anyone can send you anonymous messages through this link.",
  anonMsgReceived: "📩 New anonymous message:",
  replyAnon: "↩️ Reply Anonymously",
  replyPrompt: "Enter your reply:",
  replySent: "✅ Reply sent.",
  yourReply: "📤 Reply received:",
  sendAnonMsg: (name: string) => `📨 You are sending an anonymous message to **${name}**.\n\nWrite your message:`,
  anonCancelSendBtn: (name: string) => `❌ Cancel sending to ${name}`,
  anonCancelledSend: "✅ Message sending cancelled.",
  anonMsgSent: "✅ Your anonymous message has been sent.",
  blockSender: "🚫 Block Sender",
  reportSender: "🚨 Report Sender",
  anonLinkDisabledForSender: "❌ This link has been disabled by its owner.",
  anonLinkBuyConfirm: (cost: number) =>
    `🔗 **Permanent Anonymous Link**\n\nWith this link, anyone can send you anonymous messages.\n\n💰 Cost: **${cost} coins** (one-time, lifetime)\n\nConfirm?`,
  anonLinkActive: (link: string) =>
    `🔗 **Your Permanent Anonymous Link:**\n\n<code>${link}</code>\n\nShare this link so others can send you anonymous messages.`,
  anonLinkToggleOnBtn: "✅ Enable Link",
  anonLinkToggleOffBtn: "❌ Disable Link",
  anonLinkNowEnabled: "✅ Your anonymous link is now enabled.",
  anonLinkNowDisabled: "❌ Your anonymous link is disabled. Others cannot send you messages.",
  timedLinkBuyConfirm: (cost: number) =>
    `⏱️ **Timed Anonymous Link**\n\n💰 Cost: **${cost} coins**\n\nChoose link duration:`,
  timedLinkBuyTitle: (cost: number) => `⏱️ **Create Timed Link** — Cost: **${cost} coins**\n\nHow long should the link stay active?`,

  // ─── Coins ───────────────────────────────────────────────────────────────────
  coinsBalance: (n: number) => `💰 Your balance: **${n} coins**`,
  buyCoins: "🛒 Buy Coins",
  coinHistory: "📋 Coin History",
  selectPackage: "📦 Select a package:",
  packageInfo: (coins: number, price: number, currency: string) =>
    `💰 ${coins} coins — ${price.toLocaleString()} ${currency}`,
  selectPaymentMethod: "💳 Select a payment method:",
  payByCard: "💳 Pay by Card",
  payByCrypto: "₿ Pay by Crypto",
  payByGateway: "🌐 Online Gateway (TetraPay)",
  cardPaymentInfo: (cardNo: string, amount: number) =>
    `💳 **Card Payment**\n\n` +
    `Card Number:\n\`${cardNo}\`\n\n` +
    `Amount: **${amount.toLocaleString()} Toman**\n\n` +
    `⚠️ After payment, upload your receipt (screenshot) in this chat.`,
  cryptoPaymentInfo: (wallet: string, amount: string) =>
    `₿ **Crypto Payment (USDT TRC20)**\n\n` +
    `Wallet Address:\n\`${wallet}\`\n\n` +
    `Amount: **${amount}**\n\n` +
    `🌐 Network: **TRON (TRC20)**\n\n` +
    `⚠️ After sending, upload your receipt (transaction screenshot) in this chat.`,
  cryptoPaymentLinkBtn: "🔗 Open in Trust Wallet",
  gatewayPaymentInfo: (amount: number) =>
    `🌐 **Online Payment (TetraPay)**\n\n` +
    `Amount: **${amount.toLocaleString()} Toman**\n\n` +
    `Click one of the buttons below to complete your payment.\n` +
    `Coins will be credited automatically after payment.`,
  openPaymentBot: "🤖 Pay via Bot",
  openPaymentWeb: "🌐 Pay via Browser",
  gatewayCreating: "⏳ Creating payment link...",
  gatewayError: (msg: string) => `❌ Gateway error:\n${msg}`,
  uploadReceipt: "📷 Upload your payment receipt:",
  receiptSubmitted: "✅ Your receipt has been submitted for review.\n\nYou will be notified once the admin reviews it.",
  paymentCancelled: "❌ Payment cancelled.",
  paymentApproved: (coins: number) => `✅ Payment approved!\n\n💰 **${coins} coins** added to your account.`,
  paymentRejected: "❌ Your payment was rejected. Please contact support for more information.",
  gatewayUnavailable: "⚠️ Online gateway is currently unavailable.",
  paymentMethodDisabled: "⚠️ This payment method is currently disabled.",

  // ─── Referral ────────────────────────────────────────────────────────────────
  referralInfoTitle: "🎁 **Invite Friends & Earn Free Coins**\n\nShare your unique link with friends and earn coins for every signup!\n\n👤 Get your invite link ready to share instantly.\n📊 Track your referral stats anytime.",
  inviteBtnGetLink: "🔗 Invite Link + Share Banner",
  inviteBtnStats: "📊 My Detailed Referral Stats",
  inviteBtnLeaderboard: "🏆 Top Users",
  inviteBtnGiftCode: "🎟️ Gift Code",

  // ─── Gift Codes ───────────────────────────────────────────────────────────────
  giftCodePrompt: "🎟️ **Enter your gift code:**\n\n_(Type the code exactly — case doesn't matter)_",
  giftCodeSuccess: (n: number) =>
    `🎁 **Gift code accepted!**\n\n✅ **${n} coins** added to your account.`,
  giftCodeInvalid: "❌ **Invalid gift code.**\n\nPlease double-check the code and try again.",
  giftCodeExpired: "❌ **This gift code is fully redeemed or expired.**",
  giftCodeAlreadyUsed: "❌ **You have already used this gift code.**\n\nEach code can only be used once per account.",
  giftCodeCancelled: "❌ Gift code entry cancelled.",

  // ─── Leaderboard ─────────────────────────────────────────────────────────────
  leaderboardEmpty: "🏆 **Top Users**\n\nNo successful referrals yet.\n\nBe the first to invite friends!",
  leaderboardTitle: (updatedMins: number) =>
    `🏆 **Top Referrers**\n` +
    `_(Updated every 3 hours — ${updatedMins} min ago)_\n\n`,
  leaderboardRow: (rank: number, name: string, count: number) =>
    `${rank <= 3 ? ["🥇","🥈","🥉"][rank-1] : `${rank}.`} **${name}** — ${count} referrals\n`,
  leaderboardFooter: "\n_Names are anonymized to protect privacy._",
  referralStats: (total: number, successful: number, pending: number, coins: number, inviterReward: number, inviteeReward: number) =>
    `📊 **My Referral Stats**\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `👥 Total referrals: **${total}**\n` +
    `✅ Successful (setup complete): **${successful}**\n` +
    `⏳ Pending (setup incomplete): **${pending}**\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `💰 Total coins earned: **${coins} coins**\n\n` +
    `🎁 Reward per successful referral:\n` +
    `• You: **${inviterReward} coins**\n` +
    (inviteeReward > 0 ? `• Your friend: **${inviteeReward} welcome coins**\n` : "") +
    `\n_Only users who complete setup count as successful referrals._`,
  referralLinkMsg: (link: string) =>
    `🔗 <b>Your personal invite link:</b>\n\n` +
    `<a href="${link}">👆 Tap here to join instantly</a>\n\n` +
    `Or copy the link below:\n<code>${link}</code>\n\n` +
    `─────────────────\n` +
    `Ready-to-forward banner 👇`,
  alreadyMember: "✅ You're already a member! Welcome back to the main menu.",
  alreadyJoinedVia: (name: string) => `✅ You already joined via <b>${name}</b>'s invite link.`,
  referralBanner: (link: string, inviterReward: number, inviteeReward: number, botUsername: string) =>
    `🌟 <b>Anonymous Chat Bot — @${botUsername}</b>\n\n` +
    `A different kind of social app:\n\n` +
    `💬 Chat anonymously with interesting strangers\n` +
    `📩 Send anonymous messages, stay unknown\n` +
    `👥 Create anonymous groups\n` +
    `🍾 Send a message in a bottle to the World of Secrets\n` +
    `🔗 Build an emotion chain with 10 strangers\n` +
    `✉️ Write a letter to your future self\n` +
    `📡 Match with someone on the same vibe\n\n` +
    `━━━━━━━━━━━━━━━━━━━━━\n` +
    `🎁 <b>Join via this link and get ${inviteeReward > 0 ? `${inviteeReward} free coins` : "free coins"} as a gift!</b>\n\n` +
    `<a href="${link}">👉 Tap here to join now</a>`,
  referralInfo: (code: string, link: string, total: number, coins: number, inviterReward: number, inviteeReward: number) =>
    `🎁 **Invite Friends**\n\nCode: \`${code}\`\n\n` +
    `👥 Referrals: **${total}**  |  💰 Coins: **${coins}**\n\n` +
    `🎉 Per referral: You **${inviterReward} coins**` +
    (inviteeReward > 0 ? ` + Friend **${inviteeReward} coins**` : ""),
  referralReward: (n: number) => `🎁 Congratulations! You received **${n} coins** from your referral!`,
  referralInviteeReward: (n: number) => `🎁 Welcome! **${n} bonus coins** have been added to your account.`,
  referralWelcome: (name: string) => `👋 Hello! You joined via **${name}**'s invite.\n\nComplete your setup to unlock coins for both of you! 🎁`,

  // ─── Settings ────────────────────────────────────────────────────────────────
  settingsMenu: "⚙️ Profile Settings:",
  changeGender: "👤 Change Gender",
  changeAge: "🎂 Change Age",
  changeLanguage: "🌐 Change Language",
  changeCity: "🏙️ Change City",
  currentProfile: (gender: string, age: number, city?: string | null) =>
    `👤 Gender: **${gender}**\n🎂 Age: **${age}**` + (city ? `\n🏙️ City: **${city}**` : ""),
  cancelledAction: "❌ Action cancelled.",

  // ─── Force Join ───────────────────────────────────────────────────────────────
  forceJoinEnabled: "✅ Force join enabled.",
  forceJoinDisabled: "✅ Force join disabled.",
  forceJoinChannelSet: (ch: string) => `✅ Force join channel set to «${ch}».`,
  forceJoinStatus: (enabled: boolean, channel: string | null) =>
    `📢 **Force Join Settings**\n\n` +
    `Status: ${enabled ? "✅ Enabled" : "❌ Disabled"}\n` +
    `Channel: ${channel ?? "Not set"}`,
  forceJoinEnterChannel: "Enter the channel address (e.g. @mychannel):",
  toggleForceJoin: "🔄 Toggle Force Join",
  setForceJoinChannel: "📢 Set Channel",

  // ─── Help sections ────────────────────────────────────────────────────────────
  helpMenuTitle: "📋 **Help & Rules**\n\nChoose a section:",
  helpBtnConnect: "🔗 Connect Guide",
  helpBtnGroup: "👥 Group Guide",
  helpBtnLink: "🔗 Anonymous Link Guide",
  helpBtnProLink: "💎 Pro Link Guide",
  helpBtnCoins: "💰 Coins Guide",
  helpBtnRules: "🚫 Rules & Regulations",
  helpBtnMagic: "🔮 Strangers Like Us Guide",
  helpBtnSupport: "💬 Support",
  helpSectionGroup:
    `👥 **Anonymous Group**\n\n` +
    `Join multi-person anonymous groups!\n\n` +
    `📌 **Public Group:** **1 coin** — up to 10 members\n` +
    `📌 **Create Private Group:** costs more\n` +
    `  • Custom name + invite link\n` +
    `  • Manage members (kick / ban)\n` +
    `  • Promote up to 2 admins\n` +
    `  • Expand capacity to 25 members\n\n` +
    `All members remain anonymous via aliases (#001, etc.).`,
  helpSectionLink:
    `🔗 **Anonymous Link**\n\n` +
    `Your unique link for receiving anonymous messages from anyone!\n\n` +
    `📌 **Permanent Link:** active forever\n` +
    `📌 **Timed Link:** set your own expiry\n` +
    `  • 1h / 6h / 24h / 7 days\n` +
    `  • Link deactivates after expiry\n\n` +
    `You can reply or block senders from each message.`,
  helpSectionCoins:
    `💰 **Coins**\n\n` +
    `Coins are the bot's internal currency.\n\n` +
    `📋 **Costs:**\n` +
    `• Connect to specific gender: 1 coin\n` +
    `• Join group: 1 coin\n` +
    `• Create group: 3 coins (default)\n` +
    `• Strangers Like Us features: varies\n\n` +
    `💡 **Earn free coins:**\n` +
    `• Invite friends → bonus coins\n\n` +
    `🛒 **Buy coins:** from 💰 My Coins menu`,
  helpSectionRules:
    `🚫 **Rules & Regulations**\n\n` +
    `❌ Prohibited:\n` +
    `• Inappropriate, offensive or sexual content\n` +
    `• Advertising and spam links\n` +
    `• Others' personal information\n` +
    `• Harassment and abuse\n` +
    `• Fraud\n\n` +
    `⚠️ Violations result in warnings, restrictions or bans.\n\n` +
    `🛡️ Your identity is fully protected at all times.\n` +
    `You can report or block problematic users.`,
  helpSectionMagic:
    `🔮 **Strangers Like Us**\n\n` +
    `Four unique experiences:\n\n` +
    `🍾 **Message in a Bottle** — release a message, maybe someone finds it\n` +
    `🔗 **Emotion Chain** — 10 anonymous people build a story together\n` +
    `✉️ **Letter to the Future** — write a letter to yourself in the future\n` +
    `📡 **Anonymous Frequency** — connect with someone feeling the same\n\n` +
    `For feature guides, go to 🔮 Strangers Like Us → 📖 Help Guide.`,
  helpSectionProLink:
    `💎 **Pro Anonymous Link**\n\n` +
    `The most powerful way to receive anonymous messages!\n\n` +
    `🔷 **Permanent Pro Link:**\n` +
    `  • Buy once, own forever\n` +
    `  • Custom display name + welcome message\n` +
    `  • Full message stats\n\n` +
    `⚡ **In-App Link:**\n` +
    `  • Active for 1 hour to 7 days\n` +
    `  • Reveal sender identity (costs coins)\n` +
    `  • Anonymous replies to messages\n\n` +
    `📬 **Pro Inbox:**\n` +
    `  • Full message history\n` +
    `  • Enable/disable your link anytime\n` +
    `  • Manage all your links in one place`,
  helpSectionConnect:
    `🔗 **Anonymous Connect**\n\n` +
    `Click "🔗 Connect Anonymously" to enter the queue.\n` +
    `You'll be connected as soon as a suitable user is found.\n\n` +
    `💡 **Costs:**\n` +
    `• Specific gender: **1 coin**\n` +
    `• Random: 3 free daily (then: 1 coin)\n\n` +
    `🎯 **Same Age button:**\n` +
    `When enabled, the system tries to find a user your age.\n` +
    `If none found, you'll be connected to the closest match.\n\n` +
    `After connecting you can:\n` +
    `• Send text, photos, videos, voice and stickers\n` +
    `• Report or block the user\n` +
    `• End the chat at any time`,
  helpSupportTitle: "💬 **Support**",
  helpSupportBtnLabel: "📩 Message Support",
  helpSupportNotSet: "⚠️ Support link has not been configured by the admin yet.",
  proInboxDailyReminder: (n: number) =>
    `💎 **${n} unread Pro anonymous message(s)** are waiting in your Pro inbox!\n\n` +
    `Go to «💎 Pro Anonymous Link» to read them.`,

  // ─── Safety ──────────────────────────────────────────────────────────────────
  warningIssued: (n: number) =>
    `⚠️ Warning ${n} of 3 issued.\nRepeated violations will result in account restriction.`,
  userRestricted: "🚫 Your account has been restricted for 24 hours.",
  userBanned: "🔨 Your account has been banned. Contact support to appeal.",
  messageBlocked: "⚠️ Your message contains inappropriate content and was not sent.",
  rateLimitExceeded: "⏱️ You are sending too many messages. Please slow down.",

  // ─── Admin ───────────────────────────────────────────────────────────────────
  adminWelcome: "👑 Admin Panel",
  adminStats: (stats: any) =>
    `📊 **Statistics**\n\n` +
    `👥 Total Users: ${stats.totalUsers}\n` +
    `🟢 Active Users (7d): ${stats.activeUsers}\n` +
    `💬 Total Chats: ${stats.totalChats}\n` +
    `💰 Total Transactions: ${stats.totalTransactions}\n` +
    `📋 Pending Reports: ${stats.pendingReports}`,
  adminNotFound: "❌ User not found.",
  adminUserInfo: (u: any) =>
    `👤 **User Info**\n\n` +
    `ID: \`${u.telegramId}\`\n` +
    `Name: ${u.firstName}\n` +
    `Gender: ${u.gender ?? "—"}\n` +
    `Age: ${u.age ?? "—"}\n` +
    `🏙️ City: ${u.city ?? "—"}\n` +
    `💰 Coins: ${u.coins}\n` +
    `📅 Joined: ${new Date(u.createdAt).toLocaleDateString()}\n` +
    `Status: ${u.status}`,
  adminCoinsAdded: (n: number, uid: number) => `✅ Added ${n} coins to user ${uid}.`,
  adminCoinsRemoved: (n: number, uid: number) => `✅ Removed ${n} coins from user ${uid}.`,
  adminUserBanned: (uid: number) => `🔨 User ${uid} has been banned.`,
  adminUserUnbanned: (uid: number) => `✅ User ${uid} has been unbanned.`,
  adminBroadcastSent: (n: number) => `✅ Message sent to ${n} users.`,
  adminCannotBanOwner: "🛡️ The bot owner cannot be banned.",
  backupSent: "✅ Backup sent successfully.",
  backupFailed: "❌ Backup failed.",
  backupConfigured: "✅ Backup settings saved.",

  // ─── Admin: sub-admin management ─────────────────────────────────────────────
  adminManageAdmins: "👤 Manage Admins",
  adminWelcomeMsg: "📝 Welcome Message",
  addSubAdmin: "➕ Add Admin",
  removeSubAdmin: "➖ Remove Admin",
  currentSubAdmins: "👥 **Current Sub-Admins:**\n",
  noSubAdmins: "❌ No sub-admins configured.",
  adminLevelAdmin: "Full Admin",
  adminLevelModerator: "Moderator",
  enterAdminId: "Enter the admin's numeric Telegram ID:",
  selectAdminLevel: "Select the access level:",
  adminAdded: (id: number, level: string) => `✅ Admin ${id} added with level "${level}".`,
  adminRemoved: (id: number) => `✅ Admin ${id} removed.`,
  adminAlreadyExists: "⚠️ This user is already an admin.",
  setWelcomeMsgPrompt: "📝 Enter the new welcome message:\n\n(Send 0 to clear the message)",
  welcomeMsgSet: "✅ Welcome message saved.",
  welcomeMsgCleared: "✅ Welcome message cleared.",
  currentWelcomeMsg: (msg: string) => `📝 **Current Welcome Message:**\n\n${msg}`,
  noWelcomeMsg: "📝 No welcome message configured.",

  // ─── Admin: TetraPay + Force Join settings ────────────────────────────────────
  adminTetraPay: "💳 TetraPay Settings",
  tetraPayApiKeySet: "✅ TetraPay API key saved.",
  tetraPayCallbackSet: "✅ TetraPay callback URL saved.",
  enterTetraPayApiKey: "🔑 Enter your TetraPay API key:",
  enterTetraPayCallback: "🌐 Enter the TetraPay callback URL (e.g. https://yourdomain.com/webhook/tetrapay):",
  tetraPayStatus: (hasKey: boolean, callbackUrl: string | null) =>
    `💳 **TetraPay Status**\n\n` +
    `🔑 API Key: ${hasKey ? "✅ Set" : "❌ Not set"}\n` +
    `🌐 Callback URL:\n\`${callbackUrl ?? "Not set"}\``,
  setApiKey: "🔑 Set API Key",
  setCallbackUrl: "🌐 Set Callback URL (manual)",
  autoDetectCallbackUrl: "🔄 Auto-detect URL",
  callbackUrlAutoSet: (url: string) => `✅ Callback URL auto-set:\n\`${url}\``,
  adminForceJoin: "📢 Force Join",

  // ─── Payment review (admin group) ────────────────────────────────────────────
  paymentReviewMsg: (p: any) =>
    `💳 **New Payment Request**\n\n` +
    `User: \`${p.userId}\`\n` +
    `Package: ${p.coins} coins\n` +
    `Amount: ${p.price.toLocaleString()} ${p.currency}\n` +
    `Method: ${p.method}\n` +
    `Time: ${new Date(p.createdAt).toLocaleString()}`,
  approvePayment: "✅ Approve",
  rejectPayment: "❌ Reject",
  paymentAlreadyProcessed: "⚠️ This payment has already been processed.",

  // ─── 🔮 Strangers Like Us ────────────────────────────────────────────────────────
  magicMenu: (cfg: { bottleCost: number; chainCost: number; letterCost: number; freqCost: number }) =>
    `🔮 **Strangers Like Us**\n\n` +
    `Four unique experiences found nowhere else:\n\n` +
    `🍾 *Message in a Bottle* — ${cfg.bottleCost} coins\n` +
    `Release your message into the World of Secrets. Maybe someone finds it...\n\n` +
    `🔗 *Emotion Chain* — ${cfg.chainCost} coins\n` +
    `Write a sentence. 10 people continue it. See the result!\n\n` +
    `✉️ *Letter to the Future* — ${cfg.letterCost} coins\n` +
    `Write yourself a letter. Receive it in 7–90 days.\n\n` +
    `📡 *Anonymous Frequency* — ${cfg.freqCost} coins\n` +
    `Choose your mood. Connect with someone who feels the same.`,
  // ─ Confirm (shown before coin deduction) ─
  magicConfirmBottle: (cost: number, daily: number) =>
    `🍾 **Message in a Bottle**\n\n` +
    `Write an anonymous message and release it into the World of Secrets.\n` +
    `The system delivers it to a random user.\n` +
    `If they reply → anonymous chat begins 💬\n\n` +
    `💰 Cost: **${cost} coins**\n` +
    `📊 Daily limit: **${daily} times**\n\n` +
    `Ready to continue?`,
  magicConfirmChain: (cost: number, daily: number) =>
    `🔗 **Emotion Chain**\n\n` +
    `Write one sentence — if a chain is waiting you'll continue it, otherwise a new chain starts!\n` +
    `After 10 people, the full chain is sent to everyone 🎉\n\n` +
    `💰 Cost: **${cost} coins**\n` +
    `📊 Daily limit: **${daily} times**\n\n` +
    `Ready to continue?`,
  magicConfirmLetter: (cost: number, daily: number) =>
    `✉️ **Letter to the Future**\n\n` +
    `Write a letter to yourself today.\n` +
    `Choose a delivery time: 7, 30, 60, or 90 days.\n` +
    `It arrives exactly on that day 📅\n\n` +
    `💰 Cost: **${cost} coins**\n` +
    `📊 Daily limit: **${daily} times**\n\n` +
    `Ready to continue?`,
  magicConfirmFreq: (cost: number, daily: number) =>
    `📡 **Anonymous Frequency**\n\n` +
    `Choose your current feeling.\n` +
    `You'll be connected with someone feeling exactly the same 🌊\n\n` +
    `💰 Cost: **${cost} coins**\n` +
    `📊 Daily limit: **${daily} times**\n\n` +
    `Ready to continue?`,

  magicHelpMenu: "📖 **Ocean of Emotions Help**\n\nChoose a section:",
  magicHelpBottle:
    `🍾 **Message in a Bottle**\n\n` +
    `Write an anonymous message and release it into the World of Secrets.\n` +
    `The system delivers it to a random user.\n` +
    `If they reply → anonymous chat begins.\n` +
    `If no reply in 24h → message is lost in the World of Secrets 🌊\n\n` +
    `💡 Tip: No name, no photo. Just words.`,
  magicHelpChain:
    `🔗 **Emotion Chain**\n\n` +
    `You write one sentence.\n` +
    `The system passes it to 9 other users.\n` +
    `Each adds their own sentence.\n` +
    `After 10 people, the full chain is sent to everyone!\n\n` +
    `💡 Tip: The result is always unpredictable.`,
  magicHelpLetter:
    `✉️ **Letter to the Future**\n\n` +
    `Write a letter to yourself today.\n` +
    `Choose delivery time: 7, 30, 60, or 90 days.\n` +
    `The bot sends it exactly on that day.\n\n` +
    `💡 Tip: Only you will ever read this letter.`,
  magicHelpFreq:
    `📡 **Anonymous Frequency**\n\n` +
    `Choose your current feeling.\n` +
    `The system connects you with someone who feels exactly the same.\n` +
    `Anonymous chat — as short or long as you like.\n\n` +
    `💡 Tip: Shared feelings lead to deeper conversations.`,
  bottleAskMessage: "🍾 Write your message for the World of Secrets:\n\n(max 500 characters — text only)",
  bottleTooLong: "❌ Message too long. Max 500 characters.",
  bottleSent: "🌊 Your message was released into the World of Secrets!\n\nMaybe someone finds it...",
  bottleReceived: (msg: string) => `🍾 **A message from the World of Secrets arrived!**\n\n_«${msg}»_\n\nWant to reply?`,
  bottleReplyBtn: "💬 Reply",
  bottleIgnoreBtn: "🌊 Release",
  bottleIgnored: "🌊 You released the bottle. That's okay!",
  bottleExpiredSender: "🌊 Your message was lost in the World of Secrets. No one found it.",
  bottleReplied: "✅ Reply sent! Anonymous chat started.",
  bottleNoFloating: "🌊 No messages in the World of Secrets right now. Check back later.",
  chainAskFirst: "🔗 **Emotion Chain**\n\nWrite the first sentence to start the chain:",
  chainAskNext: (step: number, prev: string) =>
    `🔗 **Emotion Chain — Step ${step} of 10**\n\nWritten so far:\n_${prev}_\n\nYour turn. Add the next sentence:`,
  chainSent: (remaining: number) =>
    `🔗 Your sentence was added to the chain! Wait for ${remaining} more people...`,
  chainComplete: (text: string) => `🎉 **Emotion Chain complete!**\n\nThis story was built by 10 anonymous people:\n\n${text}\n\n🌊 Beautiful!`,
  chainNoChain: "🔗 No chain waiting right now. Starting a new one!",
  letterAskDelay: "✉️ **Letter to the Future**\n\nWhen would you like to receive this letter?",
  letterDelay7:  "📅 In 7 days",
  letterDelay30: "📅 In 30 days",
  letterDelay60: "📅 In 60 days",
  letterDelay90: "📅 In 90 days",
  letterAskContent: (days: number) => `✉️ Write your letter — you'll receive it in ${days} days:\n\n(no length limit)`,
  letterSaved: (days: number) => `✅ Letter saved!\n\n📅 You'll receive it in exactly **${days} days**.\n\nDon't forget yourself 💙`,
  letterDelivered: (msg: string) => `✉️ **A letter from your past arrived!**\n\n_«${msg}»_`,
  freqAskMood: "📡 **Anonymous Frequency**\n\nHow are you feeling right now?\n\nYou'll be connected with someone on the same wavelength:",
  freqSearching: (mood: string) => `📡 Searching for someone feeling **${mood}**...\n\nIf no match is found within 10 minutes, you'll be removed from the queue.`,
  freqConnected: (mood: string) => `📡 **Frequency matched!**\n\nYou both feel **${mood}**.\n\nAnonymous chat started 🌊`,
  freqTimeout: "📡 Sorry, no one with that frequency was found. Try again later.",
  freqCancelBtn: "❌ Cancel search",
  freqCancelled: "📡 You left the frequency queue.",
  magicDisabled: "❌ This feature is currently disabled.",
  magicLimitReached: (limit: number) => `⏳ You've used this feature ${limit} times today. Come back tomorrow!`,
  magicNotEnoughCoins: (cost: number) => `💰 You need ${cost} coins for this feature.\n\nBuy coins from the menu!`,
  adminMagicPanel: (cfgs: Record<string, { enabled: boolean; cost: number; daily: number }>) =>
    `🔮 **Strangers Like Us Settings**\n\n` +
    Object.entries(cfgs).map(([k, v]) =>
      `${v.enabled ? "✅" : "❌"} **${k}** — Cost: ${v.cost} coins | Daily: ${v.daily}`
    ).join("\n"),
  adminMagicFeaturePanel: (name: string, enabled: boolean, cost: number, daily: number) =>
    `⚙️ **${name} Settings**\n\nStatus: ${enabled ? "✅ Enabled" : "❌ Disabled"}\nCost: ${cost} coins\nDaily limit: ${daily} times`,

  // ─── Coins sub-menu ──────────────────────────────────────────────────────────
  coinsBtnHistory: "📋 My Transactions",
  coinsBtnBuy: "🛒 Buy Coins",

  // ─── Magic help sub-menu ─────────────────────────────────────────────────────
  magicHelpBtnBottle: "🍾 Bottle Guide",
  magicHelpBtnChain: "🔗 Chain Guide",
  magicHelpBtnLetter: "✉️ Letter Guide",
  magicHelpBtnFreq: "📡 Frequency Guide",
  magicHelpMenuTitle: "📖 **Strangers Like Us Help**\n\nChoose a feature for its guide:",

  // ─── Group sub-menu & management ─────────────────────────────────────────────
  groupSubMenuJoin: "👥 Join Anonymous Groups",
  groupJoinOnlyViaLink: "🔗 **Join a Group**\n\nYou can only join groups via an invite link.\n\nAsk the group creator to send you their invite link.",
  groupLimitGoToMyGroups: "📋 View My Groups",
  groupSubMenuMine: "📋 My Groups",
  groupMyGroupsCreated: "🏗️ Groups I Created",
  groupMyGroupsJoined: "👤 Groups I Joined",
  myGroupsEmpty: "📋 You haven't created any groups yet.\n\nUse «🆕 Create Anonymous Group» to create one.",
  myGroupsTitle: "📋 **My Groups:**\n\n",
  myGroupsCreatedTitle: "🏗️ **Groups I Created:**\n\n",
  myGroupsJoinedTitle: "👤 **Groups I Joined:**\n\n",
  myGroupsCreatedEmpty: "🏗️ You haven't created any groups yet.\n\nUse «Create Anonymous Group 🆕» to create one.",
  myGroupsJoinedEmpty: "👤 You haven't joined any groups yet.\n\nUse «👥 Join Anonymous Groups» to join one.",
  groupInfoLineJoined: (name: string, count: number, max: number, role: string) =>
    `📌 **${name}**\n👥 ${count}/${max} members | Role: ${role}\n`,
  groupJoinCostInfo: (cost: number) =>
    `👥 **Join Anonymous Group**\n\n💰 Cost: **${cost} coins**\n\nYou'll be matched with an anonymous group.\n\nConfirm?`,
  groupLimitCreatedReached: (max: number, cost: number) =>
    `⚠️ **Group Limit**\n\nYou've reached the maximum of **${max} created groups**.\n\nLeave one of your groups, or pay **${cost} coins** to expand your limit to 10.`,
  groupLimitJoinedReached: (max: number, cost: number) =>
    `⚠️ **Membership Limit**\n\nYou've reached the maximum of **${max} joined groups**.\n\nLeave one, or pay **${cost} coins** to expand your limit to 10.`,
  groupExpandCreatedConfirm: (cost: number) =>
    `⬆️ **Expand Created Groups Limit**\n\nPay **${cost} coins** to increase your max created groups from 5 to **10**.\n\nConfirm?`,
  groupExpandJoinedConfirm: (cost: number) =>
    `⬆️ **Expand Joined Groups Limit**\n\nPay **${cost} coins** to increase your max joined groups from 5 to **10**.\n\nConfirm?`,
  groupExpandSuccess: "✅ Limit successfully increased to **10 groups**!",
  groupExpandAlreadyMax: "✅ Your limit is already at the maximum (10 groups).",
  groupEnterBtn: "🚪 Enter Group",
  groupDismissBtn: "🗑️ Remove from List",
  groupDismissedOk: "✅ Removed from list.",
  groupLeaveRemoveBtn: "🚪🗑️ Leave & Remove from Groups",
  groupLeaveRemoveConfirm: "⚠️ Are you sure?\nYou will leave the group and it will be removed from your list.",
  groupLeaveRemoveOk: "✅ Left the group and removed from list.",
  groupExpandCreatedBtn: "⬆️ Expand created limit (30 coins)",
  groupExpandJoinedBtn: "⬆️ Expand joined limit (30 coins)",
  groupNoName: "No name",
  groupInviteLinkBtn: "🔗 Group Invite Link",
  groupAdminPromoteBtn: "⭐ Promote to Admin",
  groupExpandBtn: "⬆️ Expand Capacity to 25",
  groupAdminPromoteCost: (cost: number) =>
    `⭐ **Promote Member to Group Admin**\n\n` +
    `Admins can kick or ban members.\n` +
    `Maximum 2 admins per group.\n\n` +
    `💰 Cost: **${cost} coins**\n\nConfirm?`,
  groupExpandCost: (cost: number, newMax: number) =>
    `⬆️ **Expand Group Capacity**\n\n` +
    `Group capacity will increase from 10 to **${newMax}** members.\n\n` +
    `💰 Cost: **${cost} coins**\n\nConfirm?`,
  promotedToAdmin: (alias: string) => `⭐ User ${alias} has been promoted to group admin.`,
  youWerePromotedAdmin: "⭐ You have been promoted to admin of this group!",
  groupExpanded: (max: number) => `✅ Group capacity expanded to **${max}** members.`,
  groupAdminAlreadyExists: "❌ This user is already an admin.",
  groupAdminMaxReached: "❌ Maximum 2 admins allowed per group.",
  groupNotAdmin: "❌ You are not an admin or creator of this group.",
  groupAlreadyMaxExpanded: "❌ This group has already been expanded to maximum capacity (25 members).",
  createGroupAskName:
    `📝 **Enter a name for your group:**\n\n` +
    `• Max 30 characters\n` +
    `• This name will be shown to all members\n\n` +
    `Send a dot «.» to skip this step.`,
  groupNameTooLong: "❌ Name too long. Max 30 characters.",
  groupCreatedWithName: (name: string) =>
    `🎉 Group **«${name}»** created!\n\nWaiting for members to join...\nYou are the group creator.`,
  groupInfoLine: (name: string, count: number, max: number, link: string) =>
    `📌 **${name}**\n👥 ${count}/${max} members\n🔗 ${link}\n`,
  groupSelectForAdmin: "👥 **Select a member to promote to admin:**\n\n",

  // ─── My Link sub-menu ─────────────────────────────────────────────────────────
  myLinkBtnPermanent: "🔗 My Permanent Anonymous Link",
  myLinkBtnTimed: "⏱️ Create Timed Link",
  myLinkBtnInbox: "📬 My Anonymous Inbox",
  myLinkMenuTitle: (unread: number) =>
    `🔗 **My Anonymous Link**\n\n` +
    (unread > 0 ? `📬 You have **${unread}** unread anonymous messages!\n\n` : "") +
    `Choose link type:`,
  anonMsgSentKeep: "✅ Message sent!\n\nYou can send another message or press cancel to go back.",
  anonInboxDailyReminder: (n: number) =>
    `📬 You have **${n} unread anonymous message${n === 1 ? "" : "s"}** waiting!\n\nTap «📬 My Anonymous Inbox» to read them.`,
  anonInboxEmpty: "📭 Your anonymous inbox is empty.",
  anonInboxHeader: (_total: number, unread: number, page: number, totalPages: number) =>
    `📬 <b>Anonymous Inbox</b>\n\n🔴 ${unread} unread messages\n📄 Page ${page} of ${totalPages}:`,
  anonInboxMsgText: (num: number, date: string, content: string) =>
    `📩 <b>Message #${num}</b>\n🕐 ${date}\n\n${content}`,
  anonInboxNextBtn: (page: number) => `Next page (${page}) →`,
  anonInboxPrevBtn: (page: number) => `← Previous page (${page})`,
  anonInboxMediaLabel: (type: string): string =>
    type === "photo" ? "[📷 Photo]" : type === "video" ? "[🎥 Video]" : type === "voice" ? "[🎙 Voice]" : type === "sticker" ? "[😀 Sticker]" : "[File]",
  yourReplyFromName: (name: string) => `📤 Reply from ${name}:\n\n`,

  // ─── Timed anonymous link ─────────────────────────────────────────────────────
  timedLinkTitle: "⏱️ **Timed Anonymous Link**\n\nHow long should this link stay active?",
  timedLink1h: "⏱️ 1 Hour",
  timedLink6h: "⏱️ 6 Hours",
  timedLink24h: "⏱️ 24 Hours",
  timedLink7d: "📅 7 Days",
  timedLinkCreated: (link: string, expiry: string) =>
    `⏱️ **Your Timed Anonymous Link:**\n\n${link}\n\n` +
    `🕐 Expires: ${expiry}\n\n` +
    `Share this link for anonymous messages until it expires.`,
  timedLinkExpiredOwner: "⏱️ Your timed link has expired. Create a new one anytime.",
  timedLinkInvalid: "⏱️ This link has expired or is invalid.",

  // ─── Errors / Misc ───────────────────────────────────────────────────────────
  errorGeneral: "❌ An error occurred. Please try again.",
  errorNotRegistered: "❌ Please register first. Send /start.",
  back: "🔙 Back",
  cancel: "❌ Cancel",
  confirm: "✅ Confirm",
  yes: "✅ Yes",
  no: "❌ No",
  enterAmount: "Enter the coin amount:",
  enterUserId: "Enter the user's numeric ID:",
  enterMessage: "Enter the message:",
  done: "✅ Done",

  // ─── Pro Anonymous Link ───────────────────────────────────────────────────────
  proLinkBtnPerm: "💎 Pro Permanent Link",
  proLinkBtnInApp: "⚡ In-App Link",
  proLinkBtnInbox: (n: number) => n > 0 ? `📬 Pro Inbox | ${n} msgs` : "📬 Pro Inbox (empty)",
  proLinkSubMenuTitle: (inboxCount: number) =>
    `💎 **Pro Anonymous Link**\n\n📬 Unread pro messages: **${inboxCount}**\n\nSelect a section:`,
  proPermLinkFeatures:
    `💎 **Pro Permanent Link**\n\n` +
    `One-time purchase — all features free forever:\n\n` +
    `🔍 See sender identity (free)\n` +
    `💬 Custom welcome message (free)\n` +
    `🔄 Change link — 2x per day (free)\n` +
    `✏️ Custom display name (free)\n` +
    `🏷️ Custom link alias (free)\n` +
    `📎 All file types supported`,
  proPermLinkBuyConfirm: (cost: number) =>
    `💎 **Buy Pro Permanent Link**\n\n` +
    `One purchase unlocks all pro features **permanently**.\n\n` +
    `💰 Cost: **${cost} coins** (one-time)\n\n` +
    `Confirm?`,
  proPermLinkActive: (link: string, displayName: string | null, alias: string | null, welcomeSet: boolean, enabled: boolean) =>
    `💎 **Pro Permanent Link** ${enabled ? "✅ Active" : "❌ Disabled"}\n\n` +
    `🔗 <code>${link}</code>\n\n` +
    (displayName ? `✏️ Display name: <b>${displayName}</b>\n` : "") +
    (alias ? `🏷️ Custom alias: active\n` : "") +
    (welcomeSet ? `💬 Welcome message: active\n` : "") +
    `\nShare this link to receive anonymous messages.`,
  proInAppLinkFeatures: (revealCost: number, welcomeCost: number, changeCost: number) =>
    `⚡ **In-App Link**\n\n` +
    `Create a link — unlock pro features with coins:\n\n` +
    `🔍 See sender: **${revealCost} coin** (per reveal)\n` +
    `💬 Welcome message: **${welcomeCost} coins**\n` +
    `🔄 Change link: **${changeCost} coins**\n` +
    `✏️ Display name: free\n` +
    `🏷️ Custom alias: free`,
  proInAppLinkActive: (link: string, expiry: string, displayName: string | null, enabled: boolean) =>
    `⚡ **In-App Link** ${enabled ? "✅ Active" : "❌ Disabled"}\n\n` +
    `🔗 <code>${link}</code>\n\n` +
    (displayName ? `✏️ Display name: <b>${displayName}</b>\n` : "") +
    `📅 Expires: ${expiry}`,
  proLinkBtnMyLinks: "📋 My Pro Links",
  proMyLinksEmpty: "📋 You have no pro links.",
  proMyLinksHeader: "📋 <b>My Pro Links:</b>",
  proLinkWelcomeGreeting: (displayName: string, welcomeMsg: string) =>
    `✨ <b>${displayName}</b> is ready to receive your anonymous message\n\n💬 ${welcomeMsg}\n\nPress the button below to cancel 👇`,
  proLinkDefaultGreeting: (displayName: string) =>
    `✨ <b>${displayName}</b> is ready — send your anonymous message\n\nPress the button below to cancel 👇`,
  proLinkDisabled: "❌ This link has been disabled by its owner.",
  proLinkExpired: "⏰ This link has expired or is invalid.",
  proMsgSentConfirm: "✅ Your anonymous message was sent!",
  proMsgReceived: "💎 <b>Pro Anonymous Message</b>",
  proRevealSenderInfo: (firstName: string, username: string | null, tgId: number) =>
    `🔍 <b>Sender identity:</b>\n\n` +
    `👤 Name: ${firstName}\n` +
    (username ? `📛 Username: @${username}\n` : "") +
    `🆔 ID: <a href="tg://user?id=${tgId}">${tgId}</a>`,
  proSetWelcomePrompt: "💬 Write your welcome message:\n\n(Shown to senders before they type — max 500 characters)",
  proWelcomeSet: "✅ Welcome message set.",
  proSetDisplayNamePrompt: "✏️ Write your display name:\n\n(Max 50 characters — shown to senders)",
  proDisplayNameSet: "✅ Display name set.",
  proSetAliasPrompt: "🏷️ Write your custom link alias:\n\n(Letters, numbers and _ only — max 20 characters)",
  proAliasSet: (link: string) => `✅ Custom alias set:\n<code>${link}</code>`,
  proAliasTaken: "❌ This alias is already taken. Choose another.",
  proAliasInvalid: "❌ Alias can only contain letters, numbers and _ (max 20 characters).",
  proChangeLinkFree: (link: string, remaining: number) =>
    `🔄 Link changed!\n\n🔗 New link:\n<code>${link}</code>\n\n📊 Free changes left today: ${remaining}`,
  proChangeLinkCost: (link: string) => `🔄 Link changed!\n\n🔗 New link:\n<code>${link}</code>`,
  proChangeLinkMaxReached: "❌ You've reached the daily free limit (2 changes).\n\nTry again tomorrow.",
  proLinkToggledOn: "✅ Link enabled.",
  proLinkToggledOff: "❌ Link disabled.",
  proInboxEmpty: "📬 Your pro inbox is empty.",
  proInboxHeader: (total: number, page: number, totalPages: number) =>
    `📬 <b>Pro Inbox</b> — ${total} unread | Page ${page}/${totalPages}`,
  proInboxMediaLabel: (type: string) => {
    const labels: Record<string, string> = {
      photo: "🖼️ Photo", video: "🎬 Video", voice: "🎤 Voice message",
      sticker: "🎭 Sticker", animation: "🎞️ GIF", document: "📄 File",
      audio: "🎵 Audio", video_note: "🎥 Video note",
    };
    return labels[type] ?? "📎 File";
  },
  proInboxMsgText: (n: number, date: string, preview: string, tier: string) =>
    `📩 <b>Message ${n}</b> — ${tier === "pro_perm" ? "💎 Permanent" : "⚡ In-App"}\n` +
    `📅 ${date}\n\n${preview}`,
  proReplyPrompt: "💬 Write your reply:",
  proReplySent: "✅ Reply sent.",
};

export type LangKeys = typeof en;
