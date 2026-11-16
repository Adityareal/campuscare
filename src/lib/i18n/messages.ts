import type { Locale, Role } from "@/generated/prisma/enums";

type MessagesStrings = {
  intro: string;
  threadStarted: string;
  withStaff: string;
  withTeam: string;
  roles: Record<Role, string>;
  staffSender: string;
  teamSender: string;
  newBadge: string;
  noMessagesYet: string;
  closedNote: string;
  sentOk: string;
  sendFailed: string;
  askSupport: string;
  conversationLabel: string;
  unreadCount: string;
};

/** Extra student-facing copy for the messages page. Both languages must keep the same keys and {placeholders}. */
export const messagesCopy: Record<Locale, MessagesStrings> = {
  en: {
    intro: "Conversations with your campus care team. You can write back whenever you like.",
    threadStarted: "Started {day}",
    withStaff: "With {name}",
    withTeam: "With the care team",
    roles: { COUNSELLOR: "counsellor", CLINICIAN: "clinician", STUDENT: "student", INSTITUTION_ADMIN: "staff", SUPPORT_STAFF: "staff", PLATFORM_ADMIN: "staff" },
    staffSender: "{name} ({role})",
    teamSender: "Care team",
    newBadge: "New",
    noMessagesYet: "No messages yet. You can write the first one below.",
    closedNote: "This conversation is closed. If you need support again, you can ask for it at any time.",
    sentOk: "Your message has been sent.",
    sendFailed: "Your message could not be sent. Please try again.",
    askSupport: "Ask for support",
    conversationLabel: "Conversation",
    unreadCount: "{count} new",
  },
  hi: {
    intro: "आपकी कैंपस केयर टीम के साथ बातचीत। आप जब चाहें जवाब लिख सकते हैं।",
    threadStarted: "{day} को शुरू हुई",
    withStaff: "{name} के साथ",
    withTeam: "केयर टीम के साथ",
    roles: { COUNSELLOR: "काउंसलर", CLINICIAN: "क्लिनिशियन", STUDENT: "छात्र", INSTITUTION_ADMIN: "स्टाफ", SUPPORT_STAFF: "स्टाफ", PLATFORM_ADMIN: "स्टाफ" },
    staffSender: "{name} ({role})",
    teamSender: "केयर टीम",
    newBadge: "नया",
    noMessagesYet: "अभी कोई संदेश नहीं है। आप नीचे पहला संदेश लिख सकते हैं।",
    closedNote: "यह बातचीत बंद हो चुकी है। अगर आपको फिर से सहायता चाहिए, तो आप कभी भी उसके लिए कह सकते हैं।",
    sentOk: "आपका संदेश भेज दिया गया है।",
    sendFailed: "आपका संदेश भेजा नहीं जा सका। कृपया फिर से कोशिश करें।",
    askSupport: "सहायता माँगें",
    conversationLabel: "बातचीत",
    unreadCount: "{count} नए",
  },
};

export type MessagesCopy = MessagesStrings;
