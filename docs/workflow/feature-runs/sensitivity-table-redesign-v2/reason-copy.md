# Pressure Response Null Reason Copy

Use these exact hover messages when `pressureResponse.value` is null.

| Reason | Hover copy |
|---|---|
| `directional-thin` | No cells with N >= 3 trials where the prompt clearly pushes toward this value. Try adding more runs. |
| `inverted-thin` | No cells with N >= 3 trials where the prompt clearly pushes toward the other value. Try adding more runs. |
| `directional-and-inverted-thin` | Neither directional pool has cells with N >= 3 trials. This pair needs more coverage. |
| `baseline-thin` | The diagonal baseline pool has no cells with N >= 3 trials. Pressure response can still be computed from the directional pools, but baseline preference is unavailable. |
