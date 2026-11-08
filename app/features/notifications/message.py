"""
A notification on its way out, and how a failure is said. They go to the browsers and phones that turned
notifications on (webpush.py), through the service worker, and nowhere else.
"""

from __future__ import annotations

from collections.abc import Callable
from dataclasses import dataclass

# The transport: (url, body, content type, headers) -> HTTP status. app.core.http.post, or a fake in tests.
Send = Callable[[str, bytes, str, dict[str, str]], int]


@dataclass(frozen=True)
class Message:
    """One notification. `event` is alert, notice (good news), summary or test."""

    event: str
    rule: str | None
    title: str
    body: str
    ts: int
    urgent: bool = False


class DeliveryError(Exception):
    """A notification that didn't go through, said in words fit to show on the page."""
