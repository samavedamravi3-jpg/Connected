"use client";
import { useEffect, useMemo, useState, useRef } from "react";
import {
  ArrowUpRight,
  ArrowRight,
  ArrowLeft,
  Bookmark,
  Check,
  ChevronDown,
  Compass,
  Users,
  CalendarDays,
  Flame,
  Search,
  SlidersHorizontal,
  MapPin,
  Plus,
  Link2,
  MessageCircle,
  Sparkles,
  Clock,
  ShieldCheck,
  X,
  Navigation,
  Settings2,
  LogOut,
  Coffee,
  Globe,
  Heart,
  Send,
  EyeOff,
  UserRound,
  LocateFixed,
} from "lucide-react";
import NearbyMap, { type MapItem } from "./nearby-map";
import {
  NYC,
  blankProfile,
  people as samplePeople,
  events as sampleEvents,
  hotspots,
  helpOptions,
  industries,
  distanceKm,
  coarseLocation,
  matchPerson,
  initials,
  type Profile,
  type Person,
  type LocalEvent,
} from "@/lib/network";

type Connection = {
  id: string;
  name: string;
  message: string;
  status: string;
  sample: number;
  incoming: boolean;
};
type ApiData = {
  error?: string;
  profile: Profile;
  visibleUntil: number;
  items: { itemId: string }[];
  blocked: string[];
  requests: Connection[];
  people: Person[];
  events: LocalEvent[];
  text: string;
  source: string;
  note: string;
  event: LocalEvent;
};
async function api(path: string, method = "GET", body?: unknown) {
  const response = await fetch(`/api/${path}`, {
    method,
    headers: body ? { "Content-Type": "application/json" } : undefined,
    body: body ? JSON.stringify(body) : undefined,
  });
  const data = (await response.json()) as ApiData;
  if (!response.ok)
    throw new Error(data.error || "Something went wrong. Please try again.");
  return data;
}
function Avatar({
  person,
  large = false,
}: {
  person: { name: string; color?: string };
  large?: boolean;
}) {
  return (
    <span
      className={`avatar ${large ? "large" : ""}`}
      style={{ background: person.color || "#ddd3ec" }}
    >
      {initials(person.name) || "You"}
    </span>
  );
}
function Modal({
  children,
  close,
  wide = false,
}: {
  children: React.ReactNode;
  close: () => void;
  wide?: boolean;
}) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const prior = document.activeElement as HTMLElement;
    ref.current?.focus();
    const listener = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
      if (e.key === "Tab") {
        const els = ref.current?.querySelectorAll<HTMLElement>(
          'button,a[href],input,select,textarea,[tabindex="0"]',
        );
        if (!els?.length) return;
        const first = els[0],
          last = els[els.length - 1];
        if (e.shiftKey && document.activeElement === first) {
          e.preventDefault();
          last.focus();
        } else if (!e.shiftKey && document.activeElement === last) {
          e.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener("keydown", listener);
    return () => {
      document.removeEventListener("keydown", listener);
      prior?.focus();
    };
  }, [close]);
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) close();
      }}
    >
      <div
        ref={ref}
        tabIndex={-1}
        className={`modal ${wide ? "wide" : ""}`}
        role="dialog"
        aria-modal="true"
        aria-label="Connected dialog"
      >
        <button
          className="modal-close icon-button"
          aria-label="Close dialog"
          onClick={close}
        >
          <X size={20} />
        </button>
        {children}
      </div>
    </div>
  );
}
export default function ConnectedApp() {
  const [profile, setProfile] = useState<Profile>(blankProfile),
    [draft, setDraft] = useState<Profile>(blankProfile),
    [signedIn, setSignedIn] = useState(false),
    [loaded, setLoaded] = useState(false),
    [onboard, setOnboard] = useState(false),
    [step, setStep] = useState(0),
    [busy, setBusy] = useState(false),
    [toast, setToast] = useState("");
  const [tab, setTab] = useState("all"),
    [page, setPage] = useState("explore"),
    [query, setQuery] = useState(""),
    [industry, setIndustry] = useState("All industries"),
    [company, setCompany] = useState("All companies"),
    [radius, setRadius] = useState(2),
    [onlyAvailable, setOnlyAvailable] = useState(false),
    [filters, setFilters] = useState(false),
    [center, setCenter] = useState<[number, number]>(NYC),
    [demo, setDemo] = useState(true),
    [gps, setGps] = useState<[number, number] | null>(null);
  const [people, setPeople] = useState<Person[]>(samplePeople),
    [events, setEvents] = useState<LocalEvent[]>(sampleEvents),
    [selected, setSelected] = useState<MapItem | null>(null),
    [saved, setSaved] = useState<string[]>([]),
    [blocked, setBlocked] = useState<string[]>([]),
    [connections, setConnections] = useState<Connection[]>([]),
    [message, setMessage] = useState(""),
    [aiNote, setAiNote] = useState(""),
    [eventForm, setEventForm] = useState(false),
    [until, setUntil] = useState(0);
  const [eventDraft, setEventDraft] = useState({
    title: "",
    venue: "",
    time: "",
    category: "Technology",
    description: "",
    lat: String(NYC[0]),
    lng: String(NYC[1]),
  });
  const notice = (s: string) => setToast(s);
  useEffect(() => {
    api("profile")
      .then((d) => {
        setSignedIn(true);
        if (d.profile) {
          setProfile(d.profile);
          setDraft(d.profile);
          setUntil(d.visibleUntil);
        } else setOnboard(true);
      })
      .catch(() => {
        if (!sessionStorage.getItem("connected-explored")) setOnboard(true);
      })
      .finally(() => setLoaded(true));
  }, []);
  useEffect(() => {
    if (!toast) return;
    const t = setTimeout(() => setToast(""), 6000);
    return () => clearTimeout(t);
  }, [toast]);
  useEffect(() => {
    if (!signedIn) return;
    api("saved")
      .then((d) => {
        setSaved(d.items.map((i: { itemId: string }) => i.itemId));
        setBlocked(d.blocked);
      })
      .catch((e) => notice(e.message));
    api("connections")
      .then((d) => setConnections(d.requests))
      .catch((e) => notice(e.message));
  }, [signedIn]);
  useEffect(() => {
    if (demo) {
      setPeople(samplePeople);
      setEvents(sampleEvents);
      return;
    }
    if (!signedIn) return;
    let active = true;
    const update = () =>
      api("discover")
        .then((d) => {
          if (active) {
            setPeople(d.people);
            setEvents(d.events);
          }
        })
        .catch((e) => {
          if (active) notice(e.message);
        });
    update();
    const t = setInterval(update, 30000);
    return () => {
      active = false;
      clearInterval(t);
    };
  }, [demo, signedIn]);
  useEffect(() => {
    if (!until) return;
    const t = setTimeout(
      () => {
        setProfile((p) => ({ ...p, discovery: false }));
        setUntil(0);
      },
      Math.max(0, until - Date.now()),
    );
    return () => clearTimeout(t);
  }, [until]);
  const filteredPeople = useMemo(
    () =>
      people
        .filter(
          (p) =>
            !blocked.includes(p.id) &&
            (industry === "All industries" || p.industry === industry) &&
            (company === "All companies" || p.company === company) &&
            (!onlyAvailable || p.available) &&
            distanceKm(center, [p.lat, p.lng]) <= radius &&
            `${p.name} ${p.company} ${p.role} ${p.help.join(" ")}`
              .toLowerCase()
              .includes(query.toLowerCase()) &&
            (page !== "saved" || saved.includes(p.id)),
        )
        .sort(
          (a, b) =>
            matchPerson(b, profile).score - matchPerson(a, profile).score,
        ),
    [
      people,
      blocked,
      industry,
      company,
      onlyAvailable,
      center,
      radius,
      query,
      page,
      saved,
      profile,
    ],
  );
  const filteredEvents = useMemo(
    () =>
      events.filter(
        (e) =>
          (industry === "All industries" || e.category === industry) &&
          distanceKm(center, [e.lat, e.lng]) <= radius &&
          `${e.title} ${e.venue} ${e.category}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (page !== "saved" || saved.includes(e.id)),
      ),
    [events, industry, center, radius, query, page, saved],
  );
  const filteredHotspots = useMemo(
    () =>
      demo
        ? hotspots.filter(
            (h) =>
              distanceKm(center, [h.lat, h.lng]) <= radius &&
              `${h.title} ${h.companies.join(" ")}`
                .toLowerCase()
                .includes(query.toLowerCase()) &&
              (company === "All companies" || h.companies.includes(company)),
          )
        : [],
    [demo, center, radius, query, company],
  );
  const select = (item: MapItem) => {
    setSelected(item);
    setMessage("");
    setAiNote("");
  };
  const locate = () => {
    if (!navigator.geolocation) {
      notice("Location is unavailable in this browser. You can explore NYC.");
      return;
    }
    notice("Waiting for location permission…");
    navigator.geolocation.getCurrentPosition(
      (p) => {
        const location = coarseLocation(p.coords.latitude, p.coords.longitude);
        setGps(location);
        setCenter(location);
        notice(
          "Search area updated. Your location is not shared unless you turn on discovery.",
        );
      },
      () =>
        notice(
          "Location access was unavailable. You can still explore the NYC demo.",
        ),
      { enableHighAccuracy: false, timeout: 10000, maximumAge: 300000 },
    );
  };
  const needAccount = () => {
    if (!signedIn) {
      setOnboard(true);
      setStep(3);
      return true;
    }
    if (!profile.name) {
      setOnboard(true);
      setStep(0);
      return true;
    }
    return false;
  };
  const saveProfile = async () => {
    if (!signedIn) {
      sessionStorage.setItem("connected-draft", JSON.stringify(draft));
      window.location.href = "/signin-with-chatgpt?return_to=%2F";
      return;
    }
    setBusy(true);
    try {
      const d = await api("profile", "PUT", {
        ...draft,
        discovery: draft.discovery && !!gps,
        latitude: gps?.[0] ?? null,
        longitude: gps?.[1] ?? null,
      });
      setProfile(d.profile);
      setDraft(d.profile);
      setUntil(d.visibleUntil);
      setOnboard(false);
      notice("You’re all set. Let’s find your people.");
    } catch (e) {
      notice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  useEffect(() => {
    if (!loaded || !signedIn || profile.name) return;
    const cached = sessionStorage.getItem("connected-draft");
    if (cached) {
      try {
        setDraft({ ...JSON.parse(cached), discovery: false });
        setStep(3);
      } catch {}
      sessionStorage.removeItem("connected-draft");
    }
  }, [loaded, signedIn, profile.name]);
  const toggleSave = async (id: string, kind: "person" | "event") => {
    if (needAccount()) return;
    try {
      const remove = saved.includes(id);
      await api("saved", "POST", { itemId: id, kind, remove });
      setSaved((s) => (remove ? s.filter((x) => x !== id) : [...s, id]));
      notice(
        remove
          ? "Removed from saved."
          : kind === "event"
            ? "Event saved. Find it in your saved list."
            : "Saved for later.",
      );
    } catch (e) {
      notice((e as Error).message);
    }
  };
  const toggleDiscovery = async () => {
    if (needAccount()) return;
    if (!profile.discovery && !gps) {
      notice("Use “My location” first, then turn on discovery.");
      locate();
      return;
    }
    try {
      const d = await api("profile", "PUT", {
        ...profile,
        discovery: !profile.discovery,
        latitude: gps?.[0] ?? null,
        longitude: gps?.[1] ?? null,
      });
      setProfile(d.profile);
      setDraft(d.profile);
      setUntil(d.visibleUntil);
      notice(
        d.profile.discovery
          ? "You’re discoverable for one hour in your approximate area."
          : "Discovery is off. You are hidden from the map.",
      );
    } catch (e) {
      notice((e as Error).message);
    }
  };
  const sendRequest = async () => {
    if (selected?.kind !== "person" || needAccount()) return;
    setBusy(true);
    try {
      await api("connections", "POST", { personId: selected.item.id, message });
      setConnections((await api("connections")).requests);
      notice(
        selected.item.sample
          ? "Demo request saved. No real person was contacted."
          : "Your chat request was sent.",
      );
      setSelected(null);
    } catch (e) {
      notice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const draftIcebreaker = async () => {
    if (selected?.kind !== "person" || needAccount()) return;
    setBusy(true);
    try {
      const d = await api("icebreaker", "POST", { personId: selected.item.id });
      setMessage(d.text);
      setAiNote(
        d.source === "claude"
          ? "Drafted with Claude. Review before sending."
          : d.note,
      );
    } catch (e) {
      notice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const changeRequest = async (id: string, status: string) => {
    try {
      await api("connections", "PATCH", { id, status });
      setConnections((await api("connections")).requests);
      notice(
        status === "accepted"
          ? "Accepted. Agree on a public meeting point."
          : "Request updated.",
      );
    } catch (e) {
      notice((e as Error).message);
    }
  };
  const editProfile = () => {
    setDraft(profile.name ? profile : blankProfile);
    setStep(0);
    setOnboard(true);
  };
  const setMode = (isDemo: boolean) => {
    if (!isDemo && !signedIn) {
      notice("Create your profile to explore the live community.");
      setOnboard(true);
      return;
    }
    setDemo(isDemo);
    setSelected(null);
    if (isDemo) setCenter(NYC);
  };
  const createEvent = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      const d = await api("events", "POST", {
        ...eventDraft,
        time: new Date(eventDraft.time).toISOString(),
        lat: Number(eventDraft.lat),
        lng: Number(eventDraft.lng),
      });
      setDemo(false);
      setCenter([d.event.lat, d.event.lng]);
      setEvents((es) => [...es, d.event]);
      setEventForm(false);
      setTab("events");
      notice("Your event is now in the live community.");
    } catch (e) {
      notice((e as Error).message);
    } finally {
      setBusy(false);
    }
  };
  const miles = (lat: number, lng: number) => {
    const km = distanceKm(center, [lat, lng]);
    return km < 1
      ? `${Math.round(km * 1000)} m away`
      : `${km.toFixed(1)} km away`;
  };
  const hasPeople = tab === "all" || tab === "people",
    hasEvents = tab === "all" || tab === "events",
    hasHotspots = (tab === "all" || tab === "hotspots") && page !== "saved";
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <a href="/" className="brand">
          <span className="brand-icon">
            <Link2 size={23} />
          </span>
          connected<span className="brand-dot">.</span>
        </a>
        <span className="sidebar-caption">A LITTLE CLOSER. A LOT FURTHER.</span>
        <nav aria-label="Main navigation">
          {[
            { id: "explore", label: "Explore nearby", icon: Compass },
            { id: "connections", label: "Connections", icon: Users },
            { id: "saved", label: "Saved", icon: Bookmark },
          ].map((n) => (
            <button
              key={n.id}
              className={`nav-item ${page === n.id ? "active" : ""}`}
              onClick={() => {
                setPage(n.id);
                setSelected(null);
              }}
            >
              <n.icon size={19} />
              {n.label}
              {n.id === "connections" &&
                connections.filter((c) => c.incoming && c.status === "pending")
                  .length > 0 && (
                  <span className="count">
                    {
                      connections.filter(
                        (c) => c.incoming && c.status === "pending",
                      ).length
                    }
                  </span>
                )}
            </button>
          ))}
          <button className="nav-item" onClick={editProfile}>
            <UserRound size={19} />
            My profile
          </button>
        </nav>
        <div className="sidebar-card">
          <span className="little-orbit">
            <Sparkles size={22} />
          </span>
          <h3>Start with a hello.</h3>
          <p>One conversation can change what comes next.</p>
          <button onClick={editProfile}>
            Find your people <ArrowUpRight size={16} />
          </button>
        </div>
        <div className="sidebar-bottom">
          <button
            className="nav-item"
            onClick={() => {
              setDraft(profile);
              setStep(3);
              setOnboard(true);
            }}
          >
            <Settings2 size={18} />
            Preferences
          </button>
          <div className="user-block">
            <Avatar person={{ name: profile.name || "You" }} />
            <div>
              <b>{profile.name || "Your next chapter"}</b>
              <span>{profile.name ? profile.role : "Make yourself known"}</span>
            </div>
            <button
              className="icon-button"
              aria-label="Edit profile"
              onClick={editProfile}
            >
              <ChevronDown size={17} />
            </button>
          </div>
        </div>
      </aside>
      <div className="workspace">
        <header className="topbar">
          <div className="breadcrumb">
            Your world, a little more connected <span>✦</span>
          </div>
          <div className="header-actions">
            <button
              className={`discovery-button ${profile.discovery ? "on" : ""}`}
              onClick={toggleDiscovery}
            >
              <span className="status-dot" />
              {profile.discovery ? "Discoverable · 1 hr" : "Discovery is off"}
              <ChevronDown size={14} />
            </button>
            <button
              className="button small"
              onClick={() => {
                if (!needAccount()) setEventForm(true);
              }}
            >
              <Plus size={16} />
              Create event
            </button>
          </div>
        </header>
        <main>
          <section className="page-heading">
            <div>
              <div className="eyebrow">
                <span /> OPPORTUNITY STARTS NEARBY
              </div>
              <h1>
                {page === "connections" ? (
                  "Good things start with hello."
                ) : page === "saved" ? (
                  "Keep a little possibility."
                ) : (
                  <>
                    Your next connection
                    <br />
                    is closer than you think<span className="purple">.</span>
                  </>
                )}
              </h1>
              <p>
                {page === "connections"
                  ? "A small ask. A useful conversation. Your next step."
                  : page === "saved"
                    ? "People and events you’d like to come back to."
                    : "Meet the right people. Find your community. Make your next move."}
              </p>
            </div>
            <div className="heading-art" aria-hidden="true">
              <div className="orbit orbit-one" />
              <div className="orbit orbit-two" />
              <span className="art-avatar art-one">M</span>
              <span className="art-avatar art-two">J</span>
              <span className="art-avatar art-three">P</span>
              <span className="art-star">✳</span>
              <span className="art-label">a world of possibility</span>
            </div>
          </section>
          {page === "connections" ? (
            <section className="connections-page">
              <div className="section-title">
                <h2>Your conversations</h2>
                <span>{connections.length} requests</span>
              </div>
              {connections.length === 0 ? (
                <div className="empty large-empty">
                  <MessageCircle size={36} />
                  <h3>Your first hello is waiting.</h3>
                  <p>
                    Explore people nearby and ask for a 10-minute conversation.
                  </p>
                  <button
                    className="button primary"
                    onClick={() => setPage("explore")}
                  >
                    Explore nearby <ArrowRight size={16} />
                  </button>
                </div>
              ) : (
                connections.map((c) => (
                  <article className="connection-card" key={c.id}>
                    <Avatar person={{ name: c.name }} />
                    <div>
                      <h3>
                        {c.name}{" "}
                        {c.sample === 1 && <span className="tag">Demo</span>}
                      </h3>
                      <small>
                        {c.incoming ? "Incoming request" : "You reached out"} ·{" "}
                        {c.status}
                      </small>
                      <p>{c.message}</p>
                      {c.sample === 1 && (
                        <p className="muted">
                          Sample profile. This request is saved for the demo;
                          nobody receives it.
                        </p>
                      )}
                      {c.status === "accepted" && (
                        <p className="match-reason">
                          <ShieldCheck size={15} />
                          Meet in a public place. Confirm a time with each other
                          at the event.
                        </p>
                      )}
                      <div className="inline-actions">
                        {c.status === "pending" &&
                          (c.incoming ? (
                            <>
                              <button
                                className="button primary small"
                                onClick={() => changeRequest(c.id, "accepted")}
                              >
                                Accept
                              </button>
                              <button
                                className="button small"
                                onClick={() => changeRequest(c.id, "declined")}
                              >
                                Decline
                              </button>
                            </>
                          ) : (
                            <button
                              className="text-button"
                              onClick={() => changeRequest(c.id, "cancelled")}
                            >
                              Cancel request
                            </button>
                          ))}
                      </div>
                    </div>
                  </article>
                ))
              )}
            </section>
          ) : (
            <>
              <div className="search-row">
                <label className="search-field">
                  <Search size={19} />
                  <input
                    aria-label="Search people, companies, or events"
                    placeholder="People, companies, events… what’s your next move?"
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                  />
                  {query && (
                    <button
                      className="icon-button"
                      aria-label="Clear search"
                      onClick={() => setQuery("")}
                    >
                      <X size={16} />
                    </button>
                  )}
                </label>
                <button className="location-button" onClick={locate}>
                  <MapPin size={16} />
                  {gps && center === gps ? "My location" : "New York, NY"}
                  <ChevronDown size={15} />
                </button>
                <button
                  className={`button filter-button ${filters ? "selected" : ""}`}
                  onClick={() => setFilters(!filters)}
                >
                  <SlidersHorizontal size={16} />
                  Filters
                  {industry !== "All industries" ||
                  company !== "All companies" ||
                  onlyAvailable ? (
                    <i />
                  ) : null}
                </button>
              </div>
              {filters && (
                <div className="filters-panel">
                  <label>
                    Industry
                    <select
                      value={industry}
                      onChange={(e) => setIndustry(e.target.value)}
                    >
                      {industries.map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Company
                    <select
                      value={company}
                      onChange={(e) => setCompany(e.target.value)}
                    >
                      <option>All companies</option>
                      {Array.from(
                        new Set(people.map((p) => p.company).filter(Boolean)),
                      ).map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                  <label>
                    Within
                    <select
                      value={radius}
                      onChange={(e) => setRadius(Number(e.target.value))}
                    >
                      <option value={0.5}>500 meters</option>
                      <option value={2}>2 kilometers</option>
                      <option value={5}>5 kilometers</option>
                      <option value={25}>25 kilometers</option>
                    </select>
                  </label>
                  <label className="check-label">
                    <input
                      type="checkbox"
                      checked={onlyAvailable}
                      onChange={(e) => setOnlyAvailable(e.target.checked)}
                    />
                    Available now
                  </label>
                  <button
                    className="text-button"
                    onClick={() => {
                      setIndustry("All industries");
                      setCompany("All companies");
                      setRadius(2);
                      setOnlyAvailable(false);
                      setQuery("");
                    }}
                  >
                    Reset
                  </button>
                </div>
              )}
              <div className="view-toolbar">
                <div
                  className="tabs"
                  role="tablist"
                  aria-label="Explore categories"
                >
                  {[
                    { id: "all", label: "For you", icon: Sparkles },
                    { id: "people", label: "People", icon: Users },
                    { id: "events", label: "Events", icon: CalendarDays },
                    { id: "hotspots", label: "Hotspots", icon: Flame },
                  ].map((t) => (
                    <button
                      key={t.id}
                      role="tab"
                      aria-selected={tab === t.id}
                      className={tab === t.id ? "active" : ""}
                      onClick={() => setTab(t.id)}
                    >
                      <t.icon size={16} />
                      {t.label}
                    </button>
                  ))}
                </div>
                <div className="mode-switch">
                  <button
                    className={demo ? "active" : ""}
                    onClick={() => setMode(true)}
                  >
                    NYC demo
                  </button>
                  <button
                    className={!demo ? "active" : ""}
                    onClick={() => setMode(false)}
                  >
                    Live community
                  </button>
                </div>
              </div>
              <div className="discovery-grid">
                <section className="results-panel" aria-label="Nearby results">
                  <div className="results-heading">
                    <div>
                      <h2>
                        {tab === "events"
                          ? "Go where it happens"
                          : tab === "hotspots"
                            ? "Where people gather"
                            : page === "saved"
                              ? "Your saved finds"
                              : "People worth meeting"}
                      </h2>
                      <p>
                        {demo
                          ? "A little serendipity, thoughtfully matched."
                          : "People who opted in to connect nearby."}
                      </p>
                    </div>
                    <span className="results-count">
                      {tab === "events"
                        ? filteredEvents.length
                        : tab === "hotspots"
                          ? filteredHotspots.length
                          : filteredPeople.length}
                    </span>
                  </div>
                  <div className="results-scroll">
                    {demo && (
                      <div className="demo-label">
                        <Globe size={13} />
                        Demo city · sample people, events & activity
                      </div>
                    )}
                    {hasPeople &&
                      filteredPeople.map((p, index) => (
                        <article
                          className={`person-card ${selected?.item.id === p.id ? "selected" : ""}`}
                          key={p.id}
                        >
                          <button
                            className="person-main"
                            onClick={() => select({ kind: "person", item: p })}
                          >
                            <div className="avatar-wrap">
                              <Avatar person={p} />
                              {p.available && <i />}
                            </div>
                            <div className="person-title">
                              <h3>
                                {p.name}
                                {index === 0 && profile.goal && (
                                  <span className="match-badge">
                                    <Sparkles size={10} />
                                    For you
                                  </span>
                                )}
                              </h3>
                              <p>{p.role}</p>
                              <b>{p.company || "Independent"}</b>
                            </div>
                            <ArrowUpRight size={16} className="card-arrow" />
                          </button>
                          <div className="person-meta">
                            <span>
                              <MapPin size={12} />
                              {miles(p.lat, p.lng)}
                            </span>
                            <span className={p.available ? "available" : ""}>
                              <span className="tiny-dot" />
                              {p.available
                                ? "Open to a chat"
                                : "Available later"}
                            </span>
                          </div>
                          <div className="help-tags">
                            {p.help.map((h) => (
                              <span key={h}>{h}</span>
                            ))}
                          </div>
                          {profile.goal && (
                            <p className="match-reason">
                              <Sparkles size={13} />
                              {matchPerson(p, profile).reason}
                            </p>
                          )}
                          <div className="card-footer">
                            <button
                              className="text-button"
                              onClick={() =>
                                select({ kind: "person", item: p })
                              }
                            >
                              Say hello <ArrowRight size={14} />
                            </button>
                            <button
                              className={`icon-button save ${saved.includes(p.id) ? "saved" : ""}`}
                              aria-label={`${saved.includes(p.id) ? "Unsave" : "Save"} ${p.name}`}
                              onClick={() => toggleSave(p.id, "person")}
                            >
                              <Bookmark
                                size={17}
                                fill={
                                  saved.includes(p.id) ? "currentColor" : "none"
                                }
                              />
                            </button>
                          </div>
                        </article>
                      ))}
                    {hasEvents && filteredEvents.length > 0 && (
                      <div className="list-subhead">
                        <h3>
                          {tab === "all"
                            ? "Good things happening nearby"
                            : "Upcoming meetups"}
                        </h3>
                        <CalendarDays size={17} />
                      </div>
                    )}
                    {hasEvents &&
                      filteredEvents.map((e) => (
                        <button
                          className="event-card"
                          key={e.id}
                          onClick={() => select({ kind: "event", item: e })}
                        >
                          <span
                            className="event-art"
                            style={{ background: e.color }}
                          >
                            <Coffee size={24} />
                          </span>
                          <span>
                            <small>
                              {e.sample
                                ? e.time
                                : new Date(e.time).toLocaleString(undefined, {
                                    month: "short",
                                    day: "numeric",
                                    hour: "numeric",
                                    minute: "2-digit",
                                  })}
                            </small>
                            <h3>{e.title}</h3>
                            <p>{e.venue}</p>
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      ))}
                    {hasHotspots && filteredHotspots.length > 0 && (
                      <div className="list-subhead">
                        <h3>Find your kind of crowd</h3>
                        <Flame size={17} />
                      </div>
                    )}
                    {hasHotspots &&
                      filteredHotspots.map((h) => (
                        <button
                          className="hotspot-card"
                          key={h.id}
                          onClick={() => select({ kind: "hotspot", item: h })}
                        >
                          <span
                            className="hotspot-art"
                            style={{ background: h.color }}
                          >
                            <Flame size={22} />
                          </span>
                          <span>
                            <h3>{h.title}</h3>
                            <p>{h.subtitle}</p>
                            <small>
                              {h.people} sample people ·{" "}
                              {h.companies.slice(0, 2).join(", ")}
                            </small>
                          </span>
                          <ArrowUpRight size={16} />
                        </button>
                      ))}
                    {(!hasPeople || !filteredPeople.length) &&
                      (!hasEvents || !filteredEvents.length) &&
                      (!hasHotspots || !filteredHotspots.length) && (
                        <div className="empty">
                          <Compass size={32} />
                          <h3>A little quiet around here.</h3>
                          <p>
                            {page === "saved"
                              ? "Save people or events to find them here."
                              : demo
                                ? "Try widening your distance or clearing a filter."
                                : "Invite your team to create profiles and turn on discovery, or explore the NYC demo."}
                          </p>
                          <button
                            className="text-button"
                            onClick={() => {
                              setQuery("");
                              setIndustry("All industries");
                              setCompany("All companies");
                              setRadius(25);
                              setOnlyAvailable(false);
                              if (!demo) setMode(true);
                            }}
                          >
                            Explore more <ArrowRight size={15} />
                          </button>
                        </div>
                      )}
                  </div>
                  <div className="results-footnote">
                    <ShieldCheck size={14} />A shared place. A willing person. A
                    better hello.
                  </div>
                </section>
                <NearbyMap
                  center={center}
                  people={hasPeople ? filteredPeople : []}
                  events={hasEvents ? filteredEvents : []}
                  hotspots={hasHotspots ? filteredHotspots : []}
                  selected={selected}
                  onSelect={select}
                  onLocate={locate}
                />
              </div>
              <footer className="page-footer">
                <span>
                  <Heart size={13} /> Built for the first connection. And
                  everything after.
                </span>
                <span>
                  {demo
                    ? "Illustrative NYC data · no affiliation with listed companies"
                    : "Discovery expires after one hour"}
                </span>
              </footer>
            </>
          )}
        </main>
      </div>
      {toast && (
        <div role="status" className="toast">
          <span>{toast}</span>
          <button
            aria-label="Dismiss notification"
            onClick={() => setToast("")}
          >
            <X size={16} />
          </button>
        </div>
      )}
      {onboard && loaded && (
        <Modal
          wide
          close={() => {
            setOnboard(false);
            sessionStorage.setItem("connected-explored", "1");
          }}
        >
          <div className="onboarding">
            <div className="onboarding-story">
              <span className="brand light">
                <Link2 size={24} />
                connected.
              </span>
              <div className="story-dots">
                <span>✳</span>
                <i>M</i>
                <b>J</b>
              </div>
              <h2>
                You don’t need
                <br />a network
                <br />
                to get started<span>.</span>
              </h2>
              <p>
                Just a goal, a little curiosity,
                <br />
                and a willingness to say hello.
              </p>
              <div className="story-foot">
                <ShieldCheck size={17} /> Your location. Your choice.
              </div>
            </div>
            <div className="onboarding-form">
              <div className="step-dots">
                {[0, 1, 2, 3].map((n) => (
                  <i key={n} className={n <= step ? "active" : ""} />
                ))}
              </div>
              <span className="eyebrow">
                A BETTER KIND OF INTRODUCTION · {step + 1}/4
              </span>
              {step === 0 && (
                <>
                  <h2>What’s your next move?</h2>
                  <p>
                    Start with what you need. We’ll help you find people who can
                    help.
                  </p>
                  <label>
                    Your goal
                    <textarea
                      maxLength={500}
                      placeholder="I want to land my first banking internship, but I don’t know where to start…"
                      value={draft.goal}
                      onChange={(e) =>
                        setDraft({ ...draft, goal: e.target.value })
                      }
                    />
                  </label>
                  <span className="field-caption">
                    A few ideas to get you going
                  </span>
                  <div className="choice-grid">
                    {helpOptions.map((h) => (
                      <button
                        key={h}
                        className={draft.interests.includes(h) ? "chosen" : ""}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            interests: draft.interests.includes(h)
                              ? draft.interests.filter((x) => x !== h)
                              : [...draft.interests, h],
                            goal:
                              draft.goal || `Get help with ${h.toLowerCase()}`,
                          })
                        }
                      >
                        {h}
                        {draft.interests.includes(h) && <Check size={13} />}
                      </button>
                    ))}
                  </div>
                </>
              )}
              {step === 1 && (
                <>
                  <h2>Put a name to the hello.</h2>
                  <p>A little context makes a conversation easier.</p>
                  <label>
                    Your name
                    <input
                      maxLength={60}
                      placeholder="e.g. Shritan Samavedam"
                      value={draft.name}
                      onChange={(e) =>
                        setDraft({ ...draft, name: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    What do you do?
                    <input
                      maxLength={80}
                      placeholder="Student, designer, founder…"
                      value={draft.role}
                      onChange={(e) =>
                        setDraft({ ...draft, role: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Company or school <span className="muted">(optional)</span>
                    <input
                      maxLength={80}
                      placeholder="Where you’re coming from"
                      value={draft.company}
                      onChange={(e) =>
                        setDraft({ ...draft, company: e.target.value })
                      }
                    />
                  </label>
                  <label>
                    Your field
                    <select
                      value={draft.industry}
                      onChange={(e) =>
                        setDraft({ ...draft, industry: e.target.value })
                      }
                    >
                      {industries.slice(1).map((x) => (
                        <option key={x}>{x}</option>
                      ))}
                    </select>
                  </label>
                </>
              )}
              {step === 2 && (
                <>
                  <h2>Everyone has something to give.</h2>
                  <p>
                    What could you help someone with in 10 minutes? Pick any
                    that feel right.
                  </p>
                  <div className="choice-grid tall">
                    {helpOptions.map((h) => (
                      <button
                        key={h}
                        className={draft.help.includes(h) ? "chosen" : ""}
                        onClick={() =>
                          setDraft({
                            ...draft,
                            help: draft.help.includes(h)
                              ? draft.help.filter((x) => x !== h)
                              : [...draft.help, h],
                          })
                        }
                      >
                        {h}
                        {draft.help.includes(h) ? (
                          <Check size={16} />
                        ) : (
                          <Plus size={16} />
                        )}
                      </button>
                    ))}
                  </div>
                  <div className="soft-note">
                    <Heart size={19} />
                    You don’t have to be an expert. Your experience can be
                    someone else’s starting point.
                  </div>
                </>
              )}
              {step === 3 && (
                <>
                  <h2>Your city. Your terms.</h2>
                  <p>Explore freely. Choose when you want to be found.</p>
                  <div className="privacy-card">
                    <ShieldCheck size={26} />
                    <h3>You’re in control</h3>
                    <p>
                      Discovery is off by default. When enabled, only an
                      approximate area is shared, for one hour. No location
                      history.
                    </p>
                  </div>
                  <button className="button location-setup" onClick={locate}>
                    <LocateFixed size={17} />
                    {gps ? "Location ready" : "Use my location"}
                    {gps && <Check size={16} />}
                  </button>
                  <label className="check-label discovery-option">
                    <input
                      type="checkbox"
                      checked={draft.discovery}
                      disabled={!gps}
                      onChange={(e) =>
                        setDraft({ ...draft, discovery: e.target.checked })
                      }
                    />
                    Let nearby people discover me for one hour
                  </label>
                  <p className="muted small-text">
                    You can also browse the NYC demo without sharing a location.
                  </p>
                  {!signedIn && (
                    <div className="soft-note">
                      <UserRound size={18} />
                      Sign in to save your profile and send requests.
                    </div>
                  )}
                </>
              )}
              <div className="onboard-actions">
                {step > 0 ? (
                  <button
                    className="text-button"
                    onClick={() => setStep(step - 1)}
                  >
                    <ArrowLeft size={16} />
                    Back
                  </button>
                ) : (
                  <button
                    className="text-button"
                    onClick={() => {
                      setOnboard(false);
                      sessionStorage.setItem("connected-explored", "1");
                    }}
                  >
                    Explore the demo
                  </button>
                )}
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    (step === 0 && draft.goal.trim().length < 5) ||
                    (step === 1 &&
                      (!draft.name.trim() || !draft.role.trim())) ||
                    (step === 3 && signedIn && (!draft.name || !draft.goal))
                  }
                  onClick={() => (step < 3 ? setStep(step + 1) : saveProfile())}
                >
                  {busy
                    ? "Saving…"
                    : step === 3
                      ? signedIn
                        ? "Let’s get connected"
                        : "Sign in & continue"
                      : "Continue"}
                  <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        </Modal>
      )}
      {selected && !onboard && (
        <Modal close={() => setSelected(null)}>
          {selected.kind === "person" ? (
            <div className="detail">
              <span className="eyebrow">A CONVERSATION WAITING TO HAPPEN</span>
              <Avatar large person={selected.item} />
              <h2>{selected.item.name}</h2>
              <p className="detail-role">
                {selected.item.role} at <b>{selected.item.company}</b>
              </p>
              <div className="detail-meta">
                <span>
                  <MapPin size={14} />
                  {miles(selected.item.lat, selected.item.lng)}
                </span>
                <span>
                  {selected.item.available
                    ? "Open to a 10-minute chat"
                    : "Available later"}
                </span>
              </div>
              {selected.item.sample && (
                <p className="demo-label">
                  Fictional demo profile · company affiliation is illustrative
                </p>
              )}
              <div className="privacy-card">
                <Sparkles size={20} />
                <h3>Why say hello?</h3>
                <p>{matchPerson(selected.item, profile).reason}</p>
              </div>
              <h4>Happy to help with</h4>
              <div className="help-tags">
                {selected.item.help.map((h) => (
                  <span key={h}>{h}</span>
                ))}
              </div>
              <h4>Looking for</h4>
              <p>{selected.item.goal}</p>
              <label>
                Your introduction
                <textarea
                  maxLength={500}
                  value={message}
                  onChange={(e) => setMessage(e.target.value)}
                  placeholder={`Hi ${selected.item.name.split(" ")[0]}! I’d love to ask you about…`}
                />
              </label>
              <button
                className="text-button purple"
                disabled={busy}
                onClick={draftIcebreaker}
              >
                <Sparkles size={15} />
                {busy ? "Working…" : "Help me break the ice"}
              </button>
              {aiNote && <p className="small-text muted">{aiNote}</p>}
              <div className="detail-actions">
                <button
                  className="button primary"
                  disabled={
                    busy ||
                    message.trim().length < 5 ||
                    !selected.item.available
                  }
                  onClick={sendRequest}
                >
                  <Send size={16} />
                  {selected.item.sample
                    ? "Try a demo request"
                    : "Ask for a 10-minute chat"}
                </button>
                <button
                  className="button"
                  aria-label="Save person"
                  onClick={() => toggleSave(selected.item.id, "person")}
                >
                  <Bookmark size={18} />
                </button>
              </div>
              <button
                className="text-button muted small-text"
                onClick={async () => {
                  if (needAccount()) return;
                  try {
                    await api("saved", "POST", {
                      itemId: selected.item.id,
                      kind: "block",
                    });
                    setBlocked((b) => [...b, selected.item.id]);
                    setSelected(null);
                    notice("Person hidden. They cannot send you new requests.");
                  } catch (e) {
                    notice((e as Error).message);
                  }
                }}
              >
                <EyeOff size={14} />
                Hide this person
              </button>
            </div>
          ) : selected.kind === "event" ? (
            <div className="detail">
              <div
                className="event-detail-art"
                style={{ background: selected.item.color }}
              >
                <Coffee size={54} />
                <span>
                  Good people.
                  <br />
                  Good conversations.
                </span>
              </div>
              <span className="eyebrow">
                {selected.item.category} ·{" "}
                {selected.item.sample ? "DEMO EVENT" : "COMMUNITY EVENT"}
              </span>
              <h2>{selected.item.title}</h2>
              <p>
                <Clock size={16} />
                {selected.item.sample
                  ? selected.item.time
                  : new Date(selected.item.time).toLocaleString()}
              </p>
              <p>
                <MapPin size={16} />
                {selected.item.venue}
              </p>
              <p>{selected.item.description}</p>
              {selected.item.sample && (
                <p className="soft-note">
                  This is a sample event for the hackathon, not a real listing.
                </p>
              )}
              <button
                className="button primary"
                onClick={() => toggleSave(selected.item.id, "event")}
              >
                <Bookmark size={17} />
                {saved.includes(selected.item.id)
                  ? "Saved · remove"
                  : "Save this event"}
              </button>
              <a
                className="button"
                href={`https://www.google.com/maps/search/?api=1&query=${selected.item.lat},${selected.item.lng}`}
                target="_blank"
                rel="noreferrer"
              >
                <Navigation size={16} />
                View public venue
              </a>
            </div>
          ) : (
            <div className="detail">
              <span
                className="hotspot-art big"
                style={{ background: selected.item.color }}
              >
                <Flame size={40} />
              </span>
              <span className="eyebrow">
                COMMUNITY HOTSPOT · SAMPLE ACTIVITY
              </span>
              <h2>{selected.item.title}</h2>
              <p>
                {selected.item.subtitle}. A place to find your next useful
                conversation.
              </p>
              <div className="hotspot-stat">
                <b>{selected.item.people}</b>
                <span>sample people around this area</span>
              </div>
              <h4>People from places like</h4>
              <div className="help-tags">
                {selected.item.companies.map((c) => (
                  <span key={c}>{c}</span>
                ))}
              </div>
              <p className="muted">
                Hotspot activity is illustrative in this demo.
              </p>
              <button
                className="button primary"
                onClick={() => {
                  setCenter([selected.item.lat, selected.item.lng]);
                  setTab("people");
                  setRadius(0.75);
                  setSelected(null);
                }}
              >
                Explore this area <ArrowRight size={16} />
              </button>
            </div>
          )}
        </Modal>
      )}
      {eventForm && (
        <Modal close={() => setEventForm(false)}>
          <form className="detail" onSubmit={createEvent}>
            <span className="eyebrow">BRING PEOPLE TOGETHER</span>
            <h2>Make room for a hello.</h2>
            <p>Create a meetup at a public place.</p>
            <label>
              Event name
              <input
                required
                minLength={3}
                maxLength={100}
                value={eventDraft.title}
                onChange={(e) =>
                  setEventDraft({ ...eventDraft, title: e.target.value })
                }
              />
            </label>
            <label>
              Public venue
              <input
                required
                minLength={3}
                value={eventDraft.venue}
                onChange={(e) =>
                  setEventDraft({ ...eventDraft, venue: e.target.value })
                }
              />
            </label>
            <label>
              Date and time
              <input
                type="datetime-local"
                required
                value={eventDraft.time}
                onChange={(e) =>
                  setEventDraft({ ...eventDraft, time: e.target.value })
                }
              />
            </label>
            <label>
              Category
              <select
                value={eventDraft.category}
                onChange={(e) =>
                  setEventDraft({ ...eventDraft, category: e.target.value })
                }
              >
                {industries.slice(1).map((x) => (
                  <option key={x}>{x}</option>
                ))}
              </select>
            </label>
            <label>
              About the meetup
              <textarea
                required
                minLength={10}
                maxLength={1000}
                value={eventDraft.description}
                onChange={(e) =>
                  setEventDraft({ ...eventDraft, description: e.target.value })
                }
              />
            </label>
            <p className="small-text muted">
              Use the public venue’s coordinates. Default: Flatiron, NYC.
            </p>
            <div className="coordinate-fields">
              <label>
                Latitude
                <input
                  type="number"
                  step="any"
                  min="-90"
                  max="90"
                  required
                  value={eventDraft.lat}
                  onChange={(e) =>
                    setEventDraft({ ...eventDraft, lat: e.target.value })
                  }
                />
              </label>
              <label>
                Longitude
                <input
                  type="number"
                  step="any"
                  min="-180"
                  max="180"
                  required
                  value={eventDraft.lng}
                  onChange={(e) =>
                    setEventDraft({ ...eventDraft, lng: e.target.value })
                  }
                />
              </label>
            </div>
            <button className="button primary" disabled={busy}>
              {busy ? "Creating…" : "Create meetup"}
              <ArrowRight size={16} />
            </button>
          </form>
        </Modal>
      )}
    </div>
  );
}
