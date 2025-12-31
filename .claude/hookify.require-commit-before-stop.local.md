---
name: require-commit-before-stop
enabled: true
event: stop
action: block
pattern: .*
---

**Uncommitted changes detected!**

You must stage and commit all changes before completing your turn.

**Required steps:**
1. Run `git status` to see uncommitted changes
2. Stage relevant files with `git add`
3. Create a descriptive commit with `git commit`
4. Then you may complete your response

This rule ensures work is saved after each agent turn.
