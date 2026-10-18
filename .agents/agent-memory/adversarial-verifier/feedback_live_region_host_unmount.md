---
name: live-region-host-unmount
description: Announcements and focus moves living in a component the same action can unmount (page swaps the component) never run; probe the swap, not only the in-place update
metadata:
  type: feedback
---

When a status live region or a focus move sits inside a component, check whether the action's revalidated page can replace that component (for example a chat dropped with its last note). If it can, rerender with the replacement tree after the action answers and assert the announcement and focus.

**Why:** In the notes-chat review the "Nota eliminata" status and the focus fallback lived in CustomerChat, which the server replaces with CustomerNewChat when the last note goes. The existing tests only covered in-place updates and missed it.

**How to apply:** For any "announce X after action Y" criterion, enumerate the server outcomes of Y (in place, list shrinks, container removed) and write one probe per outcome. Use the RTL `rerender` with the replacement component.
