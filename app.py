"""Cookify — a recipe box that understands allergies.

Recipes, profile, shopping list and plan all live in the browser. The server hands over the
page and offers one endpoint, /api/import, which reads a recipe from any public recipe URL.
"""

import html
import ipaddress
import json
import os
import re
import socket
from urllib.parse import urljoin, urlparse

import requests
from flask import Flask, jsonify, render_template, request

BASE = os.path.dirname(os.path.abspath(__file__))
app = Flask(__name__)

with open(os.path.join(BASE, "recipes.json"), encoding="utf-8") as fh:
    SEED = json.load(fh)

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
