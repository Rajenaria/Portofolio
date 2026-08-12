#!/usr/bin/env python3
"""
Development utility: keeps Image/ stocked with lightweight mobile WebP
versions of every large photo, and (optionally) wraps plain <img> tags
in the site's HTML with a <picture><source media="(max-width:650px)">
so new images get the same "mobile WebP / desktop original" behavior
as the existing ones, without any manual editing.

Usage (run from the project root, with the venv active):

    python scripts/optimize-mobile-images.py
        Scan Image/, create/update mobile WebP files for anything that
        needs it, and print a dry-run report of which <img> tags in the
        HTML *could* be wrapped in <picture> (nothing is written to the
        HTML files in this mode).

    python scripts/optimize-mobile-images.py --apply-html
        Same as above, but also rewrites the HTML files to wrap the
        <img> tags found by the audit. Every existing attribute on the
        <img> is preserved byte-for-byte; only a <picture><source>
        wrapper is added around it. Already-wrapped images and images
        with no mobile WebP counterpart are left untouched.

    python scripts/optimize-mobile-images.py --images-only
        Only regenerate mobile images, skip the HTML audit entirely.

    python scripts/optimize-mobile-images.py --html-only [--apply-html]
        Only run the HTML audit (optionally applying it), skip image
        generation.

First-time setup (already done in this repo's .venv):
    python -m venv .venv
    ./.venv/Scripts/python.exe -m pip install -r requirements.txt

Workflow after adding a new image, e.g. Image/project-ai.png:
    1. Drop the file into Image/.
    2. Reference it normally in the HTML: <img src="Image/project-ai.png" ...>
    3. Run: python scripts/optimize-mobile-images.py --apply-html
    4. Done — the new image gets a project-ai-mobile.webp and the <img>
       is wrapped in <picture> automatically. Re-run any time; anything
       already up to date is skipped.
"""

import argparse
import re
import sys
from pathlib import Path

try:
    from PIL import Image
except ImportError:
    sys.exit(
        "Pillow is not installed in this environment.\n"
        "Run: ./.venv/Scripts/python.exe -m pip install -r requirements.txt"
    )

ROOT = Path(__file__).resolve().parent.parent
IMAGE_DIR = ROOT / "Image"

# Images at or under this file size are treated as small icons/logos and
# left alone (matches every icon/logo already in Image/, which are all
# well under this line; every real photo in the repo is well above it).
MIN_SIZE_KB = 150

# Images with both dimensions at or under this are also treated as
# icons/logos regardless of file size (extra safety net).
MIN_DIMENSION_PX = 500

MAX_WIDTH_PX = 1100
TARGET_KB = 400
QUALITY_START = 82
QUALITY_MIN = 65
QUALITY_STEP = 5

SOURCE_EXTENSIONS = {".png", ".jpg", ".jpeg"}

MOBILE_BREAKPOINT_CSS = "(max-width: 650px)"

# HTML files this script is allowed to scan/rewrite for the auto-wrap
# feature. Uses a glob so new Project/*.html pages are picked up too.
HTML_GLOBS = ["index.html", "Project/*.html"]


def format_size(num_bytes: int) -> str:
    kb = num_bytes / 1024
    if kb >= 1024:
        return f"{kb / 1024:.1f} MB"
    return f"{kb:.0f} KB"


def mobile_name_for(original_name: str) -> str:
    """original.png / "project 3.png" / "Profil 1.png" -> kebab-case-mobile.webp"""
    stem = Path(original_name).stem
    slug = stem.strip().lower()
    slug = re.sub(r"[^a-z0-9]+", "-", slug)
    slug = re.sub(r"-+", "-", slug).strip("-")
    return f"{slug}-mobile.webp"


def is_already_mobile_file(path: Path) -> bool:
    return "-mobile" in path.stem.lower() or path.suffix.lower() == ".webp"


def should_skip_small(path: Path) -> bool:
    if path.stat().st_size < MIN_SIZE_KB * 1024:
        return True
    try:
        with Image.open(path) as im:
            w, h = im.size
    except Exception:
        return True
    return max(w, h) <= MIN_DIMENSION_PX


