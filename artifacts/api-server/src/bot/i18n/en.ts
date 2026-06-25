export const en = {
  // Setup
  welcome: "👋 Welcome to the Anonymous Chat Bot!\n\nPlease select your language:",
  selectGender: "👤 Select your gender:",
  selectAge: "🎂 Enter your age (number):",
  invalidAge: "❌ Invalid age! Please enter a number between 13 and 100.",
  profileComplete: "✅ Your profile has been set up successfully!\n\nWelcome to the main menu:",
  profileUpdated: "✅ Profile updated successfully!",

  // Genders
  male: "👦 Male",
  female: "👧 Female",
  other: "🌈 Other",

  // Main menu
  menuConnect: "🔗 Connect Anonymously",
  menuGroup: "👥 Anonymous Group",
  menuMyLink: "🔗 My Anonymous Link",
  menuCoins: "💰 My Coins",
  menuHelp: "❓ Help",
  menuSettings: "⚙️ Settings",
  menuReferral: "🎁 Invite Friends",

  // Matching
  selectGenderPref: "Which gender do you prefer to talk to?",
  genderPrefFemale: "👧 Female",
  genderPrefMale: "👦 Male",
  genderPrefAny: "🎲 Anyone",
  insufficientCoins: "❌ Insufficient coins!\n\n💰 You need 1 coin to connect to a specific gender.\n\nBuy coins from the 💰 My Coins menu.",
  addedToQueue: "⏳ You've been added to the queue!\n\nIf not connected within 1 minute, please try again.",
  connected: "🎉 Connected! You can now chat anonymously.\n\n⚠️ Your identity is completely protected.",
  alreadyInQueue: "⏳ You are already in the queue.",
  alreadyInChat: "💬 You are already in a chat.",
  alreadyInGroup: "👥 You are already in a group.",
  chatEnded: "🔴 Chat ended.",
  chatEndedByPartner: "🔴 Your partner ended the chat.",
  endChat: "🔴 End Chat",
  reportUser: "🚨 Report User",
  blockUser: "🚫 Block User",
  notInChat: "❌ You are not in a chat.",
  queueTimeout: "⏱️ Queue timeout. Please try again.",
  removedFromQueue: "✅ Removed from queue.",
  cancelSearch: "❌ Cancel Search",
  coinsDeducted: (n: number) => `💰 ${n} coin(s) deducted.`,

  // Chat controls
  chatHeader: "💬 Active Chat",
  partnerIsTyping: "... is typing",
  messageForwarded: "✉️ Message sent",
  cannotSendMedia: "⚠️ This media type is not supported.",

  // Report
  reportReasons: ["Pornography", "Harassment", "Fraud", "Spam", "Inappropriate Content", "Other"],
  selectReportReason: "🚨 Select a reason for reporting:",
  reportSent: "✅ Report submitted successfully. Thank you for keeping us safe.",
  alreadyReported: "⚠️ You have already reported this user.",

  // Block
  blockReasons: ["Pornography", "Harassment", "Spam", "Disturbance", "Other"],
  selectBlockReason: "🚫 Select a reason for blocking:",
  userBlocked: "🚫 User blocked.",
  alreadyBlocked: "⚠️ This user is already blocked.",

  // Group chat
  joinGroup: "👥 Join Anonymous Group",
  groupJoined: "🎉 Joined anonymous group!\n\nMembers: {count}\nYou can chat with everyone.",
  groupMessage: (id: string) => `[Group] User ${id}:\n`,
  leaveGroup: "🚪 Leave Group",
  groupLeft: "✅ Left the group.",
  groupEnded: "🔴 Group has been dissolved.",
  groupCostInfo: "💰 Joining a group costs 1 coin.",
  noGroupAvailable: "❌ No group available. A new group was created, please wait.",
  newGroupCreated: "🆕 New group created! Waiting for more members...",

  // Anonymous link
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

  // Coins
  coinsBalance: (n: number) => `💰 Your balance: **${n} coins**`,
  buyCoins: "🛒 Buy Coins",
  coinHistory: "📋 Coin History",
  selectPackage: "📦 Select a package:",
  packageInfo: (coins: number, price: number, currency: string) => `💰 ${coins} coins — ${price.toLocaleString()} ${currency}`,
  selectPaymentMethod: "💳 Select a payment method:",
  payByCard: "💳 Pay by Card",
  payByCrypto: "₿ Pay by Crypto",
  payByGateway: "🌐 Online Gateway",
  cardPaymentInfo: (cardNo: string, amount: number) => `💳 **Card Payment**\n\nCard Number: \`${cardNo}\`\nAmount: ${amount.toLocaleString()}\n\nAfter payment, upload your receipt.`,
  cryptoPaymentInfo: (wallet: string, amount: string) => `₿ **Crypto Payment**\n\nWallet Address: \`${wallet}\`\nAmount: ${amount}\n\nAfter sending, upload your receipt.`,
  uploadReceipt: "📷 Upload your payment receipt:",
  receiptSubmitted: "✅ Your receipt has been submitted for review.",
  paymentApproved: (coins: number) => `✅ Payment approved! ${coins} coins added to your account.`,
  paymentRejected: "❌ Your payment was rejected. Please contact support for more information.",
  gatewayUnavailable: "⚠️ Online gateway is currently unavailable.",
  paymentMethodDisabled: "⚠️ This payment method is currently disabled.",

  // Referral
  referralInfo: (code: string, link: string, total: number, coins: number) =>
    `🎁 **Referral Program**\n\nYour referral code: \`${code}\`\nReferral link:\n${link}\n\n👥 Total referrals: ${total}\n💰 Coins earned: ${coins}\n\nEarn 5 coins for every successful referral!`,
  referralReward: (n: number) => `🎁 Congratulations! You received ${n} coins from your referral.`,
  referralWelcome: (name: string) => `👋 Hello! You were invited by ${name}.`,

  // Settings
  settingsMenu: "⚙️ Profile Settings:",
  changeGender: "👤 Change Gender",
  changeAge: "🎂 Change Age",
  changeLanguage: "🌐 Change Language",
  currentProfile: (gender: string, age: number) => `👤 Gender: ${gender}\n🎂 Age: ${age}`,

  // Help
  helpText: `❓ **Bot Help**

🔗 **Anonymous Connect:**
Click "Connect Anonymously" to chat with a random anonymous user.

👥 **Anonymous Group:**
Join groups of 3-10 people and chat anonymously with multiple users.

🔗 **Anonymous Link:**
Your unique link that others can use to send you anonymous messages.

💰 **Coins:**
• Connect to specific gender: 1 coin
• Join group: 1 coin
• Earn by inviting friends or purchasing

🎁 **Invite Friends:**
Earn 5 coins for every successful referral!

🚫 **Rules:**
• No inappropriate content
• No harassment
• No spam or advertising

🛡️ **Safety:**
• Your identity is fully protected
• You can report or block users`,

  // Safety
  warningIssued: (n: number) => `⚠️ Warning ${n} of 3. Repeated violations will result in account restriction.`,
  userRestricted: "🚫 Your account has been restricted for 24 hours.",
  userBanned: "🔨 Your account has been banned. Contact support to appeal.",
  messageBlocked: "⚠️ Your message contains inappropriate content and was not sent.",
  rateLimitExceeded: "⏱️ You are sending too many messages. Please slow down.",

  // Admin
  adminWelcome: "👑 Admin Panel",
  adminStats: (stats: any) => `📊 **Statistics**\n\n👥 Total Users: ${stats.totalUsers}\n🟢 Active Users: ${stats.activeUsers}\n💬 Total Chats: ${stats.totalChats}\n💰 Total Transactions: ${stats.totalTransactions}\n📋 Pending Reports: ${stats.pendingReports}`,
  adminNotFound: "❌ User not found.",
  adminUserInfo: (u: any) => `👤 **User Info**\n\nID: ${u.telegramId}\nName: ${u.firstName}\nGender: ${u.gender}\nAge: ${u.age}\n💰 Coins: ${u.coins}\n📅 Joined: ${u.createdAt}\nStatus: ${u.status}`,
  adminCoinsAdded: (n: number, uid: number) => `✅ Added ${n} coins to user ${uid}.`,
  adminCoinsRemoved: (n: number, uid: number) => `✅ Removed ${n} coins from user ${uid}.`,
  adminUserBanned: (uid: number) => `🔨 User ${uid} has been banned.`,
  adminUserUnbanned: (uid: number) => `✅ User ${uid} has been unbanned.`,
  adminBroadcastSent: (n: number) => `✅ Message sent to ${n} users.`,
  backupSent: "✅ Backup sent successfully.",
  backupFailed: "❌ Backup failed.",
  backupConfigured: "✅ Backup settings saved.",

  // Payment review (admin group)
  paymentReviewMsg: (p: any) => `💳 **New Payment Request**\n\nUser: ${p.userId}\nPackage: ${p.coins} coins\nAmount: ${p.price.toLocaleString()} ${p.currency}\nMethod: ${p.method}\nTime: ${new Date(p.createdAt).toLocaleString()}`,
  approvePayment: "✅ Approve",
  rejectPayment: "❌ Reject",
  paymentAlreadyProcessed: "⚠️ This payment has already been processed.",

  // Errors
  errorGeneral: "❌ An error occurred. Please try again.",
  errorNotRegistered: "❌ Please register first. Send /start.",
  back: "🔙 Back",
  cancel: "❌ Cancel",
  confirm: "✅ Confirm",

  // Misc
  yes: "✅ Yes",
  no: "❌ No",
  enterAmount: "Enter the coin amount:",
  enterUserId: "Enter the user's numeric ID:",
  enterMessage: "Enter the message:",
  done: "✅ Done",
};

export type LangKeys = typeof en;
