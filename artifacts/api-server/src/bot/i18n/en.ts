export const en = {
  // ─── Setup ───────────────────────────────────────────────────────────────────
  welcome: "👋 Welcome to the Anonymous Chat Bot!\n\nPlease select your language:",
  selectGender: "👤 Select your gender:",
  selectAge: "🎂 Enter your age (a number between 13 and 100):",
  invalidAge: "❌ Invalid age! Please enter a number between 13 and 100.",
  profileComplete: "✅ Your profile has been set up successfully!\n\nWelcome to the main menu:",
  profileUpdated: "✅ Profile updated successfully!",

  // ─── Genders ─────────────────────────────────────────────────────────────────
  male: "👦 Male",
  female: "👧 Female",
  other: "🌈 Other",

  // ─── Main menu ───────────────────────────────────────────────────────────────
  menuConnect: "🔗 Connect Anonymously",
  menuGroup: "👥 Anonymous Group",
  menuMyLink: "🔗 My Anonymous Link",
  menuCoins: "💰 My Coins",
  menuHelp: "❓ Help",
  menuSettings: "⚙️ Settings",
  menuReferral: "🎁 Invite Friends",

  // ─── Matching ────────────────────────────────────────────────────────────────
  selectGenderPref: "Which gender would you like to talk to?",
  genderPrefFemale: "👧 Female",
  genderPrefMale: "👦 Male",
  genderPrefAny: "🎲 Anyone",
  insufficientCoins: "❌ Insufficient coins!\n\n💰 You need 1 coin to connect to a specific gender.\n\nBuy coins from the 💰 My Coins menu.",
  addedToQueue: "⏳ You've been added to the waiting queue!\n\nPress Cancel to leave the queue.",
  connected: "🎉 Connected!\n\n⚠️ Your identity is completely protected.\nYou can send messages, photos, videos, voice notes, and stickers.",
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

  // ─── Anonymous link ──────────────────────────────────────────────────────────
  myLink: "🔗 Your Anonymous Link:",
  linkInfo: "Anyone can send you anonymous messages through this link.",
  anonMsgReceived: "📩 New anonymous message:",
  replyAnon: "↩️ Reply Anonymously",
  replyPrompt: "Enter your reply:",
  replySent: "✅ Reply sent.",
  yourReply: "📤 Reply received:",
  sendAnonMsg: "Write your anonymous message for this user:",
  anonMsgSent: "✅ Your anonymous message has been sent.",
  blockSender: "🚫 Block Sender",
  reportSender: "🚨 Report Sender",

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
  payByGateway: "🌐 Online Gateway",
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
  uploadReceipt: "📷 Upload your payment receipt:",
  receiptSubmitted: "✅ Your receipt has been submitted for review.\n\nYou will be notified once the admin reviews it.",
  paymentCancelled: "❌ Payment cancelled.",
  paymentApproved: (coins: number) => `✅ Payment approved!\n\n💰 **${coins} coins** added to your account.`,
  paymentRejected: "❌ Your payment was rejected. Please contact support for more information.",
  gatewayUnavailable: "⚠️ Online gateway is currently unavailable.",
  paymentMethodDisabled: "⚠️ This payment method is currently disabled.",

  // ─── Referral ────────────────────────────────────────────────────────────────
  referralInfo: (code: string, link: string, total: number, coins: number) =>
    `🎁 **Referral Program**\n\n` +
    `Your referral code: \`${code}\`\n` +
    `Referral link:\n${link}\n\n` +
    `👥 Total referrals: **${total}**\n` +
    `💰 Coins earned: **${coins}** coins\n\n` +
    `🎉 Earn **5 coins** for every successful referral!`,
  referralReward: (n: number) => `🎁 Congratulations! You received ${n} coins from your referral.`,
  referralWelcome: (name: string) => `👋 Hello! You were invited by **${name}**.`,

  // ─── Settings ────────────────────────────────────────────────────────────────
  settingsMenu: "⚙️ Profile Settings:",
  changeGender: "👤 Change Gender",
  changeAge: "🎂 Change Age",
  changeLanguage: "🌐 Change Language",
  currentProfile: (gender: string, age: number) =>
    `👤 Gender: **${gender}**\n🎂 Age: **${age}**`,
  cancelledAction: "❌ Action cancelled.",

  // ─── Help ─────────────────────────────────────────────────────────────────────
  helpText:
    `❓ **Bot Help**\n\n` +
    `🔗 **Anonymous Connect:**\n` +
    `Click "Connect Anonymously" to chat with a random anonymous user.\n` +
    `Specific gender = 1 coin | Anyone = free\n\n` +
    `👥 **Anonymous Group:**\n` +
    `Join groups of 3-10 people. Cost: 1 coin\n\n` +
    `🔗 **Anonymous Link:**\n` +
    `Your unique link for receiving anonymous messages from others.\n\n` +
    `💰 **Coins:**\n` +
    `• Connect to specific gender: 1 coin\n` +
    `• Join group: 1 coin\n` +
    `• Buy coins: from 💰 My Coins menu\n` +
    `• Earn free coins by inviting friends\n\n` +
    `🎁 **Invite Friends:**\n` +
    `Earn 5 coins for every successful referral!\n\n` +
    `🚫 **Rules:**\n` +
    `• No inappropriate content, spam or harassment\n` +
    `• Violations = warning, restriction, or ban\n\n` +
    `🛡️ **Safety:**\n` +
    `• Your identity is fully protected\n` +
    `• You can report or block users`,

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
    `💰 Coins: ${u.coins}\n` +
    `📅 Joined: ${new Date(u.createdAt).toLocaleDateString()}\n` +
    `Status: ${u.status}`,
  adminCoinsAdded: (n: number, uid: number) => `✅ Added ${n} coins to user ${uid}.`,
  adminCoinsRemoved: (n: number, uid: number) => `✅ Removed ${n} coins from user ${uid}.`,
  adminUserBanned: (uid: number) => `🔨 User ${uid} has been banned.`,
  adminUserUnbanned: (uid: number) => `✅ User ${uid} has been unbanned.`,
  adminBroadcastSent: (n: number) => `✅ Message sent to ${n} users.`,
  backupSent: "✅ Backup sent successfully.",
  backupFailed: "❌ Backup failed.",
  backupConfigured: "✅ Backup settings saved.",

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
};

export type LangKeys = typeof en;
