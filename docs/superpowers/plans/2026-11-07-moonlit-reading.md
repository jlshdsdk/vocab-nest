# Moonlit Reading and Speech Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver individually folded comparisons, clear American pronunciation feedback including review sentences, and a mobile-first study view inspired by the supplied reference.

**Architecture:** Preserve the existing static app and data protocols. Use semantic nested disclosure controls for comparison entries, extend the existing synchronous speech player with playback/boundary state, and restyle the existing study surface and controls without replacing learning actions or navigation.

**Tech Stack:** Vanilla HTML/CSS/JavaScript, Web Speech API, Node test runner, isolated Chromium browser fixtures, GitHub Pages service worker.

**Spec:** `docs/superpowers/specs/2026-11-07-moonlit-reading-design.md`

## Global Constraints

- Preserve all 134 groups / 2,679 words, their definitions, existing local storage keys and cloud/backup schema.
- Preserve independent comparison favorites; notebook word pages are 30 and comparison pages 15.
- Keep existing dark/light preferences, font choice, keyboard and touch navigation, card/quiz/list and review ratings.
- Keep speech synchronous with the user gesture; select an `en-US` voice when available and do not transmit text to a new service.
- Use a real browser for interactive checks, isolate test data and never clear actual user data.
- Publish only after full regression, review, verified remote parent and coherent service-worker cache update.

## Review Focus

1. Favorite clicks on a closed comparison must neither unfold it nor change another favorite — Task 1 browser test.
2. Fast retaps, route changes, hiding the page and speech errors must stop queues and clear visual state — Task 2 browser tests.
3. No `en-US` voice or word-boundary events must not falsely promise accent/progress; the entire sentence still indicates playback — Task 2 browser tests.
4. Narrow / short viewports, long words, both themes, zoom and keyboard usage must retain reachable controls and no horizontal overflow — Task 3 browser tests and visual inspection.
5. Updating the cached shell must preserve offline shell coherence, all existing saved data and cross-device sync — Task 3 full regression and production verification.

### Task 1: Individually collapsible comparison entries

**Files:** Create `tests/relation-folds.test.cjs`; modify `js/app.js`, `css/style.css`.

**Interfaces:** Keep `relationHTML(item, kind)` and `comparisonMeaningsHTML(gid,source,related,saved)` signatures. Produce one native `details.relation-item` per relation; retain one sibling `button[data-action=favorite]` per item.

- [ ] Write a browser test that opens `#/group/g01`, asserts six closed relation disclosures, opens one, checks both meanings and its note, verifies another remains closed, and checks a favorite click works without changing disclosure state. Reopen after navigation and verify the saved star.
- [ ] Run `node --test --test-reporter=spec tests/relation-folds.test.cjs`; expect failure because relation disclosures do not yet exist.
- [ ] Update `relationHTML` and its CSS to use independently operable native disclosures with a separate favorite button; preserve existing top-level section state and all data.
- [ ] Re-run the new test plus `tests/relations-browser.test.cjs` and `tests/ux-stability.test.cjs`; expect all pass.
- [ ] Commit the verified task.

### Task 2: Individual US pronunciation and sentence feedback

**Files:** Create `tests/reading-speech.test.cjs`; modify `js/app.js`, `js/speech.js`, `css/style.css` and test fixtures only as needed.

**Interfaces:** `VocabSpeech.createPlayer(options)` continues to expose `prepare`, `play` and `stop`; `play(text,accent,origin)` optionally carries its DOM origin, and emitted state includes the origin plus a word boundary when available. `comparisonMeaningsHTML` produces one `button[data-action=speak][data-accent=us]` per individual meaning; `examplesHTML` remains reusable by review.

- [ ] Write browser tests using the existing controlled speech fixture: click each comparison term and assert its own `en-US` utterance; assert only the active target changes color during playback and returns on end/error/cancel; save and re-open the comparison and repeat. Reveal a review sentence, click it, assert American speech and whole-sentence playing feedback; send a word boundary and check the matching word, then exercise missing boundaries, rapid retaps, navigation and hidden-page cancellation.
- [ ] Run `node --test --test-reporter=spec tests/reading-speech.test.cjs`; expect failure because the individual controls and sentence playback are absent.
- [ ] Extend the player/state painting minimally, render per-term controls and the review example with the existing speech action, provide visible fallback when a populated voice list has no en-US voice, and cancel on page hide.
- [ ] Re-run the new test plus `tests/speech.test.cjs`, `tests/speech-ux.test.cjs` and `tests/review-layout.test.cjs`; expect all pass.
- [ ] Commit the verified task.

### Task 3: Reference-inspired study layout and release readiness

**Files:** Create `tests/study-design.test.cjs`; modify `js/app.js`, `css/style.css`, `sw.js` only as necessary.

**Interfaces:** Preserve all existing action and mode selectors. The word card remains `.wcard`, study controls `.study-controls`, and progress `[data-word-counter]`; both themes retain their persisted preferences.

- [ ] Write browser tests at 320/360/390/768/1440 widths and both themes, including long-word rendering: the card has a visible gradient; progress and every existing action remain reachable, controls do not overlap the bottom navigation or content, no horizontal overflow occurs, and keyboard/reduced-motion behavior stays usable.
- [ ] Run `node --test --test-reporter=spec tests/study-design.test.cjs`; expect failure because the reference-inspired gradient and layout are absent.
- [ ] Restyle and minimally restructure the study view, then bump the versioned service-worker cache without changing its fetch or migration logic.
- [ ] Run the new tests, `tests/ui-contract.test.cjs`, `tests/ux-stability.test.cjs`, `tests/sw.test.cjs`, then the full `node --test --test-concurrency=3 --test-reporter=spec tests/*.test.cjs`; expect zero failures.
- [ ] Inspect mobile and desktop screenshots in both themes; check user-facing language, visual contrast, fixed controls and actual keyboard/touch interactions.
- [ ] Commit the verified task; request a read-only independent review and fix verified important findings with regression tests.
- [ ] Check the exact remote parent and tested tree, publish via the existing direct GitHub transport, wait for Pages, and verify production resources, layout and core flows in isolated browser sessions.
