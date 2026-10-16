---
name: beast
description: This repository is coordinated with Beast (DeSciX/daita-beast). In a Claude Code cloud session nothing installs plugins, so this committed skill points at the plugin; load it for any decision, status, inbox, board or seat act, and at the start of every session in this repo.
---

# beast — the pointer for cloud sessions

The plugin is not installed here; its scripts are run from a shallow clone and its verbs are read from the clone:
```
test -d "$HOME/daita-beast" && git -C "$HOME/daita-beast" pull -q || git clone --depth 1 https://github.com/DeSciX/daita-beast "$HOME/daita-beast"
```
Scripts: `$HOME/daita-beast/plugin/scripts/<verb>.sh`. Each verb's text: `$HOME/daita-beast/plugin/skills/<verb>/SKILL.md`; the surface rules: `$HOME/daita-beast/plugin/skills/install/SKILL.md` section B. This repo's seats: `.beast/roster.json`; your label is the one the person gave you.

First acts, every wake, in this order: `seats.sh record <LABEL> "<ListAgents name>"`, `decision.sh inbox <LABEL>` (computed from acks on GitHub, nothing local), act, then `ack.sh <row> --seat <LABEL> --state seen|executed|blocked --next "…"` for each row; `resume.sh <LABEL>`.

Limits of this surface: GitHub REST only (Projects verbs refuse, board pinning warns), only repositories attached to this session, nothing is pushed in (the inbox at each wake is the whole hearing), no relay. On a local machine install the plugin instead: `/plugin marketplace add DeSciX/DAITA`, `/plugin install daita-beast@daita`, then `/daita-beast:install`.
