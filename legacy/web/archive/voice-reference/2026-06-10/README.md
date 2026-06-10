# Voice Reference Archive — 2026-06-10

This archive preserves the React console material that existed before rebuilding voice as a backend channel.

- `EloraConsole.jsx` is the pre-voice-channel console snapshot. It is text-first and streams through `/api/chat`.
- `Elora-System/src/voice/` did not exist in this checkout when the archive was created.
- `Elora-System/src/voiceEngine/` did not exist in this checkout when the archive was created.

New voice work should not restore standalone business logic from this archive. Voice should call the same backend agent message path as the text console and remain a channel adapter around agent messages, memory, tools, and approvals.
