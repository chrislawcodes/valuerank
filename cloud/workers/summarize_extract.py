#!/usr/bin/env python3
"""Decision extraction helpers for the summarize worker."""

import os
import re
from typing import Any, Optional

from summarize_text import (
    leading_response_candidates,
    normalize_for_match,
    normalize_for_relaxed_match,
    response_segments,
)

# Pattern to find "Rating: X" format (preferred, structured)
STRUCTURED_RATING_PATTERN = re.compile(r"Rating:\s*([1-9]\d*)", re.IGNORECASE)

# Additional structured formats commonly returned by models.
STRUCTURED_DECISION_PATTERNS = [
    re.compile(r"\b(?:decision(?:\s*code)?|answer|response)\s*(?:is|=|:)?\s*([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\b(?:my\s+)?judg(?:e)?ment(?:\s+on\s+the\s+scale)?\s*(?:(?:is)\s*[:=]?|[:=])?\s*(?:a\s*)?([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\bmy\s+(?:rating|answer|response|choice)\s*(?:is|=|:)?\s*([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\b(?:my|overall|final)\s+score\s*(?:is|=|:)?\s*([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\bi\s*(?:choose|chose|pick|picked|select|selected|rate|rated|would choose|would pick|would select)\s*(?:option\s*)?([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\b(?:i\s+would\s+)?lean\s+toward\s*(?:option\s*)?([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\bi(?:['’]d|\s+would)?\s+rate\b.{0,40}?([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\bi(?:['’]d|\s+would)?\s+(?:give|assign)\b.{0,30}?([1-9]\d*)\b", re.IGNORECASE),
    re.compile(r"\b([1-9]\d*)\s*(?:is|=|:)?\s*(?:my|the)\s*(?:rating|answer|response|choice)\b", re.IGNORECASE),
    re.compile(r"\b([1-9]\d*)\s*[—–-]\s*(?:strongly|somewhat|neutral|not like|like me|support)\b", re.IGNORECASE),
    re.compile(r"^\s*([1-9]\d*)\s*(?:reason\s*:)", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\s*([1-9]\d*)\s*(?:\r?\n)+\s*\*{0,2}reason(?:ing)?\*{0,2}\s*:", re.IGNORECASE | re.MULTILINE),
    re.compile(r"^\s*([1-9]\d*)\s*[—-]\s*", re.IGNORECASE | re.MULTILINE),
]

# Fallback pattern to find positive integer ratings - less reliable
FALLBACK_RATING_PATTERN = re.compile(r"\b([1-9]\d*)\b")
RANGE_PATTERN = re.compile(r"([1-9]\d*)\s*(?:-|–|—|to)\s*([1-9]\d*)", re.IGNORECASE)
# Word-count parentheticals appended by some models, e.g. "(5 words)" or "(152 words)".
# Must be stripped before fallback numeric scanning to avoid false code matches.
WORD_COUNT_SUFFIX_PATTERN = re.compile(r"\(\s*\d+\s+words?\s*\)", re.IGNORECASE)
AMBIGUOUS_SUFFIX_PATTERN = re.compile(r"^\s*(?:and|or|/|,)\s*([1-9]\d*)\b", re.IGNORECASE)
LEADING_BARE_NUMBER_PATTERN = re.compile(r"^\s*([1-9]\d*)\s*(?:[.!?])?\s*$", re.IGNORECASE)

# Heuristics for detecting responses that are about the user ("you/your")
# rather than a self-rating from the target AI.
USER_DIRECTED_PATTERN = re.compile(
    r"\b("
    r"would you|do you|what do you think|would you like|"
    r"you should|you(?:'d| would)\s+likely|which option"
    r")\b",
    re.IGNORECASE,
)
SELF_RATING_PATTERN = re.compile(r"\b(i|i'm|i’d|i'd|i would|my|for me|personally)\b", re.IGNORECASE)
REFUSAL_PATTERN = re.compile(
    r"\b("
    r"must decline|decline to (?:engage|respond|answer)|"
    r"can't comply|cannot comply|won't comply|"
    r"jailbreak|circumvent (?:my )?(?:safety|guidelines)|"
    r"(?:adher(?:e|ing) to|violat(?:e|es|ing)) (?:my |the )?safety (?:instructions|guidelines)|"
    r"i(?: am|'m) sorry[, ]+but"
    r")\b",
    re.IGNORECASE,
)


def is_refusal(text: str) -> bool:
    """Returns True when the model response matches the refusal pattern.

    Used as a standalone detector so the main parser flow can check for
    refusals without going through the (now removed) numeric extractor.
    """
    return bool(text) and bool(REFUSAL_PATTERN.search(text))

DEFAULT_SUMMARIZE_PARSER_VERSION = "paired-v2"


def load_parser_version() -> str:
    raw_version = os.getenv("SUMMARIZE_PARSER_VERSION", DEFAULT_SUMMARIZE_PARSER_VERSION)
    normalized_version = raw_version.strip()
    return normalized_version if normalized_version else DEFAULT_SUMMARIZE_PARSER_VERSION


PARSER_VERSION = load_parser_version()


def collect_scale_labels(transcript_content: dict[str, Any]) -> list[dict[str, str]]:
    turns = transcript_content.get("turns", [])
    for turn in turns:
        probe_prompt = turn.get("probePrompt")
        if not isinstance(probe_prompt, str) or probe_prompt.strip() == "":
            continue

        numbered_labels: list[dict[str, str]] = []
        bullet_labels: list[str] = []

        for raw_line in probe_prompt.splitlines():
            line = raw_line.strip()
            if line == "":
                continue

            numbered_match = re.match(r"^(?P<code>[1-9]\d*)\s*-\s*(?P<label>.+)$", line)
            if numbered_match:
                numbered_labels.append(
                    {
                        "code": numbered_match.group("code"),
                        "label": numbered_match.group("label").strip(),
                    }
                )
                continue

            bullet_match = re.match(r"^-\s+(?P<label>.+)$", line)
            if bullet_match:
                bullet_labels.append(bullet_match.group("label").strip())

        if len(numbered_labels) >= 5:
            return numbered_labels
        if len(bullet_labels) == 5:
            return [
                {"code": code, "label": label}
                for code, label in zip(["5", "4", "3", "2", "1"], bullet_labels)
            ]

    return []


def extract_text_label_decision(text: str, scale_labels: list[dict[str, str]]) -> tuple[Optional[str], Optional[str]]:
    if not text or not scale_labels:
        return None, None

    segments = response_segments(text)
    if not segments:
        return None, None

    normalized_labels = [
        {
            "code": entry.get("code", ""),
            "label": entry.get("label", ""),
            "normalized": normalize_for_match(entry.get("label", "")),
        }
        for entry in scale_labels
        if entry.get("label")
    ]

    for segment in segments:
        normalized_segment = normalize_for_match(segment)
        if normalized_segment == "":
            continue

        prefix_matches = [
            entry
            for entry in normalized_labels
            if entry["normalized"]
            and (
                normalized_segment == entry["normalized"]
                or normalized_segment.startswith(entry["normalized"] + " ")
            )
        ]

        unique_prefix_matches = list({entry["code"]: entry for entry in prefix_matches}.values())
        if len(unique_prefix_matches) == 1:
            match = unique_prefix_matches[0]
            return match["code"], match["label"]
        if len(unique_prefix_matches) > 1:
            return None, None

    return None, None


def extract_text_label_decision_relaxed(
    text: str, scale_labels: list[dict[str, str]]
) -> tuple[Optional[str], Optional[str]]:
    """Same as extract_text_label_decision but strips filler words before comparing."""
    if not text or not scale_labels:
        return None, None

    segments = response_segments(text)
    if not segments:
        return None, None

    normalized_labels = [
        {
            "code": entry.get("code", ""),
            "label": entry.get("label", ""),
            "relaxed": normalize_for_relaxed_match(entry.get("label", "")),
        }
        for entry in scale_labels
        if entry.get("label")
    ]

    for segment in segments:
        relaxed_segment = normalize_for_relaxed_match(segment)
        if relaxed_segment == "":
            continue

        prefix_matches = [
            entry
            for entry in normalized_labels
            if entry["relaxed"]
            and (
                relaxed_segment == entry["relaxed"]
                or relaxed_segment.startswith(entry["relaxed"] + " ")
            )
        ]

        unique_prefix_matches = list({entry["code"]: entry for entry in prefix_matches}.values())
        if len(unique_prefix_matches) == 1:
            match = unique_prefix_matches[0]
            return match["code"], match["label"]
        if len(unique_prefix_matches) > 1:
            return None, None

    return None, None


def extract_leading_text_label_decision_relaxed(
    text: str, scale_labels: list[dict[str, str]]
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    """Same as extract_leading_text_label_decision but uses relaxed matching."""
    for candidate, used_prefix_stripping in leading_response_candidates(text):
        decision_code, matched_label = extract_text_label_decision_relaxed(candidate, scale_labels)
        if decision_code is not None:
            parse_path = "text_label_relaxed_leading" if used_prefix_stripping else "text_label_relaxed"
            return decision_code, matched_label, parse_path
    return None, None, None


_SUPPORT_PREFIX_RE = re.compile(r"^\s*(strongly|somewhat)\s+support\s+(.+)$", re.IGNORECASE)


def _group_labels_by_body(scale_labels: list[dict[str, str]]) -> dict[str, list[dict[str, str]]]:
    """Group labels by their relaxed body (the part after 'Strongly/Somewhat support ').

    Neutral/Unsure labels and any labels that don't start with 'Strongly/Somewhat
    support' are skipped — they have no body.
    """
    bodies: dict[str, list[dict[str, str]]] = {}
    for entry in scale_labels:
        raw = entry.get("label", "")
        if not raw:
            continue
        relaxed = normalize_for_relaxed_match(raw)
        match = _SUPPORT_PREFIX_RE.match(relaxed)
        if match is None:
            continue
        strength = match.group(1).lower()
        body_relaxed = match.group(2).strip()
        if not body_relaxed:
            continue
        bodies.setdefault(body_relaxed, []).append(
            {
                "code": entry.get("code", ""),
                "label": raw,
                "strength": strength,
            }
        )
    return bodies


def _compute_distinctive_tail(body: str, other_bodies: list[str]) -> Optional[str]:
    """Shortest word-suffix of `body` that is NOT a substring of any other body.

    Minimum length is 2 tokens so a single common word (e.g. "team", "work")
    can't trigger a false match. Returns None if no distinctive tail exists
    at the required minimum length.
    """
    words = body.split()
    for k in range(2, len(words) + 1):
        tail = " ".join(words[-k:])
        if not any(tail in other for other in other_bodies):
            return tail
    return None


def extract_text_label_decision_distinctive_tail(
    text: str, scale_labels: list[dict[str, str]]
) -> tuple[Optional[str], Optional[str]]:
    """Fallback matcher for cases where the model drops internal words from a
    scale label but preserves a distinctive trailing phrase.

    Example: canonical label 'Strongly support X relating to connection to the
    team's established ways' and model response 'Strongly support X relating
    to the team's established ways' (dropped 'connection to' from the middle).

    Strategy:
      1. Group labels by their relaxed body (value bodies shared between
         strong/lean pairs).
      2. For each unique body, compute the shortest word-suffix that is
         distinctive among the other bodies in this vignette (min 2 tokens).
      3. For each response segment that starts with 'Strongly/Somewhat
         support', check which distinctive tails appear. If exactly one
         body's tail appears, pair it with the support strength to pick the
         matching canonical label.

    Returns (code, matched_canonical_label) or (None, None).
    """
    if not text or not scale_labels:
        return None, None

    bodies = _group_labels_by_body(scale_labels)
    if len(bodies) < 2:
        return None, None

    body_tails: dict[str, str] = {}
    body_keys = list(bodies.keys())
    for body in body_keys:
        others = [other for other in body_keys if other != body]
        tail = _compute_distinctive_tail(body, others)
        if tail is not None:
            body_tails[body] = tail

    if len(body_tails) < 2:
        # Need every body to have a distinctive tail; otherwise we could
        # preferentially match whichever one happens to have a suffix.
        return None, None

    for segment in response_segments(text):
        relaxed_segment = normalize_for_relaxed_match(segment)
        if not relaxed_segment:
            continue
        if relaxed_segment.startswith("strongly support"):
            strength = "strongly"
        elif relaxed_segment.startswith("somewhat support"):
            strength = "somewhat"
        else:
            continue

        matched_bodies = [body for body, tail in body_tails.items() if tail in relaxed_segment]
        if len(matched_bodies) != 1:
            continue
        matched_body = matched_bodies[0]
        for entry in bodies[matched_body]:
            if entry["strength"] == strength:
                return entry["code"], entry["label"]

    return None, None


def _anchor_match_candidate(
    candidate: str,
    label_token_sets: list[tuple[dict[str, str], set[str]]],
    common_tokens: set[str],
) -> tuple[Optional[str], Optional[str]]:
    """Inner anchor matcher: token-set subset match for a single candidate
    string against pre-computed label token sets.
    """
    from summarize_text import normalize_for_relaxed_match

    candidate_norm = normalize_for_relaxed_match(candidate)
    if not candidate_norm:
        return None, None
    candidate_tokens = set(candidate_norm.split())

    # Minimum distinctive-token count for a match to count. Below this, a
    # short label like "Neutral / Unsure" can match on 2 incidental tokens
    # that appear in the candidate as a quoted mention or passing reference
    # — a false positive. 3 is a balance: still admits substantive content
    # labels, rejects thin anchors. Short labels are still handled by the
    # earlier exact / leading / relaxed tiers when the response endorses
    # them literally.
    MIN_DISTINCTIVE_TOKENS = 3

    matches: list[tuple[int, dict[str, str]]] = []
    for entry, label_tokens in label_token_sets:
        distinctive = label_tokens - common_tokens
        if len(distinctive) < MIN_DISTINCTIVE_TOKENS:
            continue
        if distinctive.issubset(candidate_tokens):
            matches.append((len(distinctive), entry))

    if not matches:
        return None, None

    # Prefer the most specific label (largest distinctive set matched).
    matches.sort(key=lambda x: x[0], reverse=True)
    top_count = matches[0][0]
    top_matches = [e for c, e in matches if c == top_count]
    if len(top_matches) != 1:
        return None, None

    matched = top_matches[0]
    return matched.get("code"), matched.get("label")


def extract_text_label_decision_anchor(
    text: str, scale_labels: list[dict[str, str]]
) -> tuple[Optional[str], Optional[str]]:
    """LAST-tier matcher. Anchors on each label's distinctive content tokens.

    Motivation: models sometimes rephrase the probe's canonical scale label,
    substituting a pronoun for a repeated noun, inserting a level word, or
    reordering filler. Strict and relaxed substring matching fail on these,
    even though the content signal is clear. Example:

      label:  "Strongly support choosing the neighborhood with authority
               over how the neighborhood is run"
      model:  "Strongly support choosing the neighborhood with substantial
               authority over how it is run"

    Algorithm:
      1. Normalize each label with the relaxed filler strip. Build a token
         set per label.
      2. Compute `common_tokens` — tokens that appear in EVERY label in the
         scale. These are scale-wide noise (e.g. "choosing", "is") and
         don't distinguish one label from another.
      3. For each label, `distinctive_tokens = label_tokens − common_tokens`.
         This is the anchor set — the content the model must reproduce to
         pick this label.
      4. Take candidate strings from `leading_response_candidates(text)` —
         the first line / first segment, with and without prefix stripping.
         Matching against the FULL response text is unsafe: essay-style
         answers discuss both values in the vignette, so both sides'
         distinctive tokens end up present in the full response and the
         algorithm would pick whichever label's token set is largest
         rather than which value the model endorsed.
      5. For each candidate (in order), a label is a "match" if ALL its
         distinctive tokens are a subset of the candidate's tokens.
      6. Winner = matching label with the MOST distinctive tokens matched.
         Handles "strongly support X" vs "somewhat support X" nesting: the
         weaker label's distinctive tokens are a subset of the stronger
         label's, so both match — the stronger wins because it has more
         matched distinctive tokens.
      7. If two labels tie at the top for a candidate, skip that candidate
         (ambiguous) and try the next one. Return the first candidate that
         produces a unique winner.
      8. Labels with fewer than 3 distinctive tokens are skipped — short
         labels like "Neutral / Unsure" can false-match on incidental
         mentions.

    Runs AFTER extract_text_label_decision, _relaxed, and _distinctive_tail
    have all returned None. Tagged `fallback_resolved` by the caller.
    """
    from summarize_text import leading_response_candidates, normalize_for_relaxed_match

    if not text or not scale_labels:
        return None, None

    # Pre-compute per-label token sets and the across-all-labels common set.
    # These are scale-level invariants — computed once, reused per candidate.
    label_token_sets: list[tuple[dict[str, str], set[str]]] = []
    for entry in scale_labels:
        label = entry.get("label", "")
        if not label:
            continue
        label_norm = normalize_for_relaxed_match(label)
        if not label_norm:
            continue
        tokens = set(label_norm.split())
        if not tokens:
            continue
        label_token_sets.append((entry, tokens))

    if len(label_token_sets) < 2:
        return None, None

    common_tokens: set[str] = set.intersection(*(ts for _, ts in label_token_sets))

    # Try each leading candidate in order; first unique winner wins.
    for candidate, _used_prefix_stripping in leading_response_candidates(text):
        code, label = _anchor_match_candidate(candidate, label_token_sets, common_tokens)
        if code is not None:
            return code, label

    return None, None


def extract_leading_decision_code(text: str) -> Optional[str]:
    for candidate, _used_prefix_stripping in leading_response_candidates(text):
        decision_code = extract_explicit_leading_decision_code(candidate)
        if decision_code is not None:
            return decision_code
    return None


def extract_leading_text_label_decision(
    text: str, scale_labels: list[dict[str, str]]
) -> tuple[Optional[str], Optional[str], Optional[str]]:
    for candidate, used_prefix_stripping in leading_response_candidates(text):
        decision_code, matched_label = extract_text_label_decision(candidate, scale_labels)
        if decision_code is not None:
            parse_path = "text_label_leading" if used_prefix_stripping else "text_label_exact"
            return decision_code, matched_label, parse_path
    return None, None, None


def extract_decision_code_from_text(text: str) -> Optional[str]:
    """
    Extract numeric decision code (positive integer) from text.

    First looks for structured "Rating: X" format (most reliable).
    Falls back to finding first standalone positive integer (less reliable).

    Returns None if no rating found.
    """
    if not text:
        return None

    # Strip lightweight markdown markers that often surround numeric answers.
    sanitized_markdown_text = text.replace("**", "").replace("__", "").replace("`", "")

    # First, try structured "Rating: X" format (most reliable)
    structured_match = STRUCTURED_RATING_PATTERN.search(sanitized_markdown_text)
    if structured_match:
        suffix = sanitized_markdown_text[structured_match.end():structured_match.end() + 24]
        if AMBIGUOUS_SUFFIX_PATTERN.search(suffix):
            return None
        return structured_match.group(1)

    # Next, look for common explicit decision formats.
    for pattern in STRUCTURED_DECISION_PATTERNS:
        matches = []
        for match in pattern.finditer(sanitized_markdown_text):
            # If immediate continuation suggests multiple candidate codes
            # (e.g., "I choose 3 and 4"), treat as ambiguous.
            suffix = sanitized_markdown_text[match.end():match.end() + 24]
            if AMBIGUOUS_SUFFIX_PATTERN.search(suffix):
                return None
            matches.append(match.group(1))
        if not matches:
            continue
        unique_values = list(dict.fromkeys(matches))
        if len(unique_values) == 1:
            return unique_values[0]
        # If an explicit format provides conflicting values, treat as ambiguous.
        return None

    # Remove numeric ranges (e.g., "1-6", "1 to 6") before fallback scanning.
    sanitized_text = RANGE_PATTERN.sub(" ", sanitized_markdown_text)
    # Strip word-count parentheticals like "(5 words)" before fallback scanning.
    # Some models append these as metadata; a coincidentally valid code would cause
    # a false positive that the out-of-range guard cannot catch.
    sanitized_text = WORD_COUNT_SUFFIX_PATTERN.sub(" ", sanitized_text)

    fallback_matches = [m.group(1) for m in FALLBACK_RATING_PATTERN.finditer(sanitized_text)]
    if not fallback_matches:
        if REFUSAL_PATTERN.search(text):
            return "refusal"
        return None

    # If the model enumerates multiple options (e.g., "1..6"), it did not choose one.
    unique_values = list(dict.fromkeys(fallback_matches))
    if len(unique_values) > 1:
        return None

    # If response is clearly directed at the user and lacks self-rating language,
    # treat as no valid decision choice.
    lower_text = text.lower()
    has_user_directed = USER_DIRECTED_PATTERN.search(lower_text) is not None
    has_self_rating = SELF_RATING_PATTERN.search(lower_text) is not None
    if has_user_directed and not has_self_rating:
        return None

    return unique_values[0]


def extract_explicit_leading_decision_code(text: str) -> Optional[str]:
    """
    Extract a decision from a leading candidate only when the candidate contains
    an explicit decision signal.

    This intentionally avoids the broad fallback number scan used for whole-response
    parsing, because opening lines often contain contextual numbers that are not
    the final decision.
    """
    if not text:
        return None

    sanitized_markdown_text = text.replace("**", "").replace("__", "").replace("`", "")

    structured_match = STRUCTURED_RATING_PATTERN.search(sanitized_markdown_text)
    if structured_match:
        suffix = sanitized_markdown_text[structured_match.end():structured_match.end() + 24]
        if AMBIGUOUS_SUFFIX_PATTERN.search(suffix):
            return None
        return structured_match.group(1)

    for pattern in STRUCTURED_DECISION_PATTERNS:
        matches = []
        for match in pattern.finditer(sanitized_markdown_text):
            suffix = sanitized_markdown_text[match.end():match.end() + 24]
            if AMBIGUOUS_SUFFIX_PATTERN.search(suffix):
                return None
            matches.append(match.group(1))
        if not matches:
            continue
        unique_values = list(dict.fromkeys(matches))
        if len(unique_values) == 1:
            return unique_values[0]
        return None

    bare_number_match = LEADING_BARE_NUMBER_PATTERN.match(sanitized_markdown_text)
    if bare_number_match:
        return bare_number_match.group(1)

    if REFUSAL_PATTERN.search(text):
        return "refusal"

    return None


def extract_decision_code(transcript_content: dict[str, Any]) -> str:
    """
    Extract numeric decision code (positive integer) from transcript.

    Looks for "Rating: X" format first (structured response from probe).
    Falls back to finding first positive integer in the response.

    Returns "other" if no clear rating/refusal found.
    """
    turns = transcript_content.get("turns", [])

    # Combine all target responses
    full_text = ""
    for turn in turns:
        response = turn.get("targetResponse", "")
        if response:
            full_text += response + "\n"

    result = extract_decision_code_from_text(full_text)
    return result if result else "other"
