export type Lang = "fa" | "en";

export function detectLang(): Lang {
  try {
    const code: string =
      (window as any).Telegram?.WebApp?.initDataUnsafe?.user?.language_code ?? "";
    if (code.startsWith("fa") || code.startsWith("ar")) return "fa";
    if (code.length > 0) return "en";
  } catch { /* */ }
  return "fa";
}

export interface I18n {
  dir: "rtl" | "ltr";
  loading: string;
  authFailed: string;
  authFailedSub: string;
  callDisabledTitle: string;
  callDisabledSub: string;
  title: string;
  subtitle: string;
  callTypeLabel: string;
  voiceLabel: string;
  videoLabel: string;
  partnerLabel: string;
  anyone: string;
  male: string;
  female: string;
  costLabel: string;
  coinUnit: string;
  notEnoughCoins: (cost: number) => string;
  startVoice: string;
  startVideo: string;
  connecting: string;
  disabled: string;
  errInsufficient: (req: number) => string;
  errCallDisabled: string;
  errVideoDisabled: string;
  errAlreadyInCall: string;
  errAuthFailed: string;
  errGeneric: (code: string) => string;
  queueSearching: string;
  queueSubVoice: string;
  queueSubVideo: string;
  queueSecure: string;
  queueCancel: string;
  callConnecting: string;
  callConnected: string;
  callCoinsSpent: (n: number) => string;
  callMuteLabel: string;
  callUnmuteLabel: string;
  callSpeakerLabel: string;
  endedTitle: string;
  endedAgain: string;
  endedReconnectHint: string;
  endedDismiss: string;
  reasons: Record<string, { icon: string; msg: string }>;
}

const fa: I18n = {
  dir: "rtl",
  loading: "در حال بارگذاری...",
  authFailed: "این اپ را از داخل تلگرام باز کنید",
  authFailedSub: "برای استفاده از تماس ناشناس، روی دکمه منو در ربات تلگرام کلیک کنید.",
  callDisabledTitle: "ویژگی تماس ناشناس\nدر حال حاضر غیرفعال است",
  callDisabledSub: "لطفاً بعداً دوباره امتحان کنید.",
  title: "تماس ناشناس",
  subtitle: "با یک غریبه صحبت کن",
  callTypeLabel: "نوع تماس",
  voiceLabel: "صوتی",
  videoLabel: "تصویری",
  partnerLabel: "طرف مقابل",
  anyone: "هر کسی",
  male: "پسر",
  female: "دختر",
  costLabel: "هزینه اتصال",
  coinUnit: "سکه 🪙",
  notEnoughCoins: (cost) => `موجودی کافی نیست (${cost} سکه لازم)`,
  startVoice: "🎤  شروع تماس صوتی",
  startVideo: "📹  شروع تماس تصویری",
  connecting: "در حال اتصال...",
  disabled: "غیرفعال",
  errInsufficient: (req) => `موجودی کافی نیست. نیاز به ${req} سکه.`,
  errCallDisabled: "ویژگی تماس غیرفعال است.",
  errVideoDisabled: "تماس تصویری غیرفعال است.",
  errAlreadyInCall: "شما در حال حاضر در یک تماس هستید.",
  errAuthFailed: "لطفاً از داخل تلگرام وارد شوید.",
  errGeneric: (code) => `خطا: ${code}`,
  queueSearching: "در حال جستجو",
  queueSubVoice: "در حال پیدا کردن یک شریک برای تماس صوتی...",
  queueSubVideo: "در حال پیدا کردن یک شریک برای تماس تصویری...",
  queueSecure: "اتصال ایمن و کاملاً ناشناس",
  queueCancel: "انصراف",
  callConnecting: "در حال اتصال...",
  callConnected: "در تماس",
  callCoinsSpent: (n) => `${n} سکه کسر شد`,
  callMuteLabel: "بی‌صدا",
  callUnmuteLabel: "میکروفون",
  callSpeakerLabel: "بلندگو",
  endedTitle: "تماس پایان یافت",
  endedAgain: "🔄  تماس مجدد",
  endedReconnectHint: "میخوای با یه نفر دیگه صحبت کنی؟",
  endedDismiss: "نه، ممنون",
  reasons: {
    user_ended:           { icon: "📵", msg: "تماس توسط شما پایان یافت." },
    partner_ended:        { icon: "👋", msg: "طرف مقابل تماس را قطع کرد." },
    partner_disconnected: { icon: "📡", msg: "اتصال طرف مقابل قطع شد." },
    max_duration_reached: { icon: "⏰", msg: "مدت مجاز تماس به پایان رسید." },
    connection_failed:    { icon: "🔴", msg: "اتصال برقرار نشد. دوباره امتحان کنید." },
  },
};

const en: I18n = {
  dir: "ltr",
  loading: "Loading...",
  authFailed: "Open from Telegram",
  authFailedSub: "Tap the menu button in the Telegram bot to use anonymous calls.",
  callDisabledTitle: "Anonymous Call is\ncurrently disabled",
  callDisabledSub: "Please try again later.",
  title: "Anonymous Call",
  subtitle: "Talk to a stranger",
  callTypeLabel: "Call Type",
  voiceLabel: "Voice",
  videoLabel: "Video",
  partnerLabel: "Match with",
  anyone: "Anyone",
  male: "Male",
  female: "Female",
  costLabel: "Connection Cost",
  coinUnit: "coins 🪙",
  notEnoughCoins: (cost) => `Not enough coins (${cost} needed)`,
  startVoice: "🎤  Start Voice Call",
  startVideo: "📹  Start Video Call",
  connecting: "Connecting...",
  disabled: "Disabled",
  errInsufficient: (req) => `Not enough coins. You need ${req}.`,
  errCallDisabled: "Call feature is disabled.",
  errVideoDisabled: "Video calls are disabled.",
  errAlreadyInCall: "You are already in a call.",
  errAuthFailed: "Please open this app from Telegram.",
  errGeneric: (code) => `Error: ${code}`,
  queueSearching: "Searching",
  queueSubVoice: "Looking for someone to voice chat with...",
  queueSubVideo: "Looking for someone to video chat with...",
  queueSecure: "Secure & completely anonymous",
  queueCancel: "Cancel",
  callConnecting: "Connecting...",
  callConnected: "In Call",
  callCoinsSpent: (n) => `${n} coins spent`,
  callMuteLabel: "Mute",
  callUnmuteLabel: "Mic",
  callSpeakerLabel: "Speaker",
  endedTitle: "Call Ended",
  endedAgain: "🔄  New Call",
  endedReconnectHint: "Want to talk to someone else?",
  endedDismiss: "No thanks",
  reasons: {
    user_ended:           { icon: "📵", msg: "You ended the call." },
    partner_ended:        { icon: "👋", msg: "Partner disconnected." },
    partner_disconnected: { icon: "📡", msg: "Partner's connection lost." },
    max_duration_reached: { icon: "⏰", msg: "Maximum call duration reached." },
    connection_failed:    { icon: "🔴", msg: "Connection failed. Try again." },
  },
};

export const translations: Record<Lang, I18n> = { fa, en };
