# Judge Demo

## The experience

The judge receives a constrained city-cooling challenge instead of watching a dashboard.

1. Open a dense city block in Thermal view.
2. Click a hotspot and inspect its mechanism profile.
3. Give the judge a fixed budget and water allowance.
4. Let them place trees, water, cool roofs and cool pavement.
5. Animate the spatial thermal response after every placement.
6. Record the judge's exposure reduction.
7. Ask: "Can HeatRx beat you with the same resources?"
8. Run optimization while periodically rendering the current best candidate.
9. Reveal the optimized plan and before/after field.
10. Click recommendations to explain why they were selected and show rejected placements where relevant.

## MVP acceptance criteria

- Playable grid with hover/click interaction.
- Continuous-looking thermal field or convincing interpolated grid.
- Four intervention types.
- Spatial response, not single-cell temperature subtraction.
- Budget and water constraints.
- Human exposure metric.
- Backend simulation endpoint.
- Optimizer returns a demonstrably better plan than a baseline on at least one controlled scenario.
- Before/after comparison.

## Validation before claims

Never present placeholder cooling numbers as measured results. Benchmark random placement, hotspot-only placement, greedy placement and HeatRx optimization using the same constraints. Report exposure reduction, temperature reduction, water use, cost and cooling per rupee.
