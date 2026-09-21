#!/usr/bin/env python3
"""Build index.html = shell-head.html + screens/*.html (sorted) + shell-foot.html.

Idempotent; safe to re-run at any time. Prints the route table and warns about
duplicate ids/routes, fragments without the required data-* attributes, and
navigation targets (data-go / href="#/...") that no fragment serves.
"""
import re
import sys
from pathlib import Path

HERE = Path(__file__).resolve().parent
SCREENS = HERE / "screens"

head = (HERE / "shell-head.html").read_text(encoding="utf-8")
foot = (HERE / "shell-foot.html").read_text(encoding="utf-8")

parts, routes, ids, targets, warnings = [head], [], {}, set(), []

def strip_comments(html):
    return re.sub(r"<!--.*?-->", "", html, flags=re.S)

for name, html in (("shell-head.html", head), ("shell-foot.html", foot)):
    for i in re.findall(r'\sid="([^"]+)"', strip_comments(html)):
        ids.setdefault(i, []).append(name)

for f in sorted(SCREENS.glob("*.html")):
    raw = f.read_text(encoding="utf-8")
    html = strip_comments(raw)
    sections = re.findall(r"<section\b[^>]*\bclass=\"[^\"]*\bscreen\b[^\"]*\"[^>]*>", html)
    if len(sections) != 1:
        warnings.append(f"{f.name}: expected exactly one <section class=\"screen\">, found {len(sections)}")
    for tag in sections:
        attrs = dict(re.findall(r'(data-[\w-]+)="([^"]*)"', tag))
        for req in ("data-route", "data-title", "data-shell", "data-rail"):
            if req not in attrs:
                warnings.append(f"{f.name}: <section> lacks {req}")
        routes.append((attrs.get("data-route", "?"), attrs.get("data-title", ""), attrs.get("data-shell", ""), attrs.get("data-rail", ""), f.name))
    if re.search(r"<style\b(?![^>]*data-screen)", html):
        warnings.append(f"{f.name}: <style> without data-screen=\"<slug>\"")
    if re.search(r"<(html|head|body)\b", html):
        warnings.append(f"{f.name}: fragment must not contain <html>/<head>/<body>")
    for i in re.findall(r'\sid="([^"]+)"', html):
        ids.setdefault(i, []).append(f.name)
    for t in re.findall(r'(?:data-go|href)="#(/[^"]*)"', html):
        targets.add((t, f.name))
    parts.append(f"\n<!-- ===================== screens/{f.name} ===================== -->\n{raw.strip()}\n")
for t in re.findall(r'(?:data-go|href)="#(/[^"]*)"', strip_comments(head + foot)):
    targets.add((t, "shell"))

parts.append(foot)
out = "".join(parts)
(HERE / "index.html").write_text(out, encoding="utf-8")

seen = {}
for r in routes:
    seen.setdefault(r[0], []).append(r[4])
for r, files in seen.items():
    if len(files) > 1:
        warnings.append(f"duplicate route {r}: {', '.join(files)}")
for i, files in ids.items():
    if len(files) > 1:
        warnings.append(f"duplicate id \"{i}\": {', '.join(files)}")

def served(path):
    for r in seen:
        if r == path:
            return True
        if ":" in r:
            p, s = r.split("/"), path.split("/")
            if len(p) == len(s) and all(a.startswith(":") or a == b for a, b in zip(p, s)):
                return True
    return False

missing = sorted({t for t, _ in targets if not served(t)})
print(f"index.html written ({len(out)//1024} KB) — {len(routes)} screens\n")
print(f"{'route':34} {'shell':5} {'rail':5} {'file':26} title")
for r, title, shell, rail, fname in routes:
    print(f"{r:34} {shell:5} {rail:5} {fname:26} {title}")
if missing:
    print("\nTargets without a fragment yet (they open the placeholder):")
    for t in missing:
        print(f"  {t}  <- " + ", ".join(sorted({f for x, f in targets if x == t})))
if warnings:
    print("\nWARNINGS:")
    for w in warnings:
        print("  " + w)
sys.exit(0)
