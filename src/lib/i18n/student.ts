import type { Locale } from "@prisma/client";

/**
 * Student app copy that is not in the shared dictionary (src/lib/i18n/en.ts and hi.ts).
 * Both languages must keep identical keys and identical {placeholder} names.
 */
const en = {
  common: {
    reviewPrivacy: "Review privacy choices",
    callAria: "Call {label} on {phone}",
    saving: "Saving",
    sending: "Sending",
    hoursLabel: "Hours: {hours}",
  },
  home: {
    lastCheckInOn: "Last check-in: {date}",
    checkInPrompt: "A check-in takes about a minute. Skip any question you prefer not to answer.",
    trendLabel: "Your mood, stress and sleep ratings from 1 to 5 over the last 8 weeks",
    trendNote: "Each line shows your own ratings from 1 to 5. For stress, a higher number means more stress.",
    due: "Due {day}",
    startPhq9: "Start the PHQ-9 questionnaire",
    startGad7: "Start the GAD-7 questionnaire",
    selfHint: "Optional. Each takes about two minutes. You can stop at any time.",
    noQuestionnaires: "No questionnaires are waiting for you.",
    pickQuestionnaire: "Choose a questionnaire.",
    startingQuestionnaire: "Starting",
    withProfessional: "With {name}",
    viewAppointment: "View details",
    unreadMessages: "Unread messages: {count}",
    openMessages: "Open messages",
    noUnread: "No unread messages.",
    askForSupport: "Ask for support",
    campusContacts: "Campus contacts",
    consentOffTitle: "Check-ins are turned off",
    consentOffBody: "You have turned off the choice that lets CampusCare save your check-ins and questionnaires. You can change this whenever you like.",
    newUpdate: "New",
  },
  assessment: {
    itemOf: "Question {n} of {total}",
    completedOn: "Completed on {date}",
    cancelled: "This questionnaire was cancelled. You can start a new one from your home page.",
    safetyRequested: "Thank you. We have asked the campus care team to contact you. Team hours: {hours}. If you are in danger, call 112.",
    aboutTitle: "About this questionnaire",
    submitting: "Submitting",
    answerAll: "Answer every question, then submit.",
  },
  help: {
    typeLegend: "What kind of support would you like?",
    pickOne: "Choose one type of support.",
  },
  privacy: {
    currentState: "Your current choices",
    lastChanged: "Last changed: {date}",
    dependsOnCore: "The two choices below need this one to be on.",
  },
  history: {
    date: "Date",
    note: "Note",
    questionnaire: "Questionnaire",
    score: "Score",
    range: "Range",
    scoreOf: "{total} of {max}",
    pending: "Not completed yet",
    cancelled: "Cancelled",
    checkInsCaption: "Your check-ins, newest first. Ratings are from 1 to 5.",
    assessmentsCaption: "Your questionnaires, newest first",
    openIt: "Open",
    noNote: "-",
  },
  helpNow: {
    national: "National helplines",
    signInPrompt: "Sign in to reach your campus care team.",
    signIn: "Sign in",
    sending: "Sending",
  },
};

export type StudentCopy = typeof en;

const hi: StudentCopy = {
  common: {
    reviewPrivacy: "गोपनीयता विकल्प देखें",
    callAria: "{label} को {phone} पर कॉल करें",
    saving: "सहेजा जा रहा है",
    sending: "भेजा जा रहा है",
    hoursLabel: "समय: {hours}",
  },
  home: {
    lastCheckInOn: "पिछला चेक-इन: {date}",
    checkInPrompt: "चेक-इन में करीब एक मिनट लगता है। जिस सवाल का जवाब न देना चाहें, उसे छोड़ दें।",
    trendLabel: "पिछले 8 हफ़्तों में 1 से 5 के पैमाने पर आपके मूड, तनाव और नींद की रेटिंग",
    trendNote: "हर रेखा 1 से 5 के पैमाने पर आपकी अपनी रेटिंग दिखाती है। तनाव में ज़्यादा संख्या का मतलब ज़्यादा तनाव है।",
    due: "आखिरी तारीख: {day}",
    startPhq9: "PHQ-9 प्रश्नावली शुरू करें",
    startGad7: "GAD-7 प्रश्नावली शुरू करें",
    selfHint: "वैकल्पिक। हर एक में करीब दो मिनट लगते हैं। आप कभी भी रुक सकते हैं।",
    noQuestionnaires: "आपके लिए कोई प्रश्नावली बाकी नहीं है।",
    pickQuestionnaire: "एक प्रश्नावली चुनें।",
    startingQuestionnaire: "शुरू हो रही है",
    withProfessional: "{name} के साथ",
    viewAppointment: "ब्यौरा देखें",
    unreadMessages: "बिना पढ़े संदेश: {count}",
    openMessages: "संदेश खोलें",
    noUnread: "कोई संदेश बिना पढ़ा नहीं है।",
    askForSupport: "सहायता माँगें",
    campusContacts: "कैंपस के संपर्क",
    consentOffTitle: "चेक-इन बंद हैं",
    consentOffBody: "आपने वह विकल्प बंद कर दिया है जिससे CampusCare आपके चेक-इन और प्रश्नावलियाँ सहेज सकता है। आप इसे कभी भी बदल सकते हैं।",
    newUpdate: "नया",
  },
  assessment: {
    itemOf: "सवाल {n} / {total}",
    completedOn: "पूरा किया गया: {date}",
    cancelled: "यह प्रश्नावली रद्द कर दी गई थी। आप होम पेज से नई प्रश्नावली शुरू कर सकते हैं।",
    safetyRequested: "धन्यवाद। हमने कैंपस केयर टीम से आपसे संपर्क करने को कहा है। टीम का समय: {hours}। अगर आप खतरे में हैं, तो 112 पर कॉल करें।",
    aboutTitle: "इस प्रश्नावली के बारे में",
    submitting: "भेजा जा रहा है",
    answerAll: "हर सवाल का जवाब दें, फिर भेजें।",
  },
  help: {
    typeLegend: "आपको किस तरह की सहायता चाहिए?",
    pickOne: "सहायता का एक प्रकार चुनें।",
  },
  privacy: {
    currentState: "आपके मौजूदा विकल्प",
    lastChanged: "आखिरी बदलाव: {date}",
    dependsOnCore: "नीचे के दोनों विकल्प तभी काम करते हैं जब यह चालू हो।",
  },
  history: {
    date: "तारीख",
    note: "नोट",
    questionnaire: "प्रश्नावली",
    score: "स्कोर",
    range: "श्रेणी",
    scoreOf: "{max} में से {total}",
    pending: "अभी पूरी नहीं हुई",
    cancelled: "रद्द",
    checkInsCaption: "आपके चेक-इन, नए सबसे ऊपर। रेटिंग 1 से 5 के पैमाने पर हैं।",
    assessmentsCaption: "आपकी प्रश्नावलियाँ, नई सबसे ऊपर",
    openIt: "खोलें",
    noNote: "-",
  },
  helpNow: {
    national: "राष्ट्रीय हेल्पलाइन",
    signInPrompt: "अपनी कैंपस केयर टीम तक पहुँचने के लिए साइन इन करें।",
    signIn: "साइन इन",
    sending: "भेजा जा रहा है",
  },
};

export const studentCopy: Record<Locale, StudentCopy> = { en, hi };

export function getStudentCopy(locale: Locale): StudentCopy {
  return studentCopy[locale] ?? en;
}
