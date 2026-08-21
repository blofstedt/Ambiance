# Agent instructions

**Read [`CLAUDE.md`](./CLAUDE.md) first, before opening any other file.**

It is the entry point for every AI agent working in this repository, whichever
tool you are. It carries:

- who the owner is and how to talk to them (they do not read code)
- a routing table telling you the two or three files to open for a given task,
  and which ones to leave shut
- the fourteen invariants that must not be broken, each of which was a real bug
- how to verify a change before reporting it as done

This repository is ~5,000 lines. Reading it all wastes context and makes your
answers worse. Use the routing table.

This file exists so that agents looking for `AGENTS.md` by convention find their
way to the real document rather than starting cold. Do not duplicate guidance
here — `CLAUDE.md` is the single source, and two copies drift.
