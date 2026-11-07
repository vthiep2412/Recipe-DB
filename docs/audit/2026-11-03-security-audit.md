# RecipeDB — Security & Code Quality Audit

| Field | Value |
|---|---|
| Date | 2026-11-03 |
| Scope | `src/` (~700 KB) and all 15 migrations (`supabase/migrations/001`–`015`) |
| Method | Full read of services, parsers, migration SQL, auth/admin/studio components; targeted grep for `dangerouslySetInnerHTML`, `z-index`, `any`, `.rpc(`, `localStorage` |
| Mode | Read-only. No source files were modified during the audit. |
| Posture | **Block release.** The authorization model has a single point of total failure (C1). |

---

## Table of contents

1. [Executive summary](#1-executive-summary)
2. [Critical](#2-critical)
3. [High](#3-high)
4. [Medium](#4-medium)
5. [Low](#5-low)
6. [Evidence inventory](#6-evidence-inventory)
7. [Remediation sequence](#7-remediation-sequence)
8. [Verification suite](#8-verification-suite)
9. [Unverified items and open questions](#9-unverified-items-and-open-questions)
10. [What is already correct](#10-what-is-already-correct)

---

## 1. Executive summary

The application's authorization model rests on one SQL predicate, `public.is_admin()`. That predicate contains a logical error that makes it unconditionally return `true` inside its own `SECURITY DEFINER` context. Because every Row Level Security policy and every protection trigger in migrations 009 and 011 delegates to that predicate, the entire defense-in-depth stack is currently inert.

The practical result: **any authenticated user can promote themselves to `admin` and then read or modify any row in the database**, including other users' profiles and private recipes. The client-side route guards are cosmetic and never participate in the decision.

Everything else in this report is secondary. The security findings below C1 are real, but fixing them without fixing C1 produces no measurable risk reduction.

**Finding counts:** 3 Critical · 4 High · 9 Medium · 7 Low.

### Severity distribution

| Severity | Count | Theme |
|---|---|---|
| Critical | 3 | Broken authorization predicate; escalation chain; RLS inheritance |
| High | 4 | PII disclosure to anonymous users; key management; password change without re-auth; silent config degradation |
| Medium | 9 | Sanitizer drift; media data loss; modal/focus lifecycle; z-index scale; timer lifecycle; error leakage; unvalidated parsing; keyboard scope |
| Low | 7 | Duplication, dead code, `any` density, pattern inconsistency |

---

## 2. Critical

### C1 · `is_admin()` always returns `true` inside `SECURITY DEFINER`

**Location:** `supabase/migrations/014_fix_ban_infinity_to_interval.sql:10–24`

```sql
create or replace function public.is_admin()
returns boolean language sql security definer as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and (current_user in ('postgres','supabase_admin') or is_active_account())
  );
$$;
```

**Evidence and reasoning**

Inside a `SECURITY DEFINER` function, `current_user` resolves to the function **owner**, not the calling role. Supabase-owned functions execute as `postgres`. Therefore `current_user in ('postgres','supabase_admin')` evaluates to `true` for every caller, and the `or` short-circuits:

- The `role = 'admin'` filter remains, so a plain `user` still fails the `exists`.
- But the second clause was the entire **account-state guard**. `is_active_account()` is never evaluated.

The consequence is that a **banned, suspended, or archived account still passes every `is_admin()` check** and, combined with C2, can still write.

**Impact**

Two distinct failures:

1. **Account-state bypass.** Suspension and archiving do not revoke administrative capability, which defeats the intent of `is_active_account()` introduced in migration 011.
2. **Trigger and policy neutralization.** Every `if public.is_admin() then return new; end if;` guard in migration 009 becomes a guaranteed early return.

**Verification**

```sql
set role authenticated;
select public.is_admin();   -- expected: false; observed behavior: true
```

Run this against a non-admin JWT before and after the fix.

**Recommended fix**

Remove the `current_user` branch. If a service-role bypass is genuinely required, express it as `auth.role() = 'service_role'` — a claim that reflects the actual caller — or move the privileged operation into its own function and grant `execute` narrowly.

```sql
create or replace function public.is_admin()
returns boolean language sql stable security definer
set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid()
      and role = 'admin'
      and public.is_active_account()
  );
$$;
```

---

### C2 · Escalation chain: broken predicate plus a direct `profiles.role` write

**Locations:**
- `src/services/adminService.ts:155–172`
- `supabase/migrations/009_security_hardening.sql:19–79`

```ts
async updateUserRole(userId, role) {
  const { error } = await supabase
    .from('profiles')
    .update({ role })
    .eq('id', userId);
}
```

**Evidence and reasoning**

`prevent_unauthorized_role_change` (009:19–79) wraps every escalation check in `if public.is_admin() then return new; end if;`. Given C1, that branch is always taken, so the trigger never reaches its `raise exception` path.

The browser therefore holds a direct, unguarded write to the most privileged column in the schema. The only remaining obstacle is the RLS `update` policy on `profiles`, which itself delegates to `is_admin()`.

**Impact**

A single authenticated request self-promotes:

```
PATCH /rest/v1/profiles?id=eq.<own_uid>
Content-Type: application/json

{ "role": "admin" }
```

After that, `adminService` exposes the full administrative surface: recipe moderation, user listing, archiving, and account-deletion scheduling.

The redirects in `src/components/AdminPanel.tsx:129–144` and the route guard in `src/main.tsx:201` never observe the request and cannot prevent it.

**Recommended fix**

1. Fix C1 first — nothing below is meaningful without it.
2. Move role changes into an RPC that re-derives the caller's role server-side:

   ```sql
   create or replace function public.admin_set_user_role(target uuid, new_role public.user_role)
   returns void language plpgsql security definer
   set search_path = public
   as $$
   begin
     if not public.is_admin() then
       raise exception 'insufficient_privilege';
     end if;
     if target = auth.uid() then
       raise exception 'cannot_change_own_role';
     end if;
     update public.profiles set role = new_role where id = target;
   end;
   $$;
   ```

3. Revoke column-level writes: `revoke update (role) on public.profiles from authenticated;`
4. Make `prevent_unauthorized_role_change` fail closed — `raise exception` rather than `return new`.

---

### C3 · Admin RLS policies inherit the same broken predicate

**Locations:**
- `supabase/migrations/011_security_defense_in_depth.sql` — recipe insert / update / delete policies
- `supabase/migrations/009_security_hardening.sql` — profile policies

**Evidence and reasoning**

Every policy of the form `using (public.is_admin() or <owner condition>)` collapses to `true` under C1. The owner condition becomes irrelevant because the first disjunct already succeeded.

**Impact**

Recipe `update` and `delete` are open to any signed-in user. Where a policy reads *only* `is_admin()`, it is effectively `using (true)`.

**Recommended fix**

1. Fix C1.
2. Build a policy audit matrix: for each table, each operation, and each role (`anon`, `authenticated`, `service_role`), record the intended outcome and the actual outcome.
3. Add a regression test that asserts, using a non-admin JWT, that `select`, `update`, and `delete` on `recipes` fail for rows the caller does not own.
4. Prefer explicit `owner_id = auth.uid() or public.is_admin()` ordering so a failure of `is_admin()` degrades to owner-only rather than to open.

---

## 3. High

### H1 · Username → email disclosure to `anon`

**Location:** `supabase/migrations/013_rls_and_auth_hardening.sql:80–111`

**Evidence**

Migration 009 (lines 135–136) deliberately revoked anonymous access to the email lookup. Migration 013 re-grants `execute` on `get_email_for_username(TEXT)` to `anon`. The function returns `auth.users.email` for a supplied username.

**Impact**

An unauthenticated caller can convert any username into a verified email address:

```
POST /rest/v1/rpc/get_email_for_username
{ "p_username": "someuser" }
```

This is a direct PII disclosure and a high-value input for credential stuffing. It also turns username enumeration into email harvesting, which is a GDPR Article 32 concern (appropriate technical measures) and, in some jurisdictions, a reportable incident class on its own.

**Why it cannot simply be revoked**

`src/services/authStore.ts` depends on the lookup during `signIn` to translate a username into an email before calling `signInWithPassword`. Revoking without a replacement breaks login.

**Recommended fix**

1. Move resolution into a Supabase Edge Function (or a server route) that performs lookup and `signInWithPassword` in one call.
2. Apply per-IP and per-username rate limiting inside that function.
3. Revoke `execute` from `anon` and `authenticated` on `get_email_for_username` in the same migration.
4. Return an identical error for "unknown username" and "wrong password" to avoid re-introducing enumeration through error text.

---

### H2 · Workspace encryption keys stored as plaintext

**Location:** `supabase/migrations/015_user_workspace_keys.sql` — `encryption_key TEXT`, owner-only RLS
**Related:** `src/services/workspaceCryptoService.ts`

**Evidence**

Collaborator workspaces are encrypted client-side, then the key is persisted in the same database as the ciphertext, protected only by an owner-scoped RLS policy. There is no envelope encryption, no key derivation from a user secret, and no separation between the ciphertext store and the key store.

**Impact**

Anyone with database access or a backup — a support engineer, a compromised service account, a leaked dump — obtains both halves of the scheme. The encryption protects against nothing except a stolen browser profile, and even then only until the attacker queries `user_workspace_keys`.

**Recommended fix — choose one**

- **Preferred:** derive the key from a user passphrase using PBKDF2 or Argon2; persist only a salt and a verifier. The key never leaves the client.
- **Acceptable:** store keys in Supabase Vault and expose decryption through a `security definer` RPC restricted to the owner. Keep the key column out of `select *` by exposing a view for client reads.

**Also required:** confirm the cipher is AES-GCM with a unique random IV per encryption. IV reuse under GCM is catastrophic and would be a Critical finding in its own right — see [§9](#9-unverified-items-and-open-questions).

---

### H3 · Password change requires no current password

**Location:** `src/components/AccountSettings.tsx:217–245`

**Evidence**

The password change flow calls `updateUser` with the new credential. There is no `reauthenticate()` call, no `signInWithPassword` confirmation using the current password, and no verified email-confirmation gate in this path.

**Impact**

An attacker with a hijacked session — or anyone at an unlocked, shared device — can change the password and permanently lock the legitimate owner out. Combined with the absence of a re-authentication requirement, session theft converts into durable account takeover.

**Recommended fix**

1. Call `supabase.auth.reauthenticate()` (or `signInWithPassword` with the current password) before `updateUser`.
2. Require a fresh session: reject the operation when `session.iat` is older than five minutes.
3. Send a `password_changed` notification email so the owner can react to an unauthorized change.
4. Invalidate all other sessions after a password change (`signOut({ scope: 'others' })`).

---

### H4 · Missing configuration degrades silently to a placeholder backend

**Location:** `src/services/supabaseClient.ts:1–17`

```ts
createClient(url || 'https://placeholder.supabase.co', key || 'placeholder')
```

**Evidence**

When `VITE_SUPABASE_URL` or `VITE_SUPABASE_ANON_KEY` is absent, the client still constructs successfully against a non-existent host.

**Impact**

The application boots into a broken state that *looks* configured. Every request fails as an opaque DNS or 401 error with no actionable message, and the failure surfaces far from its cause — usually as a generic toast during login. This also masks misconfigured deployments in CI previews and staging.

**Recommended fix**

Throw at module load in production and render a dedicated configuration-error screen. Restrict the placeholder to `import.meta.env.DEV` so local development without credentials still works.

```ts
if (!url || !key) {
  if (import.meta.env.PROD) {
    throw new Error('Supabase configuration missing: VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY');
  }
}
```

---

## 4. Medium

### M1 · Three divergent hand-rolled sanitizers, no DOMPurify

**Locations:**
- `src/components/AdminPanel.tsx:29–89` — `sanitizeMarkdownHtml` (strips `on*` and `style`, allow-lists `href` and `src`)
- `src/components/CreatorApplicationPage.tsx:17–36` — `sanitizeHtml` (strips tags only, no attribute allow-list)
- `src/components/RecipeDetailView.tsx:29–69` — `escapeHtmlAttr`, `isSafeUrl`, `sanitizeMarkdown`

**Evidence**

Six `dangerouslySetInnerHTML` sites are protected by three implementations with different guarantees. See [§6.1](#61-dangerouslysetinnerhtml-sites). The weakest — `CreatorApplicationPage.sanitizeHtml` — performs no attribute inspection at all. It is currently mitigated only because `<` is escaped before `marked.parse`, which is an *ordering* guarantee, not a property of the sanitizer.

**Impact**

The highest-value target is the **admin session reviewing creator applications**: admin-rendered markdown is attacker-controlled content from a lower-privileged user. A single future edit that reorders escaping relative to parsing turns that into stored XSS with administrative reach. Because the three implementations differ, a reviewer cannot reason about them uniformly.

**Recommended fix**

1. Add `dompurify` and expose one `sanitizeHtml(html, profile)` helper with two profiles: `'recipe'` and `'admin-review'`.
2. Delete all three hand-rolled versions.
3. Add unit tests with at minimum: `<img src=x onerror=alert(1)>`, `<a href="javascript:alert(1)">`, `<svg/onload=alert(1)>`, `<iframe srcdoc="...">`, `<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>` (mXSS nesting).
4. Add a lint rule or CI grep that fails the build on a new `dangerouslySetInnerHTML` outside the helper module.

---

### M2 · Media saved as `idb:` references — silent cross-device data loss

**Location:** `src/components/KitchenStudio/MediaModal.tsx:99–123`, `:158–180`

**Evidence**

`processFile` writes the file into IndexedDB and returns `idb:asset_<timestamp>_<random>` as the recipe's persisted media reference. `handleApplyUrl` accepts `blob:` and `idb:` schemes and persists them too.

```ts
const assetId = `idb:asset_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
await localMediaStore.saveBlob(assetId, file);
```

**Impact**

`idb:` and `blob:` references are browser-local and origin-scoped. A recipe published with such a reference:

- renders correctly for the author,
- shows a broken image for every other user,
- is lost entirely on cache clear, private-mode exit, or device change.

`src/services/cloudinaryUpload.ts` exists but `MediaModal` never calls it. The two media paths are disconnected, so the durable path is dead code in practice.

**Secondary issues in the same component**

- No file size cap. `accept` at line 240 is a cosmetic hint, not validation; a large drop silently exhausts the IndexedDB quota.
- The `catch` at line 110 swallows the quota failure, so the UI proceeds as though the save succeeded.

**Recommended fix**

1. Restrict recipe-persisted media to `https://` only.
2. Route uploads through `cloudinaryUpload` and store the returned URL.
3. Keep `idb:` strictly for unsaved drafts, with a save-time promotion step that uploads and rewrites the reference.
4. Enforce a size limit and surface a real error when it is exceeded.
5. Validate MIME type by inspecting the file, not by trusting the `accept` attribute.

---

### M3 · `ConfirmModal` re-registers its key handler every render and steals focus

**Location:** `src/components/ConfirmModal.tsx:36–89`

**Evidence**

```ts
useEffect(() => {
  ...
  return () => {
    document.removeEventListener('keydown', handleKeyDown);
    clearTimeout(timer);
    prevFocusedRef.current?.focus?.();
  };
}, [isOpen, isLoading, onCancel]);
```

Callers pass `onCancel` as an inline arrow, so its identity changes on every parent render. Each change tears down the effect, whose cleanup restores focus to the element that was focused *before* the modal opened (line 87). A new effect then re-focuses the confirm button after a 50 ms timer.

**Impact**

- Visible focus flicker during any parent re-render.
- The keyboard position is lost mid-interaction.
- `Escape` handling is briefly detached between teardown and re-registration.
- `aria-labelledby="confirm-modal-title"` (line 109) and `id="confirm-modal-title"` (line 112) are fixed strings. Two stacked confirm dialogs produce duplicate ids and an ambiguous accessible name.

**Recommended fix**

1. Hold `onCancel` in a ref; depend only on `[isOpen]`.
2. Run focus restoration only on close, not on every effect teardown.
3. Generate the title id with `useId()`.

---

### M4 · `Dropdown` hijacks Space/Enter document-wide while open

**Location:** `src/components/ui/Dropdown.tsx:1–244`

**Evidence**

The component attaches a `keydown` listener at document level while open. Space and Enter are intercepted regardless of which element holds focus. `aria-activedescendant` is never set on the trigger.

**Impact**

- Space and Enter stop working in unrelated focused inputs while any dropdown is open.
- Page scroll is blocked by Space.
- Screen readers announce no active option, so keyboard navigation is silent.

**Recommended fix**

1. Scope the listener to the container ref, or attach it to the menu element directly.
2. Set `role="listbox"` on the menu, `role="option"` on items.
3. Set `aria-activedescendant={open ? optionId(highlightedIndex) : undefined}` on the trigger.
4. Preserve `typeahead` semantics: printable characters should move the highlight, not be swallowed.

---

### M5 · `z-index` scale is unbounded and internally contradictory

**Locations:** see [§6.2](#62-z-index-ladder)

**Evidence**

Ten distinct stacking layers between `20` and `999999`, with two `!important` declarations and one duplicated selector:

| Value | Location |
|---|---|
| `999999` | `src/styles/theme.css:211` |
| `100201` | `src/styles/recipe.css:324` |
| `100200` | `src/styles/recipe.css:38` |
| `100100 !important` | `src/styles/recipe.css:331` |
| `100050 !important` | `src/styles/ui.css:565` |
| `100000` | `src/styles/kitchen-studio.css:2235` |
| `99990` | `src/styles/kitchen-studio.css:2648` |
| `2100` | `src/styles/ui.css:423` |
| `2000 !important` | `src/styles/ui.css:551`, `src/styles/ui.css:558` |
| `1200` | `src/styles/timer.css:7` |

`.confirm-modal-overlay` is declared **twice**: `2100` at `ui.css:423` and `100050 !important` at `ui.css:565`. The later, `!important` declaration wins, making the first dead code.

**Impact**

- The timer alarm modal (`1200`) sits **below** auth modals (`2000`). A timer that fires while the auth modal is open is invisible and unreachable behind it — a functional failure for a cooking timer.
- Recipe overlays at 100k+ sit above every modal in the app, including toasts.
- Two competing "top" layers (`100050` and `100200`) mean any new modal must guess which ceiling to exceed.
- The dead duplicate rule misleads future readers into editing the losing declaration.

**Recommended fix**

Define one ladder in `theme.css` and replace every literal:

```css
:root {
  --z-base: 0;
  --z-sticky: 100;
  --z-dropdown: 200;
  --z-overlay: 1000;
  --z-modal: 1100;
  --z-alarm: 1200;
  --z-toast: 1300;
  --z-devtool: 1400;
}
```

Remove both `!important` declarations and the duplicate selector.

---

### M6 · Timer alarm lifecycle is unbounded and module-scoped

**Locations:** `src/services/timerAudio.ts`, `src/components/Timer/TimerAlarmModal.tsx`

**Evidence**

- `startAlarmLoop` has no maximum duration and no cancellation budget.
- The modal has no auto-timeout.
- Window listeners are attached at module import time, so they survive hot-module replacement and leak into any test harness that imports the module.
- `Escape` (`TimerAlarmModal.tsx:21–30`) calls `onDismissAll()`, dismissing every finished timer at once.

**Impact**

- A finished timer rings indefinitely until a human intervenes.
- Module-scope listeners make the service untestable in isolation and produce duplicate handlers after HMR.
- A single `Escape` press silently clears all pending alarms, including ones the user never saw.

**Recommended fix**

1. Cap the loop (for example, 60 seconds), then auto-silence while leaving the modal open.
2. Move listener attachment into an explicit `init()` / `dispose()` pair called from application bootstrap.
3. Make `Escape` close the modal without stopping timers; require an explicit "Dismiss all" action.

---

### M7 · `ErrorBoundary` renders raw `error.message` and has no reporting hook

**Location:** `src/components/ErrorBoundary.tsx:24–26`, `:96`

**Evidence**

`componentDidCatch` only calls `console.error`. The rendered fallback interpolates `error.message` directly into the UI.

**Impact**

- Database and network errors leak stack fragments, table names, and internal URLs to end users.
- Production failures are invisible to the team: nothing is reported, and `console.error` is not a monitoring channel.
- Without a correlation id, a user-reported error cannot be tied to a server log.

**Recommended fix**

1. Render a generic message plus a generated correlation id.
2. Send the real error to an error sink keyed by that id.
3. Wrap the boundary with route awareness so the report includes the failing path.

---

### M8 · `JSON.parse` on user-authored Fablang with no schema validation

**Location:** `src/parser/orchestrationParser.ts` (1,507 lines, pervasive `any`)

**Evidence**

User-provided workspace JSON is parsed and consumed directly. There is no schema validation at the boundary, no cycle detection, and no size guard.

**Impact**

- Malformed data propagates as `undefined` fields into the canvas, producing failures far from the cause.
- A large or cyclic structure can freeze the tab with no user-visible cause and no recovery path other than the `ErrorBoundary` reload.
- Because the parser is typed `any` throughout, TypeScript cannot flag the propagation.

**Recommended fix**

Validate against a schema (Zod or Valibot) at the parse boundary and return a typed `Result`. Reject with a line-numbered message. Add a node-count and depth cap.

---

### M9 · `KitchenCanvas` Space-to-pan fires inside contenteditable nodes

**Location:** `src/components/KitchenStudio/KitchenCanvas.tsx:181–197`

**Evidence**

```ts
if (e.code === 'Space' && !(e.target as HTMLElement).matches('input, textarea, ...'))
```

The guard enumerates form elements but does not cover `contenteditable`.

**Impact**

Pressing Space while editing a rich-text step both inserts a space and toggles pan mode. The canvas jumps under the user's cursor mid-sentence.

**Recommended fix**

Extend the guard with `[contenteditable="true"]` and `(e.target as HTMLElement).isContentEditable`.

---

## 5. Low

### L1 · Duplicated `escapeHtmlAttr`

**Locations:** `src/components/RecipeDetailView.tsx:29`, `src/components/KitchenStudio/ObsidianSourceEditor.tsx:411`

Two independent implementations of the same escaping helper. This is precisely the mechanism by which sanitizer drift (M1) occurs: a fix applied to one copy silently leaves the other vulnerable.

**Fix:** extract to `src/utils/html.ts` and delete both copies.

---

### L2 · Dead code — `_legacyUrl`

**Location:** `src/components/RecipeDetailView.tsx:44`

Unused variable retained from an earlier data shape. Remove.

---

### L3 · Mixed confirmation patterns

**Location:** `src/components/AccountSettings.tsx:260`

Native `confirm()` is used in a component that already imports `ConfirmModal`.

**Impact:** blocks the main thread, ignores the theme, cannot be styled, and is untestable in headless environments.

**Fix:** migrate to `ConfirmModal`.

---

### L4 · `any` density in service row mappers

**Locations and counts** (grep of `src/services`, `.ts` only — 28 matches total):

| File | Matches |
|---|---|
| `src/services/adminService.ts` | 10 |
| `src/services/authStore.ts` | 8 |
| `src/services/recipeStorageService.ts` | 6 |
| `src/services/creatorApplicationService.ts` | 3 |
| `src/services/userDataSyncService.ts` | 1 |

Concentrated in row mappers (`mapProfileRow`, `mapRecipeRow`, `mapApplicationRow`) and `catch (err: any)`.

**Impact**

The mappers are exactly where a schema change becomes a silent `undefined` at runtime. `err: any` permits property access that throws inside a `catch`, masking the original error.

**Fix:** type rows against generated Supabase types; use `unknown` in `catch` with a narrowing helper.

---

### L5 · ILIKE wildcard leak in admin search

**Location:** `src/services/adminService.ts:138`

```ts
const q = params.searchQuery.trim().replace(/[^a-zA-Z0-9_\-\s]/g, '');
```

The allow-list retains `_`, which is a SQL `LIKE` wildcard. Searching `a_b` matches `axb`.

**Fix:** escape `_` and `%` before interpolation, or use a dedicated search index.

---

### L6 · `localStorage` key scan on every render

**Location:** `src/components/AvatarDropdown.tsx:35`

```ts
const hasLocalSession = Object.keys(localStorage).some(k => k.startsWith('sb-') && k.endsWith('-auth-token'));
```

Runs on every render and guesses session state from key naming — a Supabase implementation detail that has changed across versions.

**Fix:** use the auth store's own loading flag.

---

### L7 · `console.error` in production paths

**Locations:** `src/components/ErrorBoundary.tsx:25` and multiple service `catch` blocks.

**Fix:** strip via build configuration or route through a logger that is a no-op in production.

---

## 6. Evidence inventory

### 6.1 `dangerouslySetInnerHTML` sites

All six are listed for review. Each is protected by one of the three divergent sanitizers described in M1.

| # | File | Line | Content source | Sanitizer in use |
|---|---|---|---|---|
| 1 | `src/components/AdminPanel.tsx` | 996 | Creator application markdown (untrusted, low-privilege author) | `sanitizeMarkdownHtml` (29–89) |
| 2 | `src/components/CreatorApplicationPage.tsx` | 247 | User preview of own application | `sanitizeHtml` (17–36) |
| 3 | `src/components/CreatorApplicationPage.tsx` | 350 | User preview of own application | `sanitizeHtml` (17–36) |
| 4 | `src/components/RecipeDetailView.tsx` | 1439 | Recipe body | `sanitizeMarkdown` (29–69) |
| 5 | `src/components/RecipeDetailView.tsx` | 1686 | Recipe body | `sanitizeMarkdown` (29–69) |
| 6 | `src/components/KitchenStudio/RecipeMetadataModal.tsx` | 723 | Recipe metadata preview | `escapeHtmlAttr` (328–335) |

**Attack-surface note:** site 1 is the highest risk. It renders content authored by a lower-privileged user inside an administrative session. Any sanitizer regression there yields privilege escalation, not merely defacement.

### 6.2 `z-index` ladder

| Value | File:line | Selector context |
|---|---|---|
| `999999` | `src/styles/theme.css:211` | topmost overlay |
| `100201` | `src/styles/recipe.css:324` | recipe overlay tier |
| `100200` | `src/styles/recipe.css:38` | recipe overlay tier |
| `100100 !important` | `src/styles/recipe.css:331` | recipe overlay tier |
| `100050 !important` | `src/styles/ui.css:565` | `.confirm-modal-overlay` (winning declaration) |
| `100000` | `src/styles/kitchen-studio.css:2235` | studio modal |
| `99990` | `src/styles/kitchen-studio.css:2648` | studio secondary layer |
| `9999` | `src/styles/recipe.css:2287` | nested overlay |
| `2100` | `src/styles/ui.css:423` | `.confirm-modal-overlay` (dead declaration) |
| `2000 !important` | `src/styles/ui.css:551`, `:558` | `.modal-overlay`, `.auth-modal-overlay` |
| `2000` | `src/styles/auth.css:426` | auth overlay |
| `1200` | `src/styles/timer.css:7` | `.timer-modal-backdrop` |
| `1000` | `src/styles/ui.css:384` | `.tooltip-bubble` |
| `1000` | `src/styles/timer.css:399`, `:413` | timer overlays |
| `100` | `src/styles/ui.css:84` | `.ui-dropdown-menu` |

**Ordering defect:** `timer.css:7` (`1200`) is below `ui.css:551` (`2000`). A finished cooking timer cannot surface above an open auth or modal overlay.

### 6.3 Admin mutation surface

| Operation | Mechanism | Enforced server-side? |
|---|---|---|
| Update user role | Direct `profiles.update` (`adminService.ts:155–172`) | **No** — relies on C1-broken trigger |
| Archive user | RPC `admin_set_user_archived` (`adminService.ts:176`) | Yes (RPC) |
| Schedule deletion | RPC `admin_schedule_account_deletion` (`adminService.ts:192`) | Yes (RPC) |
| Approve application | RPC `approve_creator_application` (`adminService.ts:243`) | Yes (RPC) |
| Reject application | Direct `creator_applications.update` (`adminService.ts:259–260`) | Policy-dependent |
| Update recipe status | Direct `recipes.update` (`adminService.ts:98–99`) | Policy-dependent (C3) |
| Delete recipe | Direct `recipes.delete` (`adminService.ts:116`) | Policy-dependent (C3) |

The archive and deletion paths already use the correct pattern. `updateUserRole` is the outlier and is also the most dangerous operation.

### 6.4 Client-side route guards

These never participate in authorization. They are UX redirects only.

| Route | Guard | Location |
|---|---|---|
| `/admin` | `role === 'admin'` | `src/main.tsx:201` |
| `/kitchen-studio` | `creator` or `admin` | `src/main.tsx:224` |
| Protected paths | session present | `src/main.tsx:142` |
| `/admin` (component) | redirect on role change | `src/components/AdminPanel.tsx:129–144` |

**Correct framing:** these guards are acceptable *only if* RLS is sound. Under C1 it is not, so they provide zero protection.

### 6.5 Secret handling

| Check | Result |
|---|---|
| Service-role key in `src/` | Not present — only the anon key is used |
| `.gitignore` coverage | `.env*` ignored, `.env.example` tracked |
| Client-exposed variables | `VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`, `VITE_CLOUDINARY_*` |
| `.env.local` | Present locally, correctly ignored |

The Cloudinary variables are client-exposed by design (unsigned upload preset). Confirm the preset is restricted to unsigned uploads only and has a size/format policy — an unrestricted unsigned preset is a cost-abuse vector.

### 6.6 Tariff of verified protections

| Protection | Status |
|---|---|
| Self role change | Blocked in UI (`AdminPanel.tsx:274`) |
| Self archive | Blocked in UI (`AdminPanel.tsx:294`) |
| Self deletion | Blocked in UI (`AdminPanel.tsx:336`) |
| Server-side self-escalation guard | **Missing** (C2) |
| Account-state enforcement | **Bypassed** (C1) |
| Banned account RLS enforcement | **Bypassed** (C1) |

The three UI guards are the correct instinct, but they exist only in the browser. A `curl` request bypasses all three.

---

## 7. Remediation sequence

Ordered by risk reduction per unit of effort. Do not parallelize step 1 with anything else.

| Step | Finding | Effort | Notes |
|---|---|---|---|
| 1 | **C1** | ~15 min | One SQL change. Everything else in security is theater until this lands. |
| 2 | **C2, C3** | ~0.5 day | RPC for role changes, column-level revoke, non-admin regression test. |
| 3 | **H1** | ~1 day | Edge Function for login, revoke anon execute, add rate limiting. |
| 4 | **H3** | ~2 h | Re-auth gate plus notification email. |
| 5 | **H2** | ~1–2 days | Key management redesign — a design task, not a patch. |
| 6 | **H4** | ~1 h | Fail-fast config validation. |
| 7 | **M1** | ~0.5 day | DOMPurify wrapper, delete three implementations, add payload tests. |
| 8 | **M5, M6** | ~0.5 day | Z-index tokens; timer loop cap and listener lifecycle. |
| 9 | **M2** | ~1 day | Route media through Cloudinary; restrict persisted schemes. |
| 10 | **M3, M4, M9** | ~0.5 day | Focus lifecycle, dropdown scoping, contenteditable guard. |
| 11 | **M7, M8** | ~1 day | Error reporting; schema validation at the parser boundary. |
| 12 | **L1–L7** | ~0.5 day | Cleanup pass. |

**Total:** roughly 6–8 engineering days for the full set; steps 1–4 (the security-critical path) are about two days.

---

## 8. Verification suite

### 8.1 SQL — authorization

Run each statement against a non-admin JWT.

```sql
-- C1: must return false
set role authenticated;
select public.is_admin();

-- C1: must raise or return false for a banned account
select public.is_active_account();

-- C2: must fail
update public.profiles set role = 'admin' where id = auth.uid();

-- C3: must fail for rows not owned by the caller
update public.recipes set title = 'x' where id = '<someone-elses-recipe>';
delete from public.recipes where id = '<someone-elses-recipe>';

-- H1: must fail (permission denied for function)
select public.get_email_for_username('someuser');
```

Expected results after remediation: `false`, `false`, permission denied, zero rows affected, zero rows affected, permission denied.

### 8.2 Manual — sanitizer

Insert each payload as a creator application and open it in the admin review panel:

```
<img src=x onerror=alert(1)>
<a href="javascript:alert(1)">click</a>
<svg/onload=alert(1)>
<iframe srcdoc="<script>alert(1)</script>">
<math><mtext><table><mglyph><style><img src=x onerror=alert(1)>
```

Expect zero script execution and no `javascript:` navigation.

### 8.3 Manual — layering

1. Start a 10-second timer.
2. Open the auth modal while it runs.
3. Wait for the alarm.

Expected after M5: the alarm is visible and interactive above the auth modal. Current behavior: the alarm is rendered underneath and cannot be dismissed.

### 8.4 Manual — media durability

1. Create a recipe with a dropped image in `KitchenStudio`.
2. Publish it.
3. Open the recipe in a private window.

Expected after M2: the image loads. Current behavior: broken image, because the persisted reference is `idb:` and resolves only in the authoring browser profile.

### 8.5 Manual — focus lifecycle

1. Open any `ConfirmModal` from a screen that re-renders frequently (for example, while a sync indicator animates).
2. Hold focus in the modal and wait.

Expected after M3: focus stays put. Current behavior: focus is periodically thrown back to the element that was active before the modal opened.

---

## 9. Unverified items and open questions

These were outside what a read-only static pass can establish. Treat them as open risks, not cleared items.

1. **AES-GCM IV handling in `workspaceCryptoService`.** If the IV is static or derived from a counter that resets, GCM nonce reuse breaks confidentiality and integrity entirely. This would be a Critical finding. Requires reading the full encrypt/decrypt path and ideally a test vector.

2. **Supabase auth rate limiting.** H1's practical severity depends on whether per-IP throttling is enabled on the project. If it is, the lookup is expensive to abuse at scale; if it is not, email harvesting is trivial. Check the project's auth settings.

3. **Cloudinary unsigned upload preset policy.** Verify the preset restricts format, size, and transformation to prevent cost abuse through the public preset.

4. **`get_email_for_username` `security definer` search path.** Confirm `search_path` is pinned. An unpinned search path on a definer function allows schema-shadowing attacks.

5. **Migration ordering on a live database.** Migrations 009 → 013 → 014 show that a hardening step was partially reverted and then only partly restored. Confirm the applied state on production matches the file state, since a missed migration would change every finding above.

6. **Bucket-level storage policies.** Not audited in this pass. Avatar and media buckets need the same owner-scoped review as tables.

---

## 10. What is already correct

Recorded because it changes the fix order and because several of these are non-obvious.

- **No service-role key in client code.** Only the anon key ships. This caps the blast radius of every client-side bug in this report.
- **`.gitignore` is correct.** `.env*` is ignored with `.env.example` as the deliberate exception.
- **Self-lockout guards exist.** `AdminPanel.tsx` blocks self role change (274), self archive (294), and self deletion (336). The server-side equivalent is missing (C2), but the intent and placement are right.
- **Archive and deletion use RPCs.** `admin_set_user_archived` and `admin_schedule_account_deletion` are the correct pattern — the fix for C2 is to extend that pattern to `updateUserRole`, not to invent something new.
- **Recipe policies from 011 are structurally sound.** Insert/update/delete distinguish owner from admin and were clearly written with care. They fail only because the `is_admin()` disjunct is broken.
- **`ConfirmModal` implements a real focus trap.** The cycling logic at lines 50–76 is correct; the defect is in effect lifecycle (M3), not in the trap itself.
- **`ErrorBoundary` exists and wraps the app.** The gap is reporting and message hygiene (M7), not the presence of a boundary.
- **The timer feature has a coherent state model.** `ActiveTimer`, the drawer, and the alarm modal share a consistent shape. M6 is a lifecycle gap, not an architectural one.

---

## Appendix A — File index

| Area | Files reviewed |
|---|---|
| Migrations | `supabase/migrations/001`–`015` (all) |
| Services | `authStore.ts`, `supabaseClient.ts`, `userDataSyncService.ts`, `workspaceStorageService.ts`, `workspaceCryptoService.ts`, `recipeStorageService.ts`, `settingsStore.ts`, `localMediaStore.ts`, `cloudinaryUpload.ts`, `adminService.ts`, `passwordStrength.ts`, `creatorApplicationService.ts`, `timerAudio.ts` |
| Parsers | `orchestrationParser.ts`, `cooklangParser.ts`, `fablangGenerator.ts`, `graphAdapter.ts`, `unitConverter.ts` |
| Components | `RecipeDetailView.tsx`, `main.tsx`, `auth/AuthCard.tsx`, `AccountSettings.tsx`, `AdminPanel.tsx`, `ui/Dropdown.tsx`, `ErrorBoundary.tsx`, `ConfirmModal.tsx`, `AvatarDropdown.tsx`, `CreatorApplicationPage.tsx`, `Timer/*`, `KitchenStudio/*` |
| Styles | `theme.css`, `ui.css`, `recipe.css`, `kitchen-studio.css`, `auth.css`, `timer.css`, `admin-panel.css` |

## Appendix B — Finding index

| ID | Severity | Title | Primary location |
|---|---|---|---|
| C1 | Critical | `is_admin()` always true in `SECURITY DEFINER` | `014_fix_ban_infinity_to_interval.sql:10–24` |
| C2 | Critical | Escalation chain via direct `profiles.role` write | `adminService.ts:155–172` |
| C3 | Critical | Admin RLS policies inherit broken predicate | `011_security_defense_in_depth.sql` |
| H1 | High | Username → email disclosure to `anon` | `013_rls_and_auth_hardening.sql:80–111` |
| H2 | High | Workspace encryption keys stored plaintext | `015_user_workspace_keys.sql` |
| H3 | High | Password change without re-authentication | `AccountSettings.tsx:217–245` |
| H4 | High | Silent placeholder backend on missing config | `supabaseClient.ts:1–17` |
| M1 | Medium | Three divergent hand-rolled sanitizers | `AdminPanel.tsx:29–89`, `CreatorApplicationPage.tsx:17–36`, `RecipeDetailView.tsx:29–69` |
| M2 | Medium | `idb:` media references cause data loss | `MediaModal.tsx:99–123, 158–180` |
| M3 | Medium | `ConfirmModal` focus theft and listener churn | `ConfirmModal.tsx:36–89` |
| M4 | Medium | `Dropdown` hijacks Space/Enter globally | `ui/Dropdown.tsx` |
| M5 | Medium | Unbounded, contradictory `z-index` scale | `theme.css`, `ui.css`, `recipe.css`, `timer.css` |
| M6 | Medium | Unbounded timer alarm, module-scope listeners | `timerAudio.ts`, `TimerAlarmModal.tsx` |
| M7 | Medium | `ErrorBoundary` leaks raw messages, no reporting | `ErrorBoundary.tsx:24–26, 96` |
| M8 | Medium | Unvalidated `JSON.parse` of user Fablang | `orchestrationParser.ts` |
| M9 | Medium | Space-to-pan fires in contenteditable | `KitchenCanvas.tsx:181–197` |
| L1 | Low | Duplicated `escapeHtmlAttr` | `RecipeDetailView.tsx:29`, `ObsidianSourceEditor.tsx:411` |
| L2 | Low | Dead `_legacyUrl` | `RecipeDetailView.tsx:44` |
| L3 | Low | Native `confirm()` in a `ConfirmModal` component | `AccountSettings.tsx:260` |
| L4 | Low | `any` density in row mappers | `src/services/*` (28 matches) |
| L5 | Low | `_` wildcard leaks through ILIKE filter | `adminService.ts:138` |
| L6 | Low | `localStorage` key scan each render | `AvatarDropdown.tsx:35` |
| L7 | Low | `console.error` in production paths | `ErrorBoundary.tsx:25`, service catches |
