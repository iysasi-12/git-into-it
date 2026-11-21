---
description: Review a teammate's pull request in a teaching style
argument-hint: <pr-number>
---

Review pull request #$ARGUMENTS. The author is probably a first-year student on our hackathon team, so the review should teach, not just judge.

1. Read the PR: `gh pr view $ARGUMENTS` and `gh pr diff $ARGUMENTS`. Find which task it is (F1–F5 or D1–D5) and read that task's "Done when" in `docs/student-1-guide.md` or `docs/student-2-guide.md`.
2. Check it out and verify: `gh pr checkout $ARGUMENTS`, then `npm install`, `npm run typecheck` and `npm test`. Afterwards, `git checkout main`.
3. Check the project rules in CLAUDE.md, especially:
   - the frontend never calculates costs (adding up server line items is fine)
   - `engine/` never imports `ai/`
   - test expectations are worked out by hand, not copied from the code's output
   - nothing touches files outside the task's area without a reason
4. Report back to me (do NOT post anything yet):
   - **Verdict:** approve / approve with nits / request changes, plus one sentence why.
   - **Does it meet "Done when"?** Yes or no, for each criterion.
   - **Up to 5 comments,** most important first. Each one gives `file:line`, what to change, and *why*, explained for a first-year student. Point the direction; don't write the full fix.
   - **One thing they did well** (specific).
5. Ask me before posting. If I approve, post it as one review with `gh pr review $ARGUMENTS` (`--approve`, `--comment` or `--request-changes`), with the comments in the body.
