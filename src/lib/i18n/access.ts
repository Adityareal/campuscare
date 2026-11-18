import type { Locale } from "@prisma/client";

/**
 * Copy for the public access pages (sign-in, second step, registration) and the notification
 * inbox. Both languages keep identical keys and identical {placeholder} names. Hindi follows the
 * terms already used in hi.ts and is pending review by a native-speaking clinician.
 */
const en = {
  lang: { switchTo: "हिंदी", switchLabel: "Switch to Hindi" },
  crisis: "If you are in danger now, call 112. Tele-MANAS (14416) describes its mental health support as free and available at any hour.",
  helpNow: "Need help right now?",
  signIn: {
    title: "Sign in",
    intro: "Use the email address and password for your CampusCare account.",
    email: "Email",
    password: "Password",
    submit: "Sign in",
    pending: "Signing in",
    registerLink: "Have an invitation code? Create a student account",
    emptyFields: "Enter your email and password.",
  },
  verify: {
    title: "Second step",
    intro: "Enter the 6-digit code from your authenticator app to finish signing in.",
    code: "6-digit code",
    submit: "Verify",
    pending: "Checking",
    startOver: "Use a different account",
    emptyCode: "Enter the 6-digit code.",
  },
  register: {
    title: "Create your student account",
    intro: "Use the invitation code from your institution. After you sign in you choose what to share with the care team.",
    joining: "Joining {institution}",
    invalidTitle: "This invitation cannot be used",
    invalidBody: "The code is missing, has expired or has been used up. Ask your student services office for a new one.",
    haveCode: "Enter your invitation code",
    code: "Invitation code",
    codeContinue: "Continue",
    name: "Full name",
    email: "Institutional email",
    emailHint: "Use the address your institution gave you, ending in @{domain}.",
    studentNumber: "Student number",
    department: "Department",
    departmentChoose: "Choose your department",
    year: "Academic year",
    yearOption: "Year {n}",
    language: "Preferred language",
    phone: "Phone number",
    optional: "Optional",
    password: "Password",
    passwordHint: "At least {min} characters.",
    confirm: "Confirm password",
    mismatch: "The two passwords do not match.",
    submit: "Create account",
    pending: "Creating account",
    haveAccount: "Already have an account? Sign in",
  },
  inbox: {
    title: "Notifications",
    intro: "Newest first. Notifications here never show private details.",
    empty: "You have no notifications.",
    unread: "Unread",
    read: "Read",
    open: "Open",
    markRead: "Mark as read",
    markAll: "Mark all as read",
    allMarked: "All notifications are marked as read.",
    caption: "Your notifications",
  },
};

const hi: typeof en = {
  lang: { switchTo: "English", switchLabel: "अंग्रेज़ी में देखें" },
  crisis: "अगर आप अभी खतरे में हैं, तो 112 पर कॉल करें। टेली-मानस (14416) अपनी मानसिक स्वास्थ्य सहायता को मुफ़्त और किसी भी समय उपलब्ध बताता है।",
  helpNow: "अभी मदद चाहिए?",
  signIn: {
    title: "साइन इन",
    intro: "अपने CampusCare खाते का ईमेल और पासवर्ड इस्तेमाल करें।",
    email: "ईमेल",
    password: "पासवर्ड",
    submit: "साइन इन करें",
    pending: "साइन इन हो रहा है",
    registerLink: "आमंत्रण कोड है? छात्र खाता बनाएँ",
    emptyFields: "अपना ईमेल और पासवर्ड भरें।",
  },
  verify: {
    title: "दूसरा चरण",
    intro: "साइन इन पूरा करने के लिए अपने ऑथेंटिकेटर ऐप का 6 अंकों का कोड भरें।",
    code: "6 अंकों का कोड",
    submit: "जाँचें",
    pending: "जाँच हो रही है",
    startOver: "किसी दूसरे खाते से साइन इन करें",
    emptyCode: "6 अंकों का कोड भरें।",
  },
  register: {
    title: "अपना छात्र खाता बनाएँ",
    intro: "अपने संस्थान से मिला आमंत्रण कोड इस्तेमाल करें। साइन इन के बाद आप खुद चुनते हैं कि केयर टीम के साथ क्या साझा करना है।",
    joining: "{institution} में शामिल हो रहे हैं",
    invalidTitle: "यह आमंत्रण इस्तेमाल नहीं हो सकता",
    invalidBody: "कोड नहीं मिला, उसकी अवधि खत्म हो गई है या उसका इस्तेमाल पूरा हो चुका है। नया कोड पाने के लिए अपने छात्र सेवा कार्यालय से पूछें।",
    haveCode: "अपना आमंत्रण कोड भरें",
    code: "आमंत्रण कोड",
    codeContinue: "आगे बढ़ें",
    name: "पूरा नाम",
    email: "संस्थान का ईमेल",
    emailHint: "संस्थान से मिला पता इस्तेमाल करें, जो @{domain} पर खत्म होता है।",
    studentNumber: "छात्र संख्या",
    department: "विभाग",
    departmentChoose: "अपना विभाग चुनें",
    year: "शैक्षणिक वर्ष",
    yearOption: "वर्ष {n}",
    language: "पसंदीदा भाषा",
    phone: "फ़ोन नंबर",
    optional: "वैकल्पिक",
    password: "पासवर्ड",
    passwordHint: "कम से कम {min} अक्षर।",
    confirm: "पासवर्ड दोबारा भरें",
    mismatch: "दोनों पासवर्ड एक जैसे नहीं हैं।",
    submit: "खाता बनाएँ",
    pending: "खाता बन रहा है",
    haveAccount: "पहले से खाता है? साइन इन करें",
  },
  inbox: {
    title: "सूचनाएँ",
    intro: "सबसे नई सबसे ऊपर। यहाँ की सूचनाओं में निजी जानकारी कभी नहीं दिखती।",
    empty: "आपके पास कोई सूचना नहीं है।",
    unread: "अपठित",
    read: "पढ़ी हुई",
    open: "खोलें",
    markRead: "पढ़ा हुआ चिह्नित करें",
    markAll: "सभी को पढ़ा हुआ चिह्नित करें",
    allMarked: "सभी सूचनाएँ पढ़ी हुई चिह्नित हो गईं।",
    caption: "आपकी सूचनाएँ",
  },
};

export const accessCopy = { en, hi } as const;
export type AccessCopy = typeof en;

export function accessText(locale: Locale | string | null | undefined): AccessCopy {
  return locale === "hi" ? hi : en;
}

/** Replaces {placeholders}; kept here so client forms do not import the full dictionaries. */
export function fillText(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (m, key: string) => (key in vars ? String(vars[key]) : m));
}

/** Reads the ?lang= query value used on public pages. */
export function localeFromParam(value: string | string[] | undefined): Locale {
  return value === "hi" ? "hi" : "en";
}
