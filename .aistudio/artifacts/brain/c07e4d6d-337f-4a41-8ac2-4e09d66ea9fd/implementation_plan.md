# Implementation Plan - Tab Visibility Audio & Variable Speed Timer Continuity

Mute/pause game sound effects and background music smoothly whenever the player switches away from the browser tab, and resume smoothly upon return, while ensuring in-game battle question timers continue ticking down accurately using wall-clock time scaled by any active speed multipliers (e.g. Special Fights and Phase 2 accelerated countdowns).

## User Review Required

> [!IMPORTANT]
> - **Variable Speed & Special Fights**: Special fights and Phase 2 encounters have an added speed multiplier (`phase2TimeSpeedPercent`, e.g., +25% or higher), causing the timer to tick **faster** than 1 tick per second.
> - **Wall-Clock Speed Scaling**: The background time tracking will multiply elapsed real-world milliseconds by the active speed factor (`1 + speedBonus / 100`), ensuring that even when a browser throttles background intervals, accelerated countdowns expire at the exact accelerated game speed.
> - **Audio behavior**: BGM smoothly fades out over ~200ms and pauses upon switching tabs; smoothly unpauses and fades back in upon returning. SFX are completely suppressed while hidden.

---

## Proposed Changes

### Audio Management (`src/context/AudioContext.tsx`)
- Add a Page Visibility API listener (`document.addEventListener('visibilitychange', ...)`) inside `AudioProvider`.
- Track tab visibility state with a ref (`isTabHiddenRef`) and music state (`wasPlayingOnHideRef`).
- Add a smooth fade utility (`fadeVolume(from, to, durationMs, onComplete)`):
  - **When tab is hidden (`document.hidden === true`)**:
    - If music is actively playing, fade volume smoothly down to 0 over ~200ms, then call `.pause()`.
    - Mark `isTabHiddenRef.current = true` so any sound effects (`playSfx`) or Web Audio synthesizers are suppressed while the player is on another tab.
  - **When tab returns (`document.hidden === false`)**:
    - Mark `isTabHiddenRef.current = false`.
    - If `wasPlayingOnHideRef.current` was true, call `musicRef.current.play()` and ramp volume smoothly from 0 back up to the user's volume preference over ~200ms.
- Clean up listeners and any running fade intervals on unmount.

### Battle Timer with Variable Speed Scaling (`src/app/play/hooks/useBattle.ts`)
- Replace rigid interval decrementing with timestamp-delta tracking that accounts for speed multipliers:
  - Record `questionStartTimestamp` and baseline `initialQuestionTime`.
  - Calculate `speedMultiplier = 1 + (speedBonus / 100)`.
  - In each tick (and immediately upon tab re-focus via `visibilitychange`), compute:
    `elapsedGameSeconds = Math.floor(((Date.now() - questionStartTimestamp) * speedMultiplier) / 1000)`
    `remainingSeconds = Math.max(0, initialQuestionTime - elapsedGameSeconds)`
  - If `remainingSeconds <= 0`, cleanly trigger timeout damage (`handleAnswer(-1)`).
  - This guarantees 100% precision regardless of whether the timer runs at standard speed, 25% faster, 50% faster, or any custom special fight speed factor.

---

## Verification Plan

### Automated Tests
- Run `compile_applet` to verify compilation and type checks.
- Run `lint_applet` to verify zero linting regressions.

### Manual Verification
1. **Audio Fade on Tab Switch**:
   - Start background music.
   - Switch away to another tab; verify the audio gently fades out and goes completely silent without any speaker pops.
   - Return to the game tab; verify the audio gently fades back in from the exact moment it left off.
2. **SFX Silencing**:
   - Verify no level up or battle sounds trigger audibly in the background.
3. **Standard Countdown Accuracy**:
   - Switch tabs during a standard question for 5 seconds; verify the countdown has advanced by exactly 5 seconds upon return.
4. **Accelerated Special Fight Countdown**:
   - In a special fight / Phase 2 encounter with elevated speed (e.g. +25%), verify the timer burns through 1.25x game time for every real second elapsed while switched away, timing out fairly and accurately.
