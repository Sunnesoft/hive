# What a blind reader is asked

The reviews are scored by readers who do not know whose answer they read: a separate model session gets a folder with
the contract, the audit's findings and the answers under random names, and this text with the braces filled in. Two
readers read every folder, in different order of the answers; [score.ts](score.ts) turns what they write into the
numbers. The measures and where they come from are in [README.md](README.md), "How a review is measured".

---

You are a careful reader scoring security audit answers. Read-only task: do not modify or create any files, do not run any code from the folder, do not use the network.

Folder: {FOLDER}

It holds:
- `contract.rs` (or `contract.sol`) — the source files of a smart contract, joined into one file with `// ===== file: ... =====` markers. {WHAT} Read it first, in full: you will judge claims against it.
- `findings.md` — {N} reference findings from the audit report published for this contract, numbered 1 to {N} (each with the report's severity and its number in the report). The auditors reviewed exactly this code, so treat each reference finding as true of it.
- {COUNT} answers, each an audit of that contract written by a different system: {NAMES}. You do not know who wrote which and must not guess. Read every answer in full (in parts if long).

How answers are laid out. An answer has a main list of findings (headed "Findings", or simply a list). Some items carry a line "*Sorted with "..." above as the same finding; kept apart in case it is not.*" (they are still items of their own) or a line "The same was raised as: ..." listing other wordings. An answer may have a part headed "Not confirmed" (some entries given whole under headings like "### 27. High, not confirmed: ...", some as one-line bullets): that part is NOT the main list.

## 1. The reference findings

For EACH answer and EACH of the {N} reference findings give one letter:
- `S` = STATED: the answer states this flaw as an item of its own in its main list — the same flaw with the same mechanism as the reference finding, not merely a neighbouring one. The test: would fixing what the item describes also fix what the reference finding describes? Lenient on wording, strict on the kind of flaw, its cause and its place: being in the same function or having a similar effect is not enough. An item that names the place but gets the mechanism or its direction wrong is not S.
- `L` = stated as an item of its own ONLY in the "Not confirmed" part.
- `P` = mentioned only in passing inside another item (including only in a "The same was raised as" or "Its check said" line), or stated and then taken back, or only half of the mechanism.
- `A` = absent.

Where a reference finding has two halves, an item that states one half fully counts as S, and you say in the remarks which half. For each S or L, quote the exact words (5 to 25 words) from that answer's file that your verdict rests on, and make sure the quote really is in THAT file (re-open the file to check; mixing up files is the commonest mistake in this task).

## 2. Every item of the main list

For EACH answer, go through its main list item by item (not the "Not confirmed" part) and classify every item, judging from the source in the folder. Use the answer's own numbers; if its items have no numbers, number them 1, 2, 3... in the order they appear. For each item write `<number>:<severity>:<kind>`:
- severity as the answer rates it: `C` Critical, `H` High, `M` Medium, `L` Low, `I` informational or unrated;
- kind:
  - `M<n>` — it states reference finding n (the same test as for S);
  - `R` — a real flaw of this contract that the reference findings do not list: the code does what the item says, and somebody gains, somebody loses or something stops working;
  - `N` — what it says of the code is true, and it is no flaw: by design, harmless, a note on style, a missing nicety;
  - `W` — wrong: the code refutes it (a check, a restore or a revert it overlooks; code that is not as described; an attack that cannot run);
  - `D<k>` — the same claim as item k earlier in this same answer (give the earlier item's number). Different wordings of one claim are D; two different flaws in one function are not.

## Reply in exactly this form, one block per answer, in the order {ORDER}:

## <NAME>
verdicts: <{N} letters, for references 1..{N}>
items: <number>:<severity>:<kind> <number>:<severity>:<kind> ...        (all on one line)
unconfirmed: <how many entries the "Not confirmed" part has; 0 if none>  real: <how many of them are real flaws>
cut: <yes|no: does the answer break off mid-way at its end>
quotes:
1: "<quote>" (item <number>)        (one line per reference finding that got S or L)
wrong: <item number> <why, in a few words>; <item number> <why>; ...        (every W item)

After the blocks add at most six lines of remarks if something was hard to judge. Nothing else.
