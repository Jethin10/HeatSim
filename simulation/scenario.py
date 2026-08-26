from __future__ import annotations

from dataclasses import dataclass, asdict
import math


@dataclass(frozen=True)
class Cell:
    x: int
    y: int
    land: str
    building_height: float
    albedo: float
    vegetation: float
    activity: float
    radiation: float
    storage: float
    et_deficit: float
    ventilation: float

    def to_dict(self) -> dict:
        return asdict(self)


@dataclass(frozen=True)
class Scenario:
    id: str
    name: str
    width: int
    height: int
    cell_m: int
    ambient_temp: float
    humidity: float
    wind_speed: float
    wind_direction_deg: float
    cells: tuple[Cell, ...]

    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "name": self.name,
            "width": self.width,
            "height": self.height,
            "cell_m": self.cell_m,
            "ambient_temp": self.ambient_temp,
            "humidity": self.humidity,
            "wind_speed": self.wind_speed,
            "wind_direction_deg": self.wind_direction_deg,
            "cells": [c.to_dict() for c in self.cells],
        }


def _inside(x: int, y: int, x0: int, y0: int, x1: int, y1: int) -> bool:
    return x0 <= x <= x1 and y0 <= y <= y1


def _shadow_factor(x: int, y: int, buildings: list[tuple[int, int, int, int, float]]) -> float:
    # Afternoon sun from south-west. Nearby tall buildings cast an intentionally
    # simple screening proxy. This is not a ray-traced solar model.
    shade = 0.0
    for x0, y0, x1, y1, h in buildings:
        for step in range(1, 6):
            sx = x - step
            sy = y + step // 2
            if _inside(sx, sy, x0, y0, x1, y1):
                shade = max(shade, min(0.58, 0.09 * step + h / 120.0))
    return shade


def make_demo_scenario(width: int = 28, height: int = 20) -> Scenario:
    buildings = [
        (2, 2, 7, 6, 18.0),
        (10, 1, 14, 5, 24.0),
        (18, 2, 25, 6, 30.0),
        (2, 10, 8, 15, 20.0),
        (12, 10, 17, 17, 34.0),
        (21, 11, 26, 16, 22.0),
    ]

    cells: list[Cell] = []
    for y in range(height):
        for x in range(width):
            land = "open"
            building_height = 0.0
            if x in (0, 1, 8, 9, 15, 16, 17, 26, 27) or y in (7, 8, 9, 18, 19):
                land = "road"
            for x0, y0, x1, y1, h in buildings:
                if _inside(x, y, x0, y0, x1, y1):
                    land = "building"
                    building_height = h
                    break

            # Small existing green pocket and pedestrian plaza.
            if _inside(x, y, 18, 12, 20, 16) and land == "open":
                land = "vegetation"
            if _inside(x, y, 10, 6, 14, 6):
                land = "open"

            if land == "building":
                albedo = 0.20
                vegetation = 0.02
                storage = 0.84
            elif land == "road":
                albedo = 0.13
                vegetation = 0.01
                storage = 0.90
            elif land == "vegetation":
                albedo = 0.22
                vegetation = 0.78
                storage = 0.28
            else:
                albedo = 0.25
                vegetation = 0.12
                storage = 0.58

            shade = _shadow_factor(x, y, buildings)
            radiation = max(0.16, min(1.0, 0.92 - shade - 0.12 * vegetation))
            et_deficit = max(0.05, min(1.0, 0.92 - 0.90 * vegetation))

            # Western wind corridor runs through the central east-west road.
            corridor_bonus = 0.24 if y in (7, 8, 9) else 0.0
            building_penalty = 0.0
            for x0, y0, x1, y1, h in buildings:
                dx = max(x0 - x, 0, x - x1)
                dy = max(y0 - y, 0, y - y1)
                d = math.hypot(dx, dy)
                if d < 3.2:
                    building_penalty += (3.2 - d) / 3.2 * min(0.16, h / 220.0)
            ventilation = max(0.08, min(1.0, 0.58 + corridor_bonus - building_penalty))

            activity = 0.16
            if land == "road":
                activity = 0.58
            if y in (7, 8, 9):
                activity = 0.90
            if x in (8, 9, 15, 16, 17):
                activity = max(activity, 0.72)
            if _inside(x, y, 10, 6, 14, 9):
                activity = 1.0
            if land == "building":
                activity *= 0.32

            cells.append(
                Cell(
                    x=x,
                    y=y,
                    land=land,
                    building_height=building_height,
                    albedo=albedo,
                    vegetation=vegetation,
                    activity=activity,
                    radiation=radiation,
                    storage=storage,
                    et_deficit=et_deficit,
                    ventilation=ventilation,
                )
            )

    return Scenario(
        id="demo-block-a",
        name="Dense Mixed-Use Block A",
        width=width,
        height=height,
        cell_m=5,
        ambient_temp=35.0,
        humidity=0.48,
        wind_speed=2.4,
        wind_direction_deg=270.0,
        cells=tuple(cells),
    )


def get_scenario(scenario_id: str = "demo-block-a") -> Scenario:
    if scenario_id != "demo-block-a":
        raise KeyError(f"Unknown scenario: {scenario_id}")
    return make_demo_scenario()
