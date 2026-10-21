---
name: operator-guide-branch-audit
description: How to check operator-facing text against a branching bulk procedure: enumerate branches, test superlatives and counts, and expect renamed labels to keep false claims
metadata:
  type: feedback
---

When a guide or dialog describes a multi-branch write (bulk assign, four cases), enumerate every branch of the procedure and check each sentence against the branch it covers. Superlatives ("l'unico caso", "sempre", "per ogni cliente") and result counts ("N contatti creati") are the usual false claims: they hold for one branch and fail for another that does the same write differently.

**Why:** a rename pass ("Assegna chiamate" to "Crea/assegna contatti") kept "per ogni cliente" and "creati" from the base text, while the procedure creates nothing in two of its four branches. An "unico caso" warning was also false because a third branch changes the same state. Both looked right when read alone.

**How to apply:** for each sentence about "what it creates / changes", map it to the if-branch in the procedure (and to the existing branch tests: their names state the expected outcome). Compare the count shown in success text with the rows the procedure actually inserts. Check whether a changed line was renamed but its claim was inherited: git show the base file and diff the wording, not only the new text.
