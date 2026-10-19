#!/usr/bin/env python3
"""P5-R3b2: test-only same-origin cookie/session adapter for the R3b1 ledger.

NO login or session minting endpoint. A privileged test harness provisions
sessions in memory. NOT OIDC, production auth, SSO, or an Internet-facing app.
The browser never receives the underlying synthetic bearer token.
"""
from __future__ import annotations

import hmac
import secrets
import threading
import time
from http.cookies import SimpleCookie, CookieError
from urllib.parse import urlsplit

from p5_r3b_scoped_reference import make_handler, _validate_actor
from secure_records import loopback_origin

COOKIE_NAME = "P5ReferenceSession"
SESSION_PATH = "/api/session"
CSRF_HEADER = "X-P5-CSRF-Token"


class SyntheticSessionStore:
    """Privileged *test harness*-managed sessions, without any HTTP login API."""

    def __init__(self, *, clock=time.time, ttl_seconds=1200):
        if not callable(clock) or not isinstance(ttl_seconds, int) or not 60 <= ttl_seconds <= 86400:
            raise ValueError("Explicit bounded synthetic session lifetime required")
        self._clock = clock
        self._ttl = ttl_seconds
        self._sessions = {}
        self._lock = threading.RLock()

    def issue(self, actor):
        """Privileged only: returns an opaque cookie value, never a JS token."""
        trusted = dict(_validate_actor(dict(actor)))
        with self._lock:
            cookie = secrets.token_urlsafe(36)
            self._sessions[cookie] = {
                "actor": trusted, "csrf": secrets.token_urlsafe(32),
                "expires": self._clock() + self._ttl
            }
            return cookie

    def resolve(self, cookie):
        if not isinstance(cookie, str) or not 32 <= len(cookie) <= 128:
            return None
        with self._lock:
            # Random high-entropy cookie is an opaque lookup key. Never accept
            # identity, role or epoch from client-supplied headers or claims.
            state = self._sessions.get(cookie)
            if not state:
                return None
            if self._clock() >= state["expires"]:
                del self._sessions[cookie]
                return None
            return {"actor": dict(state["actor"]), "csrf": state["csrf"]}

    def rotate(self, old_cookie):
        """Rotate cookie+CSRF while preserving the stable authenticated actor."""
        with self._lock:
            original = self.resolve(old_cookie)
            if not original:
                raise ValueError("Session revoked or expired")
            del self._sessions[old_cookie]
            return self.issue(original["actor"])

    def change_role(self, cookie, role):
        if role not in ("reader", "writer"):
            raise ValueError("Unrecognized synthetic role")
        with self._lock:
            if not self.resolve(cookie):
                raise ValueError("Missing session")
            self._sessions[cookie]["actor"]["role"] = role

    def revoke(self, cookie):
        with self._lock:
            self._sessions.pop(cookie, None)


def cookie_attributes(origin):
    """Only a future trusted hosting layer may emit the actual Set-Cookie."""
    accepted = loopback_origin(origin)
    parts = [f"{COOKIE_NAME}={{opaque}}", "HttpOnly", "SameSite=Strict", "Path=/"]
    if urlsplit(accepted).scheme == "https":
        parts.append("Secure")
    return "; ".join(parts)


def _extract_cookie(raw):
    if not isinstance(raw, str) or len(raw) > 4096:
        return None
    # Reject multiple occurrences; parsers otherwise disagree on first/last.
    fields = raw.split(";")
    candidates = []
    for field in fields:
        key, separator, value = field.strip().partition("=")
        if separator and key == COOKIE_NAME:
            candidates.append(value.strip())
    if len(candidates) != 1:
        return None
    try:
        parsed = SimpleCookie()
        parsed.load(raw)
        value = parsed[COOKIE_NAME].value
    except (CookieError, KeyError, ValueError):
        return None
    return value if value == candidates[0] else None


def make_session_handler(db_path, app_origin, sessions, *, clock=time.time, fault=None):
    """Real SQLite ledger + server-side in-memory session in *same-origin* test.

    Existing Bearer-only R3b1 handler is extended, not modified. Its dummy
    token map is unreachable because authenticate() is overridden for all
    GET/PATCH operations. Reject cross-origin requests before touching state.
    """
    origin = loopback_origin(app_origin)
    if not isinstance(sessions, SyntheticSessionStore):
        raise ValueError("Privileged synthetic session store required")
    host = urlsplit(origin).netloc
    # Cannot expose any bearer authentication fallback via this handler:
    # the dummy value is deliberately random and never shared with clients.
    internal_token = secrets.token_urlsafe(40)
    Parent = make_handler(
        db_path, origin, {internal_token: {
            "tenantId": "sandbox-only", "subjectId": "internal-disabled",
            "sessionEpoch": "11111111-1111-4111-8111-111111111111",
            "role": "reader"
        }}, clock=clock, fault=fault
    )

    class SessionHandler(Parent):
        server_version = "FoundationP5R3b2SessionFixture/1"

        def _same_host(self):
            # Same-site is insufficient: prohibit alternate ports/hosts and
            # reject cross-origin Origin when one is present.
            incoming = self.headers.get("Origin")
            if self.headers.get("Host") != host or (incoming and incoming != origin):
                self.send(403, {"error": "Origin or Host mismatch"})
                return False
            fetch_site = self.headers.get("Sec-Fetch-Site")
            if fetch_site and fetch_site not in ("same-origin", "none"):
                self.send(403, {"error": "Cross-site session access forbidden"})
                return False
            return True

        def _session(self):
            value = _extract_cookie(self.headers.get("Cookie", ""))
            return sessions.resolve(value)

        def authenticate(self, *, writer=False):
            if not self._same_host():
                return None
            state = self._session()
            if not state:
                self.send(401, {"error": "Login session unavailable"})
                return None
            if writer and state["actor"]["role"] != "writer":
                self.send(403, {"error": "Writer permission required"})
                return None
            return state["actor"]

        def do_GET(self):
            if urlsplit(self.path).path == SESSION_PATH:
                if self.path != SESSION_PATH:
                    return self.send(404, {"error": "Not found"})
                actor = self.authenticate()
                if actor is None:
                    return
                state = self._session()
                if not state:
                    return self.send(401, {"error": "Login session unavailable"})
                return self.send(200, {
                    "identity": {
                        "tenantId": actor["tenantId"],
                        "subjectId": actor["subjectId"],
                        "sessionEpoch": actor["sessionEpoch"],
                        "role": actor["role"]
                    },
                    "csrfToken": state["csrf"]
                })
            return super().do_GET()

        def do_PATCH(self):
            # The browser sends cookies automatically, so this must be a
            # strict origin-bound anti-CSRF check BEFORE accessing the ledger.
            if not self._same_host():
                return
            if self.headers.get("Origin") != origin:
                return self.send(403, {"error": "Mutation Origin required"})
            state = self._session()
            if not state:
                return self.send(401, {"error": "Login session unavailable"})
            supplied = self.headers.get(CSRF_HEADER, "")
            if not supplied or not hmac.compare_digest(supplied, state["csrf"]):
                return self.send(403, {"error": "Current session CSRF token required"})
            return super().do_PATCH()

        def do_OPTIONS(self):
            # This adapter is genuinely same-origin, not cross-origin CORS.
            return self.send(405, {"error": "Cross-origin preflight not supported"})

    return SessionHandler
