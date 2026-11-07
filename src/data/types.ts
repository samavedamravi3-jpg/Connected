export type LatLng = { latitude: number; longitude: number };

export type FieldId = 'finance' | 'tech' | 'health' | 'energy' | 'design' | 'public' | 'education';
export type GoalId = 'mentorship' | 'advice' | 'peers' | 'collab' | 'recruiting' | 'other';
export type StatusId = 'student' | 'early' | 'experienced' | 'changing' | 'between';
export type AudienceId = 'anyone' | 'students' | 'early' | 'changing' | 'same-field';
export type AvailabilityId = 'today' | 'week' | 'weekends' | 'evenings';
export type Mode = 'seeking' | 'offering' | 'both';
export type ShareMode = 'area' | 'public';
export type EventCategory = 'networking' | 'career' | 'hackathon';

export type Area = { id: string; name: string; center: LatLng };
export type Venue = { id: string; name: string; area: string; detail: string; coord: LatLng };

/** An Open Door offer: a short conversation at a public place, in a time window. Times are epoch ms. */
export type OpenDoor = {
  id: string;
  venueId: string;
  start: number;
  end: number;
  lengthMin: number;
  topics: string[];
  audience: AudienceId[];
  endedAt?: number;
};

/** A person who opted in to nearby discovery. `coord` is an approximate area, never a live location. */
export type Person = {
  id: string;
  name: string;
  role: string;
  org: string;
  status: StatusId;
  field: FieldId;
  fieldPhrase: string;
  interests: string[];
  skills: string[];
  helpsWith: string[];
  offers: GoalId[];
  availability: AvailabilityId[];
  areaName: string;
  coord: LatLng;
  meets: 'public' | 'video' | 'both';
  hook: string;
  questions: string[];
  door?: OpenDoor;
  /** Demo only: how the simulated reply goes. */
  demoResponse: 'accept' | 'decline';
  isDemo: true;
};

export type NearbyPerson = Person & { distanceMi: number };

export type CommunityEvent = {
  id: string;
  title: string;
  category: EventCategory;
  field?: FieldId;
  host: string;
  venue: string;
  areaName: string;
  coord: LatLng;
  start: number;
  end: number;
  cost: string;
  description: string;
  isDemo: true;
};

export type RequestStatus = 'requested' | 'accepted' | 'declined' | 'cancelled';
export type ConnectionRequest = {
  id: string;
  personId: string;
  message: string;
  status: RequestStatus;
  createdAt: number;
  updatedAt: number;
  respondAt: number;
};
export type Message = { id: string; from: 'me' | 'them'; text: string; at: number; demo?: boolean };

export type IncomingRequest = {
  id: string;
  name: string;
  role: string;
  status: StatusId;
  field: FieldId;
  message: string;
  doorId?: string;
  state: 'new' | 'accepted' | 'declined';
};

export type Prefs = {
  field: FieldId | null;
  interests: string[];
  skills: string[];
  goals: GoalId[];
  goalOther: string;
  travelMi: number;
  mode: Mode;
  shareMode: ShareMode;
  discoverable: boolean;
  availability: AvailabilityId[];
};

export type Profile = {
  name: string;
  status: StatusId | null;
  org: string;
  intro: string;
};