def iter_source_images():
    for path in sorted(IMAGE_DIR.iterdir()):
        if not path.is_file():
            continue
        if path.suffix.lower() not in SOURCE_EXTENSIONS:
            continue
        if is_already_mobile_file(path):
            continue
        yield path


def encode_mobile_webp(src_path: Path, out_path: Path) -> int:
    with Image.open(src_path) as im:
        im.load()
        has_alpha = im.mode in ("RGBA", "LA") or (
            im.mode == "P" and "transparency" in im.info
        )
        im = im.convert("RGBA") if has_alpha else im.convert("RGB")

        if im.width > MAX_WIDTH_PX:
            new_height = round(im.height * (MAX_WIDTH_PX / im.width))
            im = im.resize((MAX_WIDTH_PX, new_height), Image.LANCZOS)

        quality = QUALITY_START
        data = None
        while True:
            import io

            buf = io.BytesIO()
            im.save(buf, format="WEBP", quality=quality, method=6)
            data = buf.getvalue()
            if len(data) / 1024 <= TARGET_KB or quality <= QUALITY_MIN:
                break
            quality -= QUALITY_STEP

    out_path.write_bytes(data)
    return len(data)


def print_report_line(tag: str, filename: str, detail: str) -> None:
    prefix = f"[{tag}] "
    indent = " " * len(prefix)
    print(f"{prefix}{filename}")
    for i, line in enumerate(detail.split("\n")):
        print(f"{indent}{line}")
    print()


def run_image_pass() -> dict:
    """Returns {original_path: mobile_path} for every source image that
    currently has an up-to-date (or freshly generated) mobile version,
    for use by the HTML audit pass."""

    if not IMAGE_DIR.is_dir():
        sys.exit(f"Image directory not found: {IMAGE_DIR}")

    mobile_map = {}
    any_output = False

    for src_path in iter_source_images():
        if should_skip_small(src_path):
            continue

        mobile_name = mobile_name_for(src_path.name)
        mobile_path = IMAGE_DIR / mobile_name
        mobile_map[src_path] = mobile_path

        if not mobile_path.exists():
            before = src_path.stat().st_size
            after = encode_mobile_webp(src_path, mobile_path)
            print_report_line(
                "NEW",
                src_path.name,
                f"{format_size(before)} -> {mobile_name} {format_size(after)}",
            )
            any_output = True
            continue

        if src_path.stat().st_mtime > mobile_path.stat().st_mtime:
            encode_mobile_webp(src_path, mobile_path)
            print_report_line(
                "UPDATED", src_path.name, "original changed, mobile regenerated"
            )
            any_output = True
            continue

        print_report_line("SKIP", src_path.name, "mobile version already up-to-date")
        any_output = True

    if not any_output:
        print("No source images found in Image/ (or everything was filtered out).\n")

    return mobile_map


# ---------------------------------------------------------------------------
# HTML auto-wrap audit
# ---------------------------------------------------------------------------

PICTURE_BLOCK_RE = re.compile(r"<picture\b[^>]*>.*?</picture\s*>", re.IGNORECASE | re.DOTALL)
IMG_TAG_RE = re.compile(r'<img\b(?:"[^"]*"|\'[^\']*\'|[^>])*?>', re.IGNORECASE | re.DOTALL)
SRC_ATTR_RE = re.compile(r'\bsrc\s*=\s*"([^"]*)"|\bsrc\s*=\s*\'([^\']*)\'', re.IGNORECASE)
LEADING_WS_RE = re.compile(r"([ \t]*)$")


def find_excluded_ranges(text: str):
    return [m.span() for m in PICTURE_BLOCK_RE.finditer(text)]


def in_excluded_range(pos: int, ranges) -> bool:
    return any(start <= pos < end for start, end in ranges)


