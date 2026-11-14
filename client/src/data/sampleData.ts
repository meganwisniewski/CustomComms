import type { Cadence, Contact, Group } from "../types";

/**
 * Sample data for development. This is a stand-in for what the hub will serve
 * once BlueBubbles is connected — same shape, real contacts/threads later.
 */
export const CONTACTS: Contact[] = [
  {
    id: "beth", name: "Beth", lane: "people", closeness: 1, age: 2, last: "them", unread: true,
    snippet: "Hi friend! How are things going? Deloitte? Apartment?",
    thread: [
      { from: "them", text: "Hi friend! How are things going?", time: "Mon" },
      { from: "them", text: "Deloitte? Apartment? Koda? Waiting again for medical coverage?", time: "Mon" },
      { from: "me", text: "yes! short trip to LA for onboarding at Deloitte.", time: "Mon" },
      { from: "me", text: "finally back home in SF for a good bit 👍", time: "Mon" },
    ],
  },
  {
    id: "mom", name: "Mom", emoji: "💛", lane: "people", closeness: 1, age: 5, last: "them", unread: true,
    snippet: "Call me when you get a chance, love you 💛",
    thread: [{ from: "them", text: "Call me when you get a chance, love you 💛", time: "Sat" }],
  },
  {
    id: "ryan", name: "Ryan Deeter", lane: "people", closeness: 2, age: 6, last: "them", unread: false,
    snippet: "depression has been kicking my ass this week… how are you?",
    thread: [
      { from: "them", text: "depression has been kicking my ass this week", time: "Sun" },
      { from: "them", text: "how are you doing?", time: "Sun" },
    ],
  },
  {
    id: "kurt", name: "Kurt Schoffstall", lane: "people", closeness: 2, age: 1, last: "you", unread: false,
    snippet: "You: thank you! talk soon",
    thread: [
      { from: "them", text: "OK good luck — you've got this 🙏", time: "Thu" },
      { from: "me", text: "thank you! talk soon", time: "Thu" },
    ],
  },
  {
    id: "sabine", name: "Sabine", lane: "people", closeness: 2, age: 1, last: "you", unread: false,
    snippet: "You: sold!! 🎉 so excited",
    thread: [
      { from: "them", text: "offer accepted??", time: "Thu" },
      { from: "me", text: "sold!! 🎉", time: "Thu" },
    ],
  },
  {
    id: "joey", name: "Joey McCasey", lane: "people", closeness: 3, age: 9, last: "them", unread: false,
    snippet: "[Video] — check this out lol",
    thread: [
      { from: "them", text: "[Video]", time: "Sep 28" },
      { from: "them", text: "check this out lol", time: "Sep 28" },
    ],
  },
  {
    id: "dad", name: "Dad", lane: "people", closeness: 3, age: 24, last: "them", unread: false,
    snippet: "Happy birthday kiddo! So proud of you.",
    thread: [{ from: "them", text: "Happy birthday kiddo! So proud of you.", time: "Sep 13" }],
  },
  {
    id: "seals", name: "SF Seals", emoji: "🦭", lane: "feed", closeness: 3, age: 0, last: "group", unread: true,
    snippet: "Kurt: boat crew Saturday? who's in 🚤",
    thread: [
      { from: "them", text: "last hr of networking, then boat crew Saturday?", time: "9:44 AM" },
      { from: "them", text: "who's in 🚤", time: "9:44 AM" },
    ],
  },
  {
    id: "delo", name: "Deloitte Onboarding", lane: "feed", closeness: 3, age: 3, last: "you", unread: false,
    snippet: "You: all set, thank you!",
    thread: [
      { from: "them", text: "Welcome aboard — any Qs before day one?", time: "Oct 3" },
      { from: "me", text: "all set, thank you!", time: "Oct 4" },
    ],
  },
  {
    id: "clinic", name: "Dr. Nguyen's Office", lane: "trail", closeness: 3, age: 63, last: "them", unread: false,
    snippet: "Your test results are ready in the portal.",
    thread: [{ from: "them", text: "Your test results are ready in the portal.", time: "Aug 5" }],
  },
  {
    id: "amzn", name: "Amazon", emoji: "📦", lane: "trail", closeness: 3, age: 1, last: "them", unread: false,
    snippet: "Your package was delivered to the front door.",
    thread: [{ from: "them", text: "Your package was delivered to the front door.", time: "Thu" }],
  },
  {
    id: "otp", name: "Verification", emoji: "🔐", lane: "trail", closeness: 3, age: 0, last: "them", unread: false,
    snippet: "Your code is 448 201. Expires in 10 min.",
    thread: [{ from: "them", text: "Your code is 448 201. It expires in 10 minutes.", time: "now" }],
  },
];

export const CONTACTS_BY_ID: Record<string, Contact> = Object.fromEntries(
  CONTACTS.map((c) => [c.id, c]),
);

export const PEOPLE = CONTACTS.filter((c) => c.lane === "people");

export const DEFAULT_GROUPS: Group[] = [
  { name: "Family", ids: ["mom", "dad"] },
  { name: "Close friends", ids: ["beth", "ryan", "sabine"] },
  { name: "Friends", ids: ["kurt", "joey"] },
];

export const CADENCE_LABELS: Record<Cadence, string> = {
  weekly: "Weekly",
  "2w": "Every 2 weeks",
  monthly: "Monthly",
  fewmonths: "Every few months",
  none: "No set rhythm",
};

export const CADENCE_DEFAULT: Record<string, Cadence> = { mom: "weekly", beth: "2w", ryan: "monthly" };
export const BIRTHDAY_DEFAULT: Record<string, string> = { mom: "Mar 14", dad: "Nov 2" };
export const NOTES_DEFAULT: Record<string, string> = {
  beth: "Koda (her dog) · just started at Deloitte · was waiting on medical coverage — ask how it's going",
};

export const EMOJI_CHOICES = ["💛", "🦭", "🌸", "🐢", "⭐️", "🔥", "🌊", "🧋", "🎧", "🫶", "🍋", "🪴"];
