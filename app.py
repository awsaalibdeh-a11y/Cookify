"""Cookify — a recipe box that understands allergies.

Recipes, profile, shopping list and plan all live in the browser. The server hands over the
page and offers one endpoint, /api/import, which reads a recipe from any public recipe URL.
"""

import html
import time
import ipaddress
import json
import os
import re
import socket
from urllib.parse import urljoin, urlparse

import requests
from dotenv import load_dotenv
from urllib3.util import connection as urllib3_connection
from flask import Flask, jsonify, render_template, request

load_dotenv()
urllib3_connection.allowed_gai_family = lambda: socket.AF_INET

BASE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)

with open(os.path.join(BASE, "recipes.json"), encoding="utf-8") as fh:
    SEED = json.load(fh)

OPENAI_API_KEY = os.environ.get("OPENAI_API_KEY")
OPENAI_MODEL = os.environ.get("OPENAI_MODEL", "gpt-5")
OPENAI_REASONING_EFFORT = os.environ.get("OPENAI_REASONING_EFFORT", "minimal")
RECIPE_EFFORT = os.environ.get("RECIPE_REASONING_EFFORT", "minimal")
CATEGORY_IDS = [c["id"] for c in SEED["categories"]]

WINDOW = 3600
LIMITS = {"search": 30, "recipe": 200}
_hits = {}


def _limited(kind):
    ip = (request.headers.get("X-Forwarded-For", request.remote_addr or "?")).split(",")[0].strip()
    now = time.time()
    bucket = [t for t in _hits.get((kind, ip), []) if now - t < WINDOW]
    if len(bucket) >= LIMITS[kind]:
        _hits[(kind, ip)] = bucket
        return True
    bucket.append(now)
    _hits[(kind, ip)] = bucket
    return False


class AIError(Exception):
    def __init__(self, message, status=502):
        super().__init__(message)
        self.status = status


def _ask(system, user, max_tokens, effort=None):
    if not OPENAI_API_KEY:
        raise AIError("AI search isn't set up on this server yet.", 503)
    resp = None
    for attempt in range(2):
        try:
            resp = requests.post(
                "https://api.openai.com/v1/chat/completions",
                headers={"Content-Type": "application/json", "Authorization": f"Bearer {OPENAI_API_KEY}"},
                json={
                    "model": OPENAI_MODEL,
                    "reasoning_effort": effort or OPENAI_REASONING_EFFORT,
                    "max_completion_tokens": max_tokens,
                    "response_format": {"type": "json_object"},
                    "messages": [{"role": "system", "content": system}, {"role": "user", "content": user}],
                },
                timeout=(6, 14),
            )
            break
        except requests.RequestException:
            if attempt:
                raise AIError("Couldn't reach the AI service. Try again shortly.")
    if not resp.ok:
        app.logger.error("OpenAI error: %s", resp.text[:500])
        raise AIError("The AI service returned an error. Try again shortly.")
    raw = resp.json().get("choices", [{}])[0].get("message", {}).get("content", "")
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        raise AIError("The AI gave a response I couldn't read. Try rephrasing.")


def _restrictions(profile):
    profile = profile if isinstance(profile, dict) else {}
    allergens = [str(a)[:40] for a in (profile.get("allergens") or [])[:12]]
    avoid = [str(a)[:40] for a in (profile.get("avoid") or [])[:12]]
    diet = str(profile.get("diet") or "none")[:20]
    parts = []
    if allergens:
        parts.append("ALLERGIES (life-threatening, no trace ingredient or derivative may appear): " + ", ".join(allergens))
    if diet not in ("", "none"):
        parts.append("Diet: " + diet)
    if avoid:
        parts.append("Also avoid: " + ", ".join(avoid))
    return "; ".join(parts) or "none"


