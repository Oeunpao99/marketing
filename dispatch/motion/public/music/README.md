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

The AI picks the mood for each video from the folders that have tracks
(backend app/motion.py `music_tracks`); a track is picked at random. Keep each
file under ~5 MB. Keep a note of where each track came from and its licence.
