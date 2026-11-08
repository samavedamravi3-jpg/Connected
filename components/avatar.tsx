"use client";
import { useState } from "react";
import { initials } from "@/lib/network";
export default function Avatar({
  person,
  large = false,
}: {
  person: { name: string; color?: string; photoUrl?: string };
  large?: boolean;
}) {
  const [failed, setFailed] = useState("");
  return (
    <span
      className={`avatar ${large ? "large" : ""}`}
      style={{ background: person.color || "#ddd3ec" }}
    >
      {person.photoUrl && failed !== person.photoUrl ? (
        <img
          src={person.photoUrl}
          alt={`${person.name}'s profile`}
          referrerPolicy="no-referrer"
          onError={() => setFailed(person.photoUrl!)}
        />
      ) : (
        initials(person.name) || "You"
      )}
    </span>
  );
}
