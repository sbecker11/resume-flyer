#!/usr/bin/env python3
"""
Split [1.1.3]-tagged bullets out of parent job Descriptions into their own
jobs.json rows, and insert outlineKind=section labels (e.g. 1.1, 1.2).

Use after resume-parser collapses nested tagged lines into a parent Description.
"""
from __future__ import annotations

import json
import re
import sys
from pathlib import Path

TAG_RE = re.compile(r"^\[(\d+(?:\.\d+)*)\]\s*")
BULLET_RE = re.compile(r"^[\u2022\u00b7•]\s*")
DESC_SPLIT_RE = re.compile(r"\s+[—]\s+")
DATE_TAIL_RE = re.compile(
    r"^(.*?)\s+(\d{1,2}/\d{4})\s+[–—-]\s+(\d{1,2}/\d{4}|CURRENT_DATE|[Pp]resent|[Cc]urrent)\s*$"
)
SECTION_LABELS = {
    "1.1": "Spexture Portfolio Projects",
    "1.2": "Spexture Client Engagements",
}


def to_jobs_list(raw: dict | list) -> list[dict]:
    if isinstance(raw, list):
        return [dict(j) for j in raw]
    if isinstance(raw, dict) and "jobs" in raw and isinstance(raw["jobs"], list):
        return [dict(j) for j in raw["jobs"]]
    if isinstance(raw, dict):
        keys = list(raw.keys())
        try:
            keys.sort(key=lambda k: int(k))
        except ValueError:
            pass
        return [dict(raw[k]) for k in keys]
    raise TypeError("jobs.json must be an object or array")


def split_bullets(description: str) -> list[str]:
    if not description:
        return []
    parts = re.split(r"(?=[\u2022•])", description)
    return [p.strip() for p in parts if p.strip()]


def parse_tagged_bullet(text: str) -> dict | None:
    body = BULLET_RE.sub("", text.strip())
    m = TAG_RE.match(body)
    if not m:
        return None
    index = m.group(1)
    rest = body[m.end() :].strip()
    left, desc = rest, ""
    split = DESC_SPLIT_RE.split(rest, maxsplit=1)
    if len(split) == 2:
        left, desc = split[0].strip(), split[1].strip()
    start = end = ""
    employer = left
    dm = DATE_TAIL_RE.match(left)
    if dm:
        employer = dm.group(1).strip()
        start = dm.group(2)
        end_raw = dm.group(3)
        end = "CURRENT_DATE" if end_raw.lower() in {"present", "current"} else end_raw
    role = ""
    if desc and ":" in desc:
        maybe_role, maybe_desc = desc.split(":", 1)
        if any(
            tok in maybe_role
            for tok in ("Engineer", "Architect", "CTO", "Manager", "Lead")
        ):
            role = maybe_role.strip()
            desc = maybe_desc.strip()
    return {
        "outlineIndex": index,
        "employer": employer,
        "role": role,
        "start": start,
        "end": end,
        "Description": f"• {desc}" if desc else "",
    }


def needed_section_indices(child_indices: list[str]) -> list[str]:
    needed: set[str] = set()
    for idx in child_indices:
        parts = idx.split(".")
        for i in range(1, len(parts)):
            parent = ".".join(parts[:i])
            if parent in SECTION_LABELS:
                needed.add(parent)
    return sorted(needed, key=lambda s: [int(p) for p in s.split(".")])


def style_from(parent: dict) -> dict:
    return {
        "css name": parent.get("css name"),
        "css RGB": parent.get("css RGB"),
        "css color": parent.get("css color"),
        "text color": parent.get("text color") or "#FFFFFF",
    }


def make_section(index: str, parent: dict, z: int) -> dict:
    return {
        "role": "",
        "employer": SECTION_LABELS[index],
        "start": "",
        "end": "",
        "z-index": z,
        **style_from(parent),
        "Description": "",
        "outlineIndex": index,
        "outlineKind": "section",
    }


def make_child(parsed: dict, parent: dict, z: int) -> dict:
    # Nested tagged lines are their own jobs; do not inherit parent dates.
    start = parsed["start"] or ""
    end = parsed["end"] or ""
    return {
        "role": parsed["role"] or "",
        "employer": parsed["employer"],
        "start": start,
        "end": end,
        "z-index": z,
        **style_from(parent),
        "Description": parsed["Description"],
        "outlineIndex": parsed["outlineIndex"],
    }


def expand(jobs: list[dict]) -> list[dict]:
    out: list[dict] = []
    inserted_sections: set[str] = set()
    z_cycle = 0

    def next_z() -> int:
        nonlocal z_cycle
        z_cycle += 1
        return ((z_cycle - 1) % 3) + 1

    for job in jobs:
        desc = job.get("Description") or ""
        bullets = split_bullets(desc)
        tagged: list[dict] = []
        leftover: list[str] = []
        for b in bullets:
            parsed = parse_tagged_bullet(b)
            if parsed:
                tagged.append(parsed)
            else:
                leftover.append(b)

        parent = dict(job)
        parent.pop("skillIDs", None)
        if leftover:
            parent["Description"] = "".join(leftover)
        elif tagged:
            parent["Description"] = ""
        parent["outlineIndex"] = str(parent.get("outlineIndex") or "")
        out.append(parent)

        if not tagged:
            continue

        for sec_idx in needed_section_indices([t["outlineIndex"] for t in tagged]):
            if sec_idx in inserted_sections:
                continue
            out.append(make_section(sec_idx, parent, next_z()))
            inserted_sections.add(sec_idx)

        tagged.sort(key=lambda t: [int(p) for p in t["outlineIndex"].split(".")])
        for parsed in tagged:
            out.append(make_child(parsed, parent, next_z()))

    for i, job in enumerate(out):
        job["index"] = i
    return out


def to_keyed(jobs: list[dict]) -> dict[str, dict]:
    return {str(i): job for i, job in enumerate(jobs)}


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: expand-jobs-from-outline-tags.py <jobs.json>", file=sys.stderr)
        return 1
    path = Path(sys.argv[1]).expanduser()
    raw = json.loads(path.read_text())
    expanded = expand(to_jobs_list(raw))
    path.write_text(json.dumps(to_keyed(expanded), indent=2) + "\n")
    print(f"Wrote {len(expanded)} jobs to {path}")
    for j in expanded:
        kind = j.get("outlineKind") or "job"
        print(f"  [{j.get('outlineIndex') or '—'}] {kind:7} {j.get('employer')}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
