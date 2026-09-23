"""MinIntervalPacer — hard-minimum spacing between calls (DESIGN_v1 §1.5, burst-free by
construction; see limits.py module docstring for why this replaces a token bucket)."""

from __future__ import annotations

from app.collection.limits import MinIntervalPacer


class FakeClock:
    def __init__(self, start: float = 0.0):
        self.now = start
        self.slept: list[float] = []

    def monotonic(self) -> float:
        return self.now

    def sleep(self, seconds: float) -> None:
        self.slept.append(seconds)
        self.now += seconds


def test_first_call_never_waits():
    clock = FakeClock()
    pacer = MinIntervalPacer(interval_s=10.0, _monotonic=clock.monotonic, _sleep=clock.sleep)
    pacer.acquire()
    assert clock.slept == []


def test_second_call_immediately_after_waits_full_interval():
    clock = FakeClock()
    pacer = MinIntervalPacer(interval_s=10.0, _monotonic=clock.monotonic, _sleep=clock.sleep)
    pacer.acquire()
    pacer.acquire()
    assert clock.slept == [10.0]


def test_call_after_a_natural_gap_waits_zero():
    clock = FakeClock()
    pacer = MinIntervalPacer(interval_s=10.0, _monotonic=clock.monotonic, _sleep=clock.sleep)
    pacer.acquire()
    clock.now += 15.0  # more time than the interval passed "naturally"
    pacer.acquire()
    assert clock.slept == []


def test_penalize_pushes_next_allowed_forward():
    clock = FakeClock()
    pacer = MinIntervalPacer(interval_s=10.0, _monotonic=clock.monotonic, _sleep=clock.sleep)
    pacer.acquire()
    pacer.penalize(60.0)
    pacer.acquire()
    # first acquire's own +10s interval is dwarfed by the 60s penalty
    assert clock.slept == [60.0]


def test_penalize_does_not_shorten_an_existing_longer_wait():
    clock = FakeClock()
    pacer = MinIntervalPacer(interval_s=100.0, _monotonic=clock.monotonic, _sleep=clock.sleep)
    pacer.acquire()
    pacer.penalize(5.0)  # shorter than the 100s interval already scheduled
    pacer.acquire()
    assert clock.slept == [100.0]
