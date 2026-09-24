# @sudobility/music_spatial_core

Platform-agnostic engine behind the Moosiac "Spatial" 3D view: instrument
geometry, scene composition, camera/listener math, movement stepping, and
map-overlay math — shared, byte-for-byte, by `@sudobility/music_spatial`
(web) and `@sudobility/music_spatial_rn` (React Native). Depends on `three`
and `react` core only — never `react-dom` or `react-native` — so the same
build runs unmodified on both. Not yet implemented — see
[`docs/SPEC.md`](docs/SPEC.md).