def extract_src(img_tag_text: str):
    m = SRC_ATTR_RE.search(img_tag_text)
    if not m:
        return None
    return m.group(1) if m.group(1) is not None else m.group(2)


def resolve_mobile_srcset(src_value: str):
    """"Image/foo.png" -> ("Image/", "foo.png") ; "../Image/foo.png" -> ("../Image/", "foo.png")"""
    m = re.match(r"^(.*Image/)([^/]+)$", src_value)
    if not m:
        return None
    prefix, filename = m.group(1), m.group(2)
    mobile_name = mobile_name_for(filename)
    if not (IMAGE_DIR / mobile_name).exists():
        return None
    return f"{prefix}{mobile_name}"


def build_wrapped_block(original_text: str, indent: str, mobile_srcset: str) -> str:
    inner_indent = indent + "    "
    return (
        f"{indent}<picture>\n\n"
        f"{inner_indent}<source\n"
        f"{inner_indent}    media=\"{MOBILE_BREAKPOINT_CSS}\"\n"
        f"{inner_indent}    srcset=\"{mobile_srcset}\"\n"
        f"{inner_indent}    type=\"image/webp\"\n"
        f"{inner_indent}>\n\n"
        f"{inner_indent}{original_text}\n\n"
        f"{indent}</picture>"
    )


def audit_html_file(path: Path, apply: bool):
    text = path.read_text(encoding="utf-8")
    excluded = find_excluded_ranges(text)

    candidates = []
    for m in IMG_TAG_RE.finditer(text):
        start, end = m.span()
        if in_excluded_range(start, excluded):
            continue
        img_text = m.group(0)
        src_value = extract_src(img_text)
        if not src_value:
            continue
        mobile_srcset = resolve_mobile_srcset(src_value)
        if not mobile_srcset:
            continue
        line_start = text.rfind("\n", 0, start) + 1
        indent = LEADING_WS_RE.search(text[line_start:start]).group(1)
        candidates.append(
            {
                "start": start,
                "end": end,
                "original": img_text,
                "indent": indent,
                "mobile_srcset": mobile_srcset,
                "src": src_value,
            }
        )

    if not candidates:
        return 0

    print(f"{path.relative_to(ROOT)}:")
    for c in candidates:
        action = "WRAPPED" if apply else "CAN WRAP"
        print(f"  [{action}] {c['src']}  ->  source srcset=\"{c['mobile_srcset']}\"")
    print()

    if apply:
        # Replace from the end so earlier offsets stay valid.
        for c in sorted(candidates, key=lambda c: c["start"], reverse=True):
            wrapped = build_wrapped_block(c["original"], c["indent"], c["mobile_srcset"])
            text = text[: c["start"]] + wrapped + text[c["end"] :]
        path.write_text(text, encoding="utf-8")

    return len(candidates)


def run_html_pass(apply: bool):
    files = []
    for pattern in HTML_GLOBS:
        files.extend(sorted(ROOT.glob(pattern)))

    heading = "Applying <picture> wrap to HTML" if apply else "HTML <picture> audit (dry run)"
    print(f"{heading}\n{'-' * len(heading)}")

    total = 0
    for path in files:
        total += audit_html_file(path, apply)

    if total == 0:
        print("No <img> tags found that need wrapping.\n")
    elif not apply:
        print(f"{total} <img> tag(s) could be wrapped. Re-run with --apply-html to apply.\n")
    else:
        print(f"{total} <img> tag(s) wrapped.\n")


def main():
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument(
        "--apply-html",
        action="store_true",
        help="Actually rewrite HTML files with <picture> wrappers (default: dry-run report only).",
    )
    parser.add_argument("--images-only", action="store_true", help="Skip the HTML audit/wrap step.")
    parser.add_argument("--html-only", action="store_true", help="Skip image generation, only run the HTML step.")
    args = parser.parse_args()

    if not args.html_only:
        print("Optimizing mobile images in Image/\n" + "-" * 34)
        run_image_pass()

    if not args.images_only:
        run_html_pass(apply=args.apply_html)


if __name__ == "__main__":
    main()
