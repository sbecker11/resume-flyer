#!/usr/bin/env python3
"""
Validate parsed resume data against schemas/parsed-resume-format.json.
FAIL FAST: raises ValidationError on first schema violation.

Usage:
  # Validate Python dicts (e.g. after parser produces output):
  from validate_parsed_resume import validate_jobs, validate_skills, validate_other_sections

  validate_jobs(jobs_dict)
  validate_skills(skills_dict)
  validate_other_sections(other_sections_dict)

  # Validate a parsed-resume folder (reads .mjs and meta.json):
  python validate_parsed_resume.py /path/to/parsed_resumes/resume-id

  # Copy this file and parsed-resume-format.json to resume-parser; ensure
  # schema path resolves (same directory or set SCHEMA_PATH).
"""

import json
import re
import sys
from pathlib import Path

try:
    import jsonschema
except ImportError:
    raise ImportError(
        "jsonschema required. Install with: pip install jsonschema"
    ) from None

# Schema lives alongside this script
_SCHEMA_DIR = Path(__file__).resolve().parent
_SCHEMA_PATH = Path(__file__).resolve().parent / "parsed-resume-format.json"


def _load_schema():
    with open(_SCHEMA_PATH, encoding="utf-8") as f:
        return json.load(f)


def _build_validator(def_name: str):
    """Build a validator for a $defs entry. Uses full schema for $ref resolution."""
    schema = _load_schema()
    ref_schema = {"$ref": f"#/$defs/{def_name}"}
    resolver = jsonschema.RefResolver.from_schema(schema)
    # Draft202012 matches our $schema; fallback to Draft7 for older jsonschema
    validator_cls = getattr(jsonschema, "Draft202012Validator", jsonschema.Draft7Validator)
    return validator_cls(ref_schema, resolver=resolver)


def _extract_mjs_value(content: str, var_name: str) -> dict | list:
    """Extract JSON value from 'export const X = ...;' or 'const X = ...;'."""
    for prefix in (f"export const {var_name} = ", f"const {var_name} = "):
        idx = content.find(prefix)
        if idx != -1:
            start = idx + len(prefix)
            rest = content[start:]
            # Find matching end (last semicolon or end of string)
            end = rest.rfind(";")
            if end != -1:
                rest = rest[:end]
            return json.loads(rest.strip())
    raise ValueError(f"Missing '{var_name}' in .mjs content")


def validate_jobs(data: dict | list) -> None:
    """Validate jobs (array or object keyed by jobID). Raises ValidationError on failure."""
    validator = _build_validator("jobs")
    validator.validate(data)


def validate_skills(data: dict) -> None:
    """Validate skills (object keyed by skillID). Raises ValidationError on failure."""
    validator = _build_validator("skills")
    validator.validate(data)


def validate_categories(data: dict) -> None:
    """Validate categories (object keyed by categoryID). Raises ValidationError on failure."""
    validator = _build_validator("categories")
    validator.validate(data)


def validate_other_sections(data: dict) -> None:
    """Validate otherSections object. Raises ValidationError on failure."""
    validator = _build_validator("otherSections")
    validator.validate(data)


def validate_meta(data: dict) -> None:
    """Validate meta.json object. Raises ValidationError on failure."""
    validator = _build_validator("meta")
    validator.validate(data)


def validate_folder(folder: str | Path) -> list[str]:
    """
    Validate all files in a parsed-resume folder. FAIL FAST.
    Returns list of validated file names. Raises on first error.
    """
    folder = Path(folder)
    validated = []

    jobs_path = folder / "jobs.mjs"
    if jobs_path.exists():
        content = jobs_path.read_text(encoding="utf-8")
        jobs = _extract_mjs_value(content, "jobs")
        validate_jobs(jobs)
        validated.append("jobs.mjs")

    skills_path = folder / "skills.mjs"
    if skills_path.exists():
        content = skills_path.read_text(encoding="utf-8")
        skills = _extract_mjs_value(content, "skills")
        validate_skills(skills)
        validated.append("skills.mjs")

    categories_path = folder / "categories.mjs"
    if categories_path.exists():
        content = categories_path.read_text(encoding="utf-8")
        categories = _extract_mjs_value(content, "categories")
        validate_categories(categories)
        validated.append("categories.mjs")

    other_path = folder / "other-sections.mjs"
    if other_path.exists():
        content = other_path.read_text(encoding="utf-8")
        other = _extract_mjs_value(content, "otherSections")
        validate_other_sections(other)
        validated.append("other-sections.mjs")

    meta_path = folder / "meta.json"
    if meta_path.exists():
        meta = json.loads(meta_path.read_text(encoding="utf-8"))
        validate_meta(meta)
        validated.append("meta.json")

    return validated


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: validate_parsed_resume.py <parsed-resume-folder>", file=sys.stderr)
        return 1
    folder = sys.argv[1]
    try:
        validated = validate_folder(folder)
        print(f"Validated: {', '.join(validated)}")
        return 0
    except (json.JSONDecodeError, ValueError) as e:
        print(f"Parse error: {e}", file=sys.stderr)
        return 1
    except jsonschema.ValidationError as e:
        print(f"Schema validation failed: {e.message}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    sys.exit(main())