SEARCH_PROMPT = """You are the recipe search engine inside a cooking app. Turn the user's request into a set of real, well-known, cookable recipe ideas.
Decide HOW MANY to return from how specific the request is:
- names one exact dish (e.g. "chicken alfredo", "banana bread"): 1 recipe (2 at most if there are two classic versions)
- specific but with room for variety (e.g. "chicken thigh dinners", "vegan lentil soup"): 3 to 5
- broad (e.g. "soup", "dinner ideas", "breakfast"): 6 to 10
Never more than 10. Titles must be distinct.
User restrictions: {restrictions}. Every recipe MUST fully respect them; never suggest a dish that normally needs a restricted ingredient unless the title states the safe version (e.g. "Dairy-Free Alfredo").
Return ONLY JSON: {{"intro": "one friendly sentence, max 14 words", "recipes": [{{"title": str, "emoji": one food emoji, "category": one of {cats}, "minutes": int total time, "serves": int, "blurb": "max 14 words, appetising"}}]}}"""

RECIPE_PROMPT = """You write one complete home-cooking recipe as JSON.
User restrictions: {restrictions}. Obey them strictly: use no restricted ingredient or derivative, and pick safe versions of sauces, broths and seasonings.
Format rules:
- "ingredients": 6 to 14 strings. Start each with a number and a US unit (cup, tbsp, tsp, oz, lb) or a count, e.g. "2 cups all-purpose flour", "1 lb chicken thighs, cubed". Only pantry basics like salt may use "to taste".
- "steps": 4 to 8 short imperative steps; include times like "10 minutes" and temperatures where relevant.
Return ONLY JSON: {{"ingredients": [str], "steps": [str]}}"""


def _int(value, default):
    try:
        return max(0, int(value))
    except (TypeError, ValueError):
        return default


@app.route("/api/search", methods=["POST"])
def api_search():
    body = request.get_json(silent=True) or {}
    query = str(body.get("query", "")).strip()[:200]
    if len(query) < 2:
        return jsonify(error="Type what you feel like cooking."), 400
    if _limited("search"):
        return jsonify(error="You've searched a lot this hour. Try again later."), 429
    try:
        data = _ask(SEARCH_PROMPT.format(restrictions=_restrictions(body.get("profile")), cats=", ".join(CATEGORY_IDS)),
                    query, 2500)
    except AIError as exc:
        return jsonify(error=str(exc)), exc.status
    out = []
    for r in (data.get("recipes") or [])[:10]:
        title = str(r.get("title", "")).strip()[:90]
        if not title:
            continue
        out.append({"title": title, "emoji": str(r.get("emoji") or "🍽️")[:4],
                    "cat": r.get("category") if r.get("category") in CATEGORY_IDS else "sides",
                    "time": _int(r.get("minutes"), 0), "serves": _int(r.get("serves"), 4) or 4,
                    "blurb": str(r.get("blurb", ""))[:120]})
    if not out:
        return jsonify(error="No recipes came back. Try different words."), 502
    return jsonify(intro=str(data.get("intro", ""))[:140], recipes=out)


@app.route("/api/recipe", methods=["POST"])
def api_recipe():
    body = request.get_json(silent=True) or {}
    title = str(body.get("title", "")).strip()[:90]
    if not title:
        return jsonify(error="Missing title."), 400
    if _limited("recipe"):
        return jsonify(error="Too many requests this hour."), 429
    blurb = str(body.get("blurb", ""))[:140]
    try:
        data = _ask(RECIPE_PROMPT.format(restrictions=_restrictions(body.get("profile"))),
                    f"Recipe: {title}. Note: {blurb}. Serves {_int(body.get('serves'), 4) or 4}.", 3500, RECIPE_EFFORT)
    except AIError as exc:
        return jsonify(error=str(exc)), exc.status
    ings = [str(i).strip()[:160] for i in (data.get("ingredients") or []) if str(i).strip()][:20]
    steps = [str(s).strip()[:400] for s in (data.get("steps") or []) if str(s).strip()][:12]
    if not ings or not steps:
        return jsonify(error="The recipe came back incomplete."), 502
    return jsonify(ingredients=ings, steps=steps)

ASSET_VERSION = str(int(max(
    os.path.getmtime(os.path.join(app.static_folder, name)) for name in ("app.js", "style.css")
)))


@app.route("/")
def index():
    return render_template("index.html", seed=SEED, v=ASSET_VERSION)


@app.route("/healthz")
def healthz():
    return {"ok": True}


