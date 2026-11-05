# SDD ledger — plan: docs/superpowers/plans/2026-11-05-selene-upgrade.md

Execution: native / isolated worktree, user consent 2026-11-05. Base 2174639bf5568b9f6dc23b1198e1eee041a31807.

Pre-flight: Tasks 1→4/5/6 share persisted review/activity shapes; use storage normalization at every boundary. Tasks 2→3/4/5/6 share manifest word keys versus loaded full words; app resolves chunks before group rendering. Tasks 3→4/5/6 share navigation, font and safe-area tokens. Tasks 1/2/6→7 share additive storage, async failures and cache namespaces; no full dictionary in initial precache.

Ruling: Ignore the worktree through the original repository's local .git/info/exclude, with the tracked .gitignore added only on the feature branch — preserves the user's main branch/history — cost if wrong: another clone needs its own ignore rule.
Ruling: Bundled execution helpers are POSIX shell scripts; use native PowerShell/Node equivalents and the same plan-scoped ledger, briefs and commit ranges if no Git Bash is available — avoids assuming WSL tooling — cost if wrong: manual bookkeeping needs explicit verification.

Tasks: 1 pending; 2 pending; 3 pending; 4 pending; 5 pending; 6 pending; 7 pending.

User addition: independently favorite confusable/synonym comparisons; notebook categories preserve source context, notes, backups and synchronization. Accepted into Tasks 1/5/6; no change to existing progress keys or canonical word data.
Task 1: in progress. BASE 1dd6dc5. Tests precede module implementation.
Task 1: complete (commits 1dd6dc5..0c9badc, tests: node --test tests/storage.test.cjs → 10/10 pass; RED observed 10 missing-function assertion failures before implementation; app/storage syntax checks pass).
Task 2: in progress. BASE 0c9badc. Generated data is a mechanical derivative, with every original field compared in tests.
Task 2: complete (commits 0c9badc..9902c9a, tests: node --test --test-reporter=spec tests/storage.test.cjs tests/data-loader.test.cjs → 15/15 pass; RED observed 5 loader/generator failures before implementation).
Task 3: in progress. BASE 9902c9a. Mobile UI tests exercise the browser, not CSS string matching.
Ruling: Implement the pure Task 4/5 learning/statistics engines before finishing Task 3's UI integration — permits real live counts/controls instead of placeholder dashboard data and avoids rewriting the application twice — cost if wrong: commit order differs, per-task completion still waits for UI verification.
Ruling: Wrong-queue completion is represented by an inactive timestamped entry, like comparison cancellation, rather than physically deleting its key — prevents stale cloud metadata resurrecting completed mistakes — cost if wrong: a small retained tombstone per practiced word.
Task 4/5 engines: RED observed 11 missing-function assertion failures before implementation. UI integration remains pending.
Task 6 sync foundation: RED observed 4 missing-function failures; extracted js/sync.js to test real KV payloads and in-flight revisions without mocking the UI. Original primary endpoint/format and LWW semantics retained.
Task 3 browser RED: 360px title measured 99px, and headword remained system sans; both intended assertions failed, existing settings/notebook route test passed.
Task 3/4/5/6 integration: first browser run passed 8/8 (UI and contextual favorites/quiz/settings). Further regression RED cases reproduced native grey example backgrounds, replaced flip DOM, focused-button rating shortcuts, and hidden unknown legacy notebook records. Each is fixed at its source, not by weakening assertions.
Task 7 SW RED: activation deleted unrelated project caches; initial precache downloaded the full dictionary; offline JSON got HTML. New SW passes these cases and retains previous cache on installation failure.
Task 6 automatic-sync RED→GREEN: merging other-device favorites on an automatic push now retains both contexts. Every automatic sync reads/merges first using the original per-word timestamp rule; extra GETs are the cost of avoiding blind overwrite.
Performance RED: Lighthouse 12.8.2 baseline P54/A96, 2893KiB, LCP15.8s; first new run P68/A100, 248KiB, LCP2.4s, CLS0, but 4.54s unattributable startup work. Homepage speech-spy RED measured 2 native speech touches before any interaction. Defer speech-engine initialization to the first pronunciation gesture; no async boundary added to speech calls.
Offline test harness finding: Chromium per-page offline emulation still let a service-worker g02 request reach the origin (observed by fixture request log). Also terminate the test origin connection to simulate genuine offline state; retain the same uncached-error and cached-success assertions.
Task 4 full-session regression RED→GREEN: the final correct retry was skipped before feedback because inactive-queue filtering ran on an already-graded question. Skip inactive retries only before grading; complete 22-attempt loop now passes, logs 20 unique words and one goal celebration.
TTS startup hypothesis did not remove the Lighthouse unattributed long task (second P67/A100); do not claim it fixed performance. The lazy first-gesture API behavior is independently verified (3/3 speech browser tests, UK first tap synchronous).
Ruling: Reveal homepage collections in batches of 12, with keyboard focus and an explicit load-more control — reduces initial DOM/AX work on phones while keeping all 134 groups and full search available — cost if wrong: one extra tap for later batches. Browser RED observed 134 initial cards instead of 12 before this implementation.
Compatible performance verification: temporary Node22.19 + Lighthouse13.6 (system Node unchanged), same Chromium153 and 360×800 simulated mobile profile. Old baseline P55/A96, LCP15.6s, 2893KiB; new P98/A100, LCP2.4s, TBT30ms, 248KiB. The uninstrumented long-task mismatch belonged to the old Lighthouse12/Chrome153 pairing; do not attribute the score jump to the unconfirmed speech/DOM hypotheses.
Task 6 mark-clear regression: RED unit and browser cases reproduced an old cloud mark returning after a local cancellation. Additive learning.clearedProgress timestamps now filter old marks during load, cloud merge and backup merge, preserving the v1 words format. A later intentional mark uses a strictly newer timestamp.
Task 7 cache-freshness RED: precache strings could reuse a still-fresh old HTTP response. New shell precache uses Request(cache=reload); migration fixture now also reproduces Pages-like max-age=600 headers.
Task 3 accessibility RED: skip-link changed the hash route, missing-group view stayed aria-busy, pronunciation labels excluded visible text. Targeted handlers/loading completion/labels fixed without changing navigation semantics.
Task 6 backup-clear RED: importing an older mark together with a new comparison could restore the cancelled word until reload. Apply combined clear timestamps during preview and import; preserve the comparison and existing activity.
Current verification: full syntax checks and all test files are running. Shared branch and production remain untouched.
Task 3: complete (commits 9902c9a..4a98cb4, UI contract: 11/11 including parent, real screenshots inspected; 360/390/430 and desktop, AA, reduced-motion and font roles).
Task 4: complete (commits 9902c9a..4a98cb4, learning engine 6/6 and full browser flow including 22 attempts, spelling/cloze rotation, double-submit guard, focused rating shortcuts).
Task 5: complete (commits 9902c9a..4a98cb4, stats 5/5 plus real event/goal browser assertions and contextual notebook flow).
Task 6: complete (commits 9902c9a..4a98cb4, storage/sync 17/17 plus browser backup, cancellation and hostile text assertions).
Task 7 local verification: all JS syntax checks and node --test --test-reporter=spec tests/*.test.cjs → 64/64 pass, 0 skipped, 62.6 seconds. Independent review and shared-branch publication checkpoint remain pending.
Ruling: Extract js/sync.js so KV merge and in-flight edits can be verified without mocking the DOM — retains the original primary protocol — cost if wrong: one extra small script request.
Ruling: Automatic pushes read and merge before writing, retaining the same per-record timestamp rule — avoids overwriting unseen other-device favorites — cost if wrong: extra GET requests per debounced sync.
Final review candidate: Base 2174639bf5568b9f6dc23b1198e1eee041a31807, HEAD 4a98cb47ea32aeac8656da2d35c7951bd5e507d4. Package review-2174639-4a98cb4.diff excludes only generated data/vendor font bytes; data-alias.diff contains the original dictionary's sole additive change, and full equivalence is tested.
Final review: fresh gpt-6-astra reviewer, read-only; no Critical, three Important, no Minor, Declined to judge empty. Accepted all three after checking real code/data.
Final review RED: real prior/saturate definitions leak answers; quiz→settings→back leaves empty card area; active worker serves next-release network HTML beside current cached script. Added actual-word, sanitized-option dedup, browser back-navigation and coherent-shell tests; observed all fail for intended reasons.
Final fix pass: mask headword references only in quiz display text and deduplicate after masking; normalize orphaned quiz mode to cards; serve active cached shell until a complete new worker activates, and bypass leftover cached scripts if shell is missing. Pure learning/SW tests are green; full suite now running.
Ruling: Leaving a quiz returns to cards rather than reconstructing a cancelled in-memory question session — completed answers and wrong-word records remain persisted — cost if wrong: returning via settings restarts the quiz UI, not the saved learning progress.
Final review minors: none. No second reviewer requested; fixes use RED→GREEN and the whole suite.
Final: fixed quiz-route blank — leaving a quiz for settings then navigating back RED→GREEN, suite 69/69.
Final: fixed self-referencing quiz leakage and post-mask duplicate options — actual prior/saturate + distinct-option tests RED→GREEN, suite 69/69; canonical word data unchanged.
Final: fixed mixed-version navigation and missing-shell recovery — coherent-shell + leftover-script tests RED→GREEN, suite 69/69.
Final fix commit: a36b7ba48d3fd90ca6326892898e8cfae61adce9. All source syntax checks and diff --check pass.
Performance correction: post-review final complete build scored 69 once, then 68/68/68; a fresh controlled browser scored 72. A100, LCP2.4s, ~250KiB remained stable. The earlier 98 score is not the final acceptance result; the native unattributed task cannot conclusively be blamed only on Lighthouse12.
Diagnostic-only isolated runs: blocking SW registration P76/A100; globally reduced motion P76/A100. Neither removes the full task. No feature was removed from production code to obtain a better score.
Checkpoint: functionality and independent-review fixes ready; default mobile Performance≥85 remains unmet. No production push/publish. Preserve the isolated branch and diagnostics pending the user's decision rather than claim complete acceptance.
