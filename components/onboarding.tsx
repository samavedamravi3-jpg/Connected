"use client";
import { useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  Check,
  Link2,
  LocateFixed,
  ShieldCheck,
  Camera,
} from "lucide-react";
import {
  helpOptions,
  industries,
  visibilityOptions,
  type Profile,
} from "@/lib/network";
import Avatar from "./avatar";
type Props = {
  draft: Profile;
  setDraft: (p: Profile) => void;
  step: number;
  setStep: (n: number) => void;
  gps: [number, number] | null;
  locate: () => void;
  signedIn: boolean;
  busy: boolean;
  save: () => void;
  close: () => void;
};
export default function Onboarding({
  draft,
  setDraft,
  step,
  setStep,
  gps,
  locate,
  signedIn,
  busy,
  save,
  close,
}: Props) {
  const [photoError, setPhotoError] = useState("");
  const [uploading, setUploading] = useState(false);
  const patch = (value: Partial<Profile>) => setDraft({ ...draft, ...value });
  const choices = (field: "help" | "interests") => (
    <div className="choice-grid">
      {helpOptions.map((h) => (
        <button
          key={h}
          className={draft[field].includes(h) ? "chosen" : ""}
          aria-pressed={draft[field].includes(h)}
          onClick={() =>
            patch({
              [field]: draft[field].includes(h)
                ? draft[field].filter((x) => x !== h)
                : [...draft[field], h],
              ...(field === "interests" && !draft.goal
                ? { goal: `Get help with ${h.toLowerCase()}` }
                : {}),
            })
          }
        >
          {h}
          {draft[field].includes(h) && <Check size={14} />}
        </button>
      ))}
    </div>
  );
  async function upload(file?: File) {
    if (!file) return;
    setPhotoError("");
    if (
      !["image/jpeg", "image/png", "image/webp"].includes(file.type) ||
      file.size > 5 * 1024 * 1024
    ) {
      setPhotoError("Choose a JPG, PNG or WebP photo under 5 MB.");
      return;
    }
    setUploading(true);
    const url = URL.createObjectURL(file);
    try {
      const img = new Image();
      img.src = url;
      await img.decode();
      const canvas = document.createElement("canvas");
      canvas.width = 256;
      canvas.height = 256;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw Error();
      const side = Math.min(img.width, img.height);
      ctx.drawImage(
        img,
        (img.width - side) / 2,
        (img.height - side) / 2,
        side,
        side,
        0,
        0,
        256,
        256,
      );
      patch({ photoUrl: canvas.toDataURL("image/jpeg", 0.82) });
    } catch {
      setPhotoError("That photo could not be opened. Try another one.");
    } finally {
      URL.revokeObjectURL(url);
      setUploading(false);
    }
  }
  return (
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
          Your people.
          <br />
          Your pace.
          <br />
          Your next move<span>.</span>
        </h2>
        <p>
          A little about you.
          <br />A better place to start.
        </p>
        <div className="story-foot">
          <ShieldCheck size={17} />
          Your location. Your choice.
        </div>
      </div>
      <div className="onboarding-form">
        <div className="step-dots">
          {[0, 1, 2, 3, 4].map((n) => (
            <i key={n} className={n <= step ? "active" : ""} />
          ))}
        </div>
        <span className="eyebrow">MAKE IT YOURS · {step + 1}/5</span>
        {step === 0 && (
          <>
            <h2>What’s your next move?</h2>
            <p>Tell us what a useful connection looks like for you.</p>
            <label>
              Your goal
              <textarea
                maxLength={500}
                value={draft.goal}
                placeholder="I want to land my first internship and meet people in finance…"
                onChange={(e) => patch({ goal: e.target.value })}
              />
            </label>
            <span className="field-caption">
              What would you like help with?
            </span>
            {choices("interests")}
          </>
        )}
        {step === 1 && (
          <>
            <h2>Put a face to the hello.</h2>
            <p>Show the person behind your next big idea.</p>
            <div className="photo-upload">
              <Avatar person={draft} large />
              <label className="button">
                <Camera size={16} />
                {uploading ? "Preparing…" : "Choose profile photo"}
                <input
                  aria-label="Profile photo"
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  disabled={uploading}
                  onChange={(e) => void upload(e.target.files?.[0])}
                />
              </label>
              {draft.photoUrl && (
                <button
                  className="text-button"
                  onClick={() => patch({ photoUrl: "" })}
                >
                  Remove
                </button>
              )}
            </div>
            {photoError && (
              <p role="alert" className="field-error">
                {photoError}
              </p>
            )}
            <label>
              Your name
              <input
                maxLength={60}
                value={draft.name}
                onChange={(e) => patch({ name: e.target.value })}
                placeholder="Your name"
                autoComplete="name"
              />
            </label>
            <label>
              What do you do?
              <input
                maxLength={80}
                value={draft.role}
                onChange={(e) => patch({ role: e.target.value })}
                placeholder="Student, designer, founder…"
              />
            </label>
            <label>
              Company or school (optional)
              <input
                maxLength={80}
                value={draft.company}
                onChange={(e) => patch({ company: e.target.value })}
              />
            </label>
            <div className="field-pair">
              <label>
                Your field
                <select
                  value={draft.industry}
                  onChange={(e) => patch({ industry: e.target.value })}
                >
                  {industries.slice(1).map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                Career stage
                <select
                  value={draft.experience}
                  onChange={(e) =>
                    patch({
                      experience: e.target.value as Profile["experience"],
                    })
                  }
                >
                  {["Student", "Early career", "Experienced"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
        {step === 2 && (
          <>
            <h2>What can you share?</h2>
            <p>
              You don’t have to be an expert. A little experience can be someone
              else’s starting point.
            </p>
            {choices("help")}
            <div className="field-pair">
              <label>
                Meetup preference
                <select
                  value={draft.meetingStyle}
                  onChange={(e) =>
                    patch({
                      meetingStyle: e.target.value as Profile["meetingStyle"],
                    })
                  }
                >
                  {["Either", "In person", "Online"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
              <label>
                When are you open to chat?
                <select
                  value={draft.availability}
                  onChange={(e) =>
                    patch({
                      availability: e.target.value as Profile["availability"],
                    })
                  }
                >
                  {["Now", "This week", "Flexible"].map((x) => (
                    <option key={x}>{x}</option>
                  ))}
                </select>
              </label>
            </div>
          </>
        )}
        {step === 3 && (
          <>
            <h2>Your city. Your terms.</h2>
            <p>
              How far from your approximate area should you appear in nearby
              searches?
            </p>
            <div className="radius-choices">
              {visibilityOptions.map((o) => (
                <button
                  key={o.km}
                  aria-pressed={draft.visibilityKm === o.km}
                  className={draft.visibilityKm === o.km ? "chosen" : ""}
                  onClick={() => patch({ visibilityKm: o.km })}
                >
                  {o.label}
                </button>
              ))}
            </div>
            <div className="privacy-card">
              <ShieldCheck size={24} />
              <h3>Visible only when you choose</h3>
              <p>
                Discovery is off by default and expires after one hour. Your pin
                is approximate. The radius limits search areas; it doesn’t
                verify another member’s physical location.
              </p>
            </div>
            <button className="button location-setup" onClick={locate}>
              <LocateFixed size={17} />
              {gps ? "Location ready" : "Use my location"}
            </button>
            <label className="check-label discovery-option">
              <input
                type="checkbox"
                checked={draft.discovery}
                disabled={!gps}
                onChange={(e) => patch({ discovery: e.target.checked })}
              />
              Let people discover me for one hour
            </label>
            <p className="small-text muted">
              You can explore Charlotte and its events without sharing your
              location.
            </p>
          </>
        )}
        {step === 4 && (
          <>
            <h2>More ways to connect.</h2>
            <p>
              Add your profile links so people can get to know your work. All
              are optional.
            </p>
            {(["linkedin", "instagram", "github"] as const).map((provider) => (
              <label key={provider}>
                {
                  {
                    linkedin: "LinkedIn",
                    instagram: "Instagram",
                    github: "GitHub",
                  }[provider]
                }
                <input
                  type="url"
                  maxLength={300}
                  value={draft.socials[provider]}
                  placeholder={`https://${provider}.com/${provider === "linkedin" ? "in/" : ""}your-profile`}
                  onChange={(e) =>
                    patch({
                      socials: { ...draft.socials, [provider]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
            <div className="soft-note">
              <Link2 size={18} />
              These are member-provided links, not verified sign-ins. They
              appear with your discoverable profile.
            </div>
            <p className="small-text muted">
              Your profile: {draft.name || "Your name"} · {draft.meetingStyle} ·{" "}
              {draft.availability}. Visibility:{" "}
              {
                visibilityOptions.find((o) => o.km === draft.visibilityKm)
                  ?.label
              }
              .
            </p>
          </>
        )}
        <div className="onboard-actions">
          {step > 0 ? (
            <button className="text-button" onClick={() => setStep(step - 1)}>
              <ArrowLeft size={16} />
              Back
            </button>
          ) : (
            <button className="text-button" onClick={close}>
              Explore first
            </button>
          )}
          <button
            className="button primary"
            disabled={
              busy ||
              uploading ||
              (step === 0 && draft.goal.trim().length < 5) ||
              (step === 1 && (!draft.name.trim() || !draft.role.trim())) ||
              (step === 4 &&
                (!draft.name.trim() || draft.goal.trim().length < 5))
            }
            onClick={() => (step < 4 ? setStep(step + 1) : save())}
          >
            {busy
              ? "Saving…"
              : step === 4
                ? signedIn
                  ? "Let’s get connected"
                  : "Sign in & continue"
                : "Continue"}
            <ArrowRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