UA = {"User-Agent": "Mozilla/5.0 (compatible; CookifyRecipeImporter/1.0)", "Accept": "text/html,*/*"}


def _is_public(host):
    try:
        infos = socket.getaddrinfo(host, None)
    except OSError:
        return False
    return bool(infos) and all(ipaddress.ip_address(i[4][0]).is_global for i in infos)


def _fetch(url):
    for _ in range(4):
        parts = urlparse(url)
        if parts.scheme not in ("http", "https") or not parts.hostname or not _is_public(parts.hostname):
            raise ValueError("That address can't be imported.")
        resp = requests.get(url, headers=UA, timeout=10, allow_redirects=False, stream=True)
        if resp.is_redirect:
            url = urljoin(url, resp.headers.get("Location", ""))
            continue
        resp.raise_for_status()
        raw = resp.raw.read(2_500_000, decode_content=True)
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            return raw.decode(resp.encoding or "latin-1", "replace")
    raise ValueError("Too many redirects.")


def _clean(text):
    text = re.sub(r"<[^>]+>", " ", str(text))
    return re.sub(r"\s+", " ", html.unescape(text)).strip()


def _find_recipe(node):
    if isinstance(node, list):
        for item in node:
            found = _find_recipe(item)
            if found:
                return found
    elif isinstance(node, dict):
        kind = node.get("@type")
        kinds = kind if isinstance(kind, list) else [kind]
        if "Recipe" in kinds:
            return node
        for key in ("@graph", "mainEntity", "mainEntityOfPage"):
            if key in node:
                found = _find_recipe(node[key])
                if found:
                    return found
    return None


def _steps(node):
    out = []
    if isinstance(node, str):
        out.append(_clean(node))
    elif isinstance(node, list):
        for item in node:
            out.extend(_steps(item))
    elif isinstance(node, dict):
        if "itemListElement" in node:
            out.extend(_steps(node["itemListElement"]))
        elif node.get("text"):
            out.append(_clean(node["text"]))
        elif node.get("name"):
            out.append(_clean(node["name"]))
    return [s for s in out if s]


def _minutes(iso):
    m = re.match(r"P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?", str(iso or ""))
    if not m:
        return 0
    d, h, mi = (int(x or 0) for x in m.groups())
    return d * 1440 + h * 60 + mi


def _image(node):
    if isinstance(node, list) and node:
        node = node[0]
    if isinstance(node, dict):
        node = node.get("url")
    return node if isinstance(node, str) and node.startswith("http") else ""


@app.route("/api/import", methods=["POST"])
def import_recipe():
    url = str((request.get_json(silent=True) or {}).get("url", "")).strip()
    if not re.match(r"^https?://", url, re.I):
        return jsonify(error="Paste a full web address starting with http:// or https://"), 400
    try:
        page = _fetch(url)
    except ValueError as exc:
        return jsonify(error=str(exc)), 400
    except requests.RequestException:
        return jsonify(error="Couldn't reach that page. Some sites block automated readers."), 502

    recipe = None
    for block in re.findall(r"<script[^>]+ld\+json[^>]*>(.*?)</script>", page, re.S | re.I):
        try:
            recipe = _find_recipe(json.loads(block.strip()))
        except ValueError:
            continue
        if recipe:
            break
    if not recipe:
        return jsonify(error="No recipe data found on that page. Try adding it by hand."), 422

    yield_raw = recipe.get("recipeYield")
    if isinstance(yield_raw, list):
        yield_raw = yield_raw[0] if yield_raw else ""
    serves = re.search(r"\d+", str(yield_raw or ""))
    return jsonify(
        title=_clean(recipe.get("name", "")),
        image=_image(recipe.get("image")),
        serves=int(serves.group()) if serves else 4,
        time=_minutes(recipe.get("totalTime") or recipe.get("cookTime")),
        source=urlparse(url).hostname.replace("www.", ""),
        ingredients=[_clean(i) for i in recipe.get("recipeIngredient", []) if _clean(i)],
        steps=_steps(recipe.get("recipeInstructions", [])),
    )


if __name__ == "__main__":
    app.run(host="127.0.0.1", port=int(os.environ.get("PORT", 5065)), debug=False)
