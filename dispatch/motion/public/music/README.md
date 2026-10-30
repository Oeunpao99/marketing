# Background music for Remotion videos

The `contentflow-*.mp3` tracks here are original music composed and
synthesized by `tools/make_music.py` (no samples or third-party recordings), so
they carry no licence restrictions. Re-run it from `dispatch/backend` with
`uv run python ../motion/tools/make_music.py` to rebuild them.

You can add more: put royalty-free MP3s (licensed for commercial use, e.g. Pixabay Music or CC0
tracks) into the folder for their mood:

| Folder      | Use for                                        |
|-------------|------------------------------------------------|
| `upbeat`    | energetic promos, offers, product launches     |
| `calm`      | tips, how-tos, care / wellness                 |
| `warm`      | stories, community, thank-yous, local moments  |
| `corporate` | B2B, tech, services, explainers                |
| `festive`   | holidays, Khmer New Year, Pchum Ben, sales     |
| `cinematic` | launch films, big reveals, event screens (60 s and 2 min, in sections) |
| `tech`      | technology, apps, SaaS, AI, how-it-works (65 s and 2 min, in sections) |
| `learning`  | lessons, teaching, tips, training — a curious marimba            |
| `event`     | events, openings, workshops, countdowns — a dance beat with stabs |
| `promo`     | offers, discounts, claim a deal — a bouncy pluck hook            |
| `launch`    | product launches — tease, build, drop (in sections, ~40 s to 2 min) |

The sound effects follow the mood too (motion/src/sfx.jsx): a lesson turns pages and
chimes, an offer rings the till and drops coins, an event cheers its close, a launch
drops the bass on its reveal.

The AI picks the mood for each video from the folders that have tracks
(backend app/motion.py `music_tracks`); a track at least as long as the video is
picked when the mood has one (`track_for`), else the longest. Keep each
file under ~5 MB. Keep a note of where each track came from and its licence.
