import type { LocalEvent } from "./network";
// Curated from organizer pages on 2026-11-07. Never presented as a live ticket feed.
export const charlotteEvents: LocalEvent[] = [
  {
    id: "charlotte-pitch-nov-2026",
    title: "PitchBreakfast · November",
    category: "Entrepreneurship",
    venue: "Sparkhouse West",
    address: "2400 Greenland Ave, Charlotte, NC 28208",
    time: "2026-11-11T08:15:00-05:00",
    endsAt: "2026-11-11T10:00:00-05:00",
    description:
      "Hear startup founders pitch, learn from investor feedback, and meet the Charlotte startup community. The organizer also offers a virtual ticket.",
    lat: 35.2260946,
    lng: -80.8794091,
    attendees: null,
    color: "#e7c8a4",
    sample: false,
    sourceUrl: "https://events.humanitix.com/pitchbreakfast-november-2026",
    sourceName: "PitchBreakfast on Humanitix",
    checkedAt: "2026-11-07",
  },
  {
    id: "charlotte-foundry-2026",
    title: "49er Foundry Business Shower",
    category: "Entrepreneurship",
    venue: "CO-LAB · UNC Charlotte Center City",
    address: "301 East 9th Street, Charlotte, NC",
    time: "2026-11-19T17:00:00-05:00",
    endsAt: "2026-11-19T19:00:00-05:00",
    description:
      "Meet student founders and explore ventures from the 49er Foundry incubator during Global Entrepreneurship Week. Community members are invited to share advice and connections.",
    lat: 35.229192,
    lng: -80.834924,
    attendees: null,
    color: "#c7c1e7",
    sample: false,
    sourceUrl:
      "https://campusevents.charlotte.edu/event/global-entrepreneurship-week-49er-foundry-business-shower",
    sourceName: "UNC Charlotte",
    checkedAt: "2026-11-07",
  },
  {
    id: "charlotte-pitch-dec-2026",
    title: "PitchBreakfast · December",
    category: "Entrepreneurship",
    venue: "Sparkhouse West",
    address: "2400 Greenland Ave, Charlotte, NC 28208",
    time: "2026-12-09T08:15:00-05:00",
    endsAt: "2026-12-09T10:00:00-05:00",
    description:
      "A monthly gathering for startup pitches, feedback and conversations with the entrepreneurial community. Check the organizer for current registration details.",
    lat: 35.2260946,
    lng: -80.8794091,
    attendees: null,
    color: "#c5d3a8",
    sample: false,
    sourceUrl: "https://events.humanitix.com/pitchbreakfast-december-2026",
    sourceName: "PitchBreakfast on Humanitix",
    checkedAt: "2026-11-07",
  },
];
export function upcomingCharlotteEvents(now = Date.now()) {
  return charlotteEvents.filter((e) => Date.parse(e.endsAt || e.time) > now);
}
