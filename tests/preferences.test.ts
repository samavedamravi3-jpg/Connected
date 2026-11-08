import { test } from "node:test";
import assert from "node:assert/strict";
import {
  blankProfile,
  normalizeProfile,
  demoPeopleFor,
  demoHotspotsFor,
  CHARLOTTE,
  NYC,
  distanceKm,
  eventTime,
} from "../lib/network.ts";
import {
  charlotteEvents,
  upcomingCharlotteEvents,
} from "../lib/local-events.ts";
test("older profiles gain opt-in defaults without losing entered fields", () => {
  const p = normalizeProfile({ name: "Alex", goal: "Meet a mentor" });
  assert.equal(p.discovery, false);
  assert.equal(p.visibilityKm, 1.6);
  assert.equal(p.onboardingVersion, 1);
  assert.equal(p.name, "Alex");
  assert.deepEqual(p.socials, { linkedin: "", instagram: "", github: "" });
  assert.equal(blankProfile.name, "");
});
test("fictional demo cities keep people and hotspots near the chosen city", () => {
  for (const [city, center] of [
    ["Charlotte", CHARLOTTE],
    ["NYC", NYC],
  ] as const) {
    const people = demoPeopleFor(city);
    assert.equal(people.length, 6);
    assert.ok(
      people.every(
        (p) =>
          p.sample &&
          distanceKm([...center], [p.lat, p.lng]) < 5 &&
          p.photoUrl?.startsWith("https://"),
      ),
    );
    assert.ok(
      demoHotspotsFor(city).every(
        (p) => distanceKm([...center], [p.lat, p.lng]) < 5,
      ),
    );
  }
});
test("curated events expire after their end and retain organizer provenance", () => {
  assert.equal(upcomingCharlotteEvents(Date.parse("2026-11-07")).length, 3);
  assert.equal(upcomingCharlotteEvents(Date.parse("2026-11-12")).length, 2);
  assert.equal(upcomingCharlotteEvents(Date.parse("2027-01-01")).length, 0);
  for (const e of charlotteEvents) {
    assert.equal(e.sample, false);
    assert.equal(e.attendees, null);
    assert.ok(e.sourceUrl?.startsWith("https://"));
    assert.ok(eventTime(e).includes("EST"));
  }
});
