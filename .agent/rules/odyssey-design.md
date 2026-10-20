---
trigger: always_on
description: Design system for E-Prescription by ODYSSEY. Read before touching any UI, page, style, copy or mascot.
---

# E-Prescription by ODYSSEY: design rules for agents

This repo is **E-Prescription by ODYSSEY**: PRC-licensed doctors in the Philippines write a prescription, send it
as a link (Viber, SMS), and the patient pays by GCash, Maya or bank QR to open it. The visual identity follows the
**ODYSSEY brand bible v1.0** and the **Ody mascot guidelines v1.0**. Every UI change must follow this file. When a
request conflicts with it, say so and ask before breaking a rule.

## 1. What has been built so far

| Area | Route | Status |
| --- | --- | --- |
| Landing page | `/` | Rebranded, done |
| Pricing page with plan limits and calculator | `/pricing` | Rebranded, done |
| Doctor sign in | `/login` | Rebranded, done |
| Administrator sign in | `/admin/login` | Rebranded, same shell as doctor sign in |
| Favicon, tab title, theme colour | `client/index.html`, `client/public/favicon.svg` | Done (favicon still needs ODYSSEY approval) |
| Doctor register, doctor dashboard, admin dashboard, patient Rx view | `/doctor/*`, `/admin`, `/rx/:id` | **Still the old teal "E-Reseta" style.** Next to restyle, following section 11 |

Key files:

- `client/src/features/marketing/site.css`: all brand tokens and styles for the rebranded pages, scoped under `.ody`.
- `client/src/features/marketing/components.jsx`: shared pieces (`SiteNav`, `SiteFooter`, `Lockup`, `Ody`, `Closer`,
  `Faq`, `RxSlip`, `PhoneRx`, `PayCard`, `DepartmentsCard`, `QrMark`, `useSiteMotion`).
- `client/src/features/marketing/plans.js`: plans, prices, limits, `recommend()`, `CONTACT_EMAIL`.
- `client/src/pages/Landing.jsx`, `client/src/pages/Pricing.jsx`.
- `client/src/features/auth/components/AuthShell.jsx` (`AuthShell`, `AuthField`) and `LoginForm.jsx`.
- `client/public/brand/`: logo and mascot artwork (see section 6).

To build a new page in the brand: wrap it in `<div className="ody">`, import `features/marketing/site.css`, and reuse
the components above. Do not copy styles into Tailwind classes; the old Tailwind `brand-*` (teal) scale is legacy.

## 2. Colour (brand bible, fixed)

| Token | Hex | Use |
| --- | --- | --- |
| `--navy` Odyssey Navy | `#152839` | Structure: headings, body text, dark surfaces, primary buttons |
| `--orange` Voyage Orange | `#FF6F07` | Energy: accents only, about 5% of any view. **Never text on light grounds** (2.6:1) |
| `--warm` Warm White | `#F9F8F3` | Default page ground |
| `--ember` Ember | `#B8470A` | Orange-looking text and links on light grounds |
| `--slate` Slate | `#45546A` | Secondary text |
| `--harbor` Harbor Grey | `#5F6A7C` | Captions, meta |
| `--sand` Sand | `#ECE7DE` | Warm panels and fields |
| `--mist` Mist | `#DCE1E8` | Cool panels |
| `--white` | `#FFFFFF` | Cards, documents |

Balance: about 60% light, 25% navy, 10% neutrals, 5% orange. On orange buttons use **navy text, never white**.
Error text `#A3330A`, error box `#FBE9E1` with `#7A2406` text.

## 3. Type

- Headings: **Poppins** 500/700. Body and UI: **Inter** 400/500/600. Loaded in `client/index.html`.
- Size steps (`--t1` to `--t5`): hero about 88px, section 56px, sub 30px, body 17px, small 15px. Do not add new sizes.
- Every headline fits in **two lines or fewer** at every width. Sentence case. Left aligned.
- Never type the word "ODYSSEY" in Poppins to imitate the logo. Use the logo files.

## 4. The one motif: the "O"

Everything is shaped by the **O of the ODC monogram** (navy wall, orange inner rim, sand counter; radii 128/88/70 on a
272 by 360 box). The CSS radii are `--o-outer`, `--o-wall`, `--o-counter`.

- `.o-letter > .o-letter__rim > .o-letter__counter`: the full O, used as a stage (hero), a frame (calculator), a figure.
- `.o-shape`: the O silhouette as a mask or filled shape. `.o-shape--art` fills it with a colour (`--bg`) and centres a drawing.
- `.o-dot`: the O at text size, used as list bullets.
- Buttons are pills (`.btn`, `.btn--accent`, `.btn--light`).
- Percentage padding in `.o-letter` is relative to its **parent's** width: size the wrapper, give `.o-letter` `width: 100%`.

## 5. House rules (do not break)

- No gradients, no shadows on resting elements (menus and dialogs may), no glass or blur, no emoji.
- No eyebrow labels above headings, no tiny uppercase letter-spaced labels, no monospace outside code, no 01/02/03 numbering.
- No thin decorative rules or 1px outlined boxes. Separate with space or a tone step. Tables, form fields and
  interface fragments marked `data-ui` may keep their own borders.
- No icon-topped feature card grids. Each section uses a different composition from its neighbours.
- **No real photographs.** The owner removed them for copyright reasons. Use drawn interface fragments (`RxSlip`,
  `PhoneRx`, `PayCard`, `DepartmentsCard`, `QrMark`) inside O shapes, or flat drawings in the palette.
- Equal page margins (`--m`), section gap `--gap`, no empty stretches taller than half a screen.
- Accessibility: visible focus (orange outline), labels on every field, contrast at least 4.5:1 for text,
  everything moving must stop under `prefers-reduced-motion`.

## 6. Logo and mascot

**Logo** (`client/public/brand/`): `odyssey-horizontal.svg`, `odyssey-monogram.svg`, and `-reverse` versions for navy
grounds. Never stretch, recolour, rotate or add effects. The product lockup is `<Lockup />` (monogram plus
"E-Prescription / by ODYSSEY"); `<Lockup light />` on navy.

**Ody** is the ODYSSEY mascot, a small Greek hoplite built from the O. The e-Prescription kit is the **Rod of Asclepius**
(one snake, never a caduceus, never a red cross) and a **capsule** shield. Personality: helpful, cheerful, calm, brave,
not pushy or aggressive. Refer to Ody as "it".

Files: `ody-erx-happy.svg`, `ody-erx-celebrate.svg`, `ody-erx-thinking.svg` (approved expressions), plus animated
variants `ody-erx-wave.svg`, `ody-erx-throw.svg`, `ody-erx-duel.svg`, and `ody-spear.svg`. All share the viewBox
`9 4 256 211` (widened on the right so the spear can swing); keep that for any new variant.

Where Ody may appear (mascot guidelines):

- Yes: welcome and onboarding, empty states with a next step, success ("prescription sent", "paid"), loading with a message.
- **Never** on login, payment or checkout forms, next to clinical data (dosage, allergies, interactions), on error or
  security screens, or instead of the logo. One Ody per screen. On navy, only on a warm-white panel.
- Do not draw new faces, poses or outfits, mix kits, stretch, recolour or put text on Ody without ODYSSEY approval.

Always use the `<Ody />` component, never a raw `<img>`:

```jsx
<Ody mood="happy" alt="Ody, the ODYSSEY mascot" />   // mood: 'happy' | 'celebrate' | 'thinking'
<Ody enter spar mood={mood} alt="…" />               // hero only: entrance + spear practice
```

## 7. Ody's animations (built into `<Ody />`)

The owner approved going beyond the guidelines here. Keep these working; do not add more without asking.

- **Idle float** (5 s loop), **entrance** rise (`enter`), **expression crossfade** between moods.
- **Thinking**: slow side sway. **Celebrate**: double hop.
- **Hops**: on hover, and on its own every 3.5 to 9 s.
- **Wave**: about 1.6 s after load, then every 9 to 17 s (happy face only).
- **Spear practice** (`spar`, hero only, screens 1280px and wider), every 24 to 40 s, skipped while the hero demo runs:
  1. Throw (2.6 s): wind up, spear flies in an arc into the training target, quivers.
  2. Duel (4 s), in anime fight-scene style (generic, not copied from any series): focus lines, dash with afterimages
     and speed lines, five-jab flurry with sparks and small shake, leap and hang, slam with big spark, shockwave and
     heavy shake, freeze frame, dash home.
- Motion is translation only for Ody's body (no squash or tilt). Timing lives in two places that must stay in sync:
  the SMIL timelines inside the SVG files and the CSS keyframes at the end of `site.css` (`ody-duel`, `ody-fly-*`,
  `ody-burst-*`, `ody-shake-*`, contact times 510/740/970/1200/1430 ms and the slam at 2470 ms).
- The scheduler skips acts while the tab is hidden and when `prefers-reduced-motion: reduce` is set.
- To turn the fight off, remove `spar` from the hero `<Ody>` in `Landing.jsx`.

## 8. Voice

Clear, confident, approachable, technically credible. Short sentences, the point first, "we" and "you".
Say "Launch is planned for 12 weeks after sign-off", not "Lightning-fast, guaranteed".
Avoid: revolutionary, seamless, cutting-edge, next-gen, world-class, guaranteed, "Oops!". Never invent customers,
quotes, ratings or statistics. Ody's lines are optional; the interface must make sense without them.

## 9. Open items to confirm with ODYSSEY before launch

- Plan prices and limits in `plans.js` (Starter free / 20 Rx, Solo ₱499 / 250, Clinic ₱1,999 / 1,500 and 5 doctors, ₱349 per extra doctor, yearly = 10 months).
- Policy copy on the pricing page (80% warning email, prorated upgrades, VAT included, cancellation terms).
- `CONTACT_EMAIL` is a placeholder (`hello@odyssey.example`).
- Sample names and PRC numbers in the drawn fragments are fictional.
- Approval of the favicon, the wave, throw and duel poses and effects (outside the mascot guide).

## 10. Sign-in pages (built; follow this pattern for any auth screen)

`/login` and `/admin/login` both use `AuthShell` + `AuthField` from `client/src/features/auth/components/AuthShell.jsx`.
Reuse them for any new sign-in, sign-up, forgot-password or reset-password screen instead of building a new layout.

- **Layout:** two columns at 960px and wider. Left (5/12): navy panel with `<Lockup light />`, a two-line headline
  (`sideTitle`), one sentence (`sideText`), and the O in a lighter navy (`.o-letter--on-navy`) holding a drawn `RxSlip`,
  cropped by the bottom edge. Right (7/12): warm ground, a "Back to site" link top right, the form in a 440px column.
  Below 960px the navy panel is hidden and the lockup sits top left.
- **Heading:** `h1` "Sign in" (or what the page does) at `--t2`, one lead sentence in slate.
- **Fields:** `AuthField`: label above, 56px tall white field with 18px radius, no border, orange focus outline,
  red-brown outline and message on error. Password fields get a "Show / Hide" text button, never an eye icon only.
- **Button:** full-width navy pill, label says the action ("Sign in", "Sign in to the console"), shows "Signing in…"
  while busy.
- **Server errors:** one plain box (`.aform__error`), neutral wording ("Email or password is incorrect"), no "Oops".
- **Footer links:** register, a note for patients that they need no account, the other portal's sign in.
- **No Ody** on any auth screen (mascot rule). Keep the existing sign-in logic, validation and redirects untouched.

## 11. Doctor portal: how to design it

Scope: the shell (`client/src/components/layout/AppShell.jsx`, `Navbar.jsx`, `Sidebar.jsx`) and every page under
`client/src/features/doctor/` (`DoctorDashboard`, `CreatePrescription`, `DoctorProfile`, `DoctorQrManagement`,
`DoctorPending`, `DoctorRegister`, and the components `PrescriptionHistory`, `MedicineFields`, `CopyLinkButton`).
The admin dashboard uses the same shell and must look like the same product.

### 11.1 Ground rules for app screens

The portal is a tool doctors work in every day, so it is quieter and denser than the marketing pages:

- Same palette, fonts and O motif as the site, but smaller type: page title 32px Poppins 700, section titles 20px
  Poppins 600, body 15 to 16px Inter, table and meta text 14px. Nothing below 13px.
- Ground is Warm White; panels are White with an 18 to 20px radius. Panels may have a quiet 1px `--mist` border here
  (app screens are the exception to the no-outline rule). No shadows except menus, toasts and dialogs.
- **One orange accent per screen**: the main action (usually "New prescription" or "Create prescription"), as an
  orange pill with navy text. Other buttons are navy pills or light pills (`--sand`).
- Icons: Lucide line icons at 18 to 20px in navy or slate, inline with text. **No icons in coloured tiles**, no
  gradients, no glows, no blur backdrops, no rainbow charts.
- Status is words plus a small O dot, not coloured pill badges: paid = navy dot "Paid", waiting = orange dot
  "Waiting for payment", expired or failed = slate dot. Never red for normal states.
- Numbers use `font-variant-numeric: tabular-nums`, pesos written `₱1,999`, dates `20 Oct 2026` (Asia/Manila).
- Every data view has four designed states: loading (sand skeleton rows), empty, error (plain sentence + "Try again"),
  and filled. Never invent numbers or show fake data in production.
- Phone first: every page works at 390px with thumb-sized (44px) targets.

### 11.2 How to implement it

- Wrap the shell root in `className="ody ody-app"` so the brand tokens and fonts apply, and put portal styles in a new
  `client/src/features/portal/portal.css` scoped under `.ody-app`. Reuse the O classes and tokens from `site.css`.
- Restyle the shared primitives in `client/src/components/ui/` (`Button`, `Input`, `Select`, `Textarea`, `Card`,
  `Badge`, `Modal`, `Spinner`) to the brand **without changing their props**, so every portal page updates at once.
- Optionally add an `ody` colour set and Poppins as `display` font in `client/tailwind.config.js` so Tailwind classes
  can use the brand; stop using the old `brand-*` teal, `gold-*`, `.mesh-bg`, `.glass`, `.dark-panel`, `.eyebrow`.
- **Do not touch** data fetching, Supabase calls, RLS assumptions, validation schemas, routes or the payment flow.
  Design changes only.

### 11.3 Shell (sidebar, top bar, mobile drawer)

- **Top bar** (64px, white, quiet bottom border): `<Lockup />` left; on the right the doctor's name and a menu
  (Profile, Sign out). On phones: lockup, a "Menu" button that opens the drawer.
- **Sidebar** (desktop 1024px+, 248px wide, white): nav items as 44px rows, 15px Inter 500, Lucide icon + label.
  Active item: sand fill, navy text, orange O dot on the left. Labels: "Dashboard", "New prescription",
  "Doctor and clinic details", "Payment QR codes". At the bottom, the plan usage meter (section 11.4) and the
  RA 10173 note in 13px slate.
- **Drawer** (phones and tablets): slides from the left, white panel with a dialog shadow, plain navy scrim at 50%
  (no blur), Escape and scrim click close it.

### 11.4 Dashboard (`/doctor`)

1. **Header row:** `h1` "Good morning, Dr. Dela Cruz" (greeting by Manila time), meta line in slate: specialty ·
   clinic · PRC number. Right: orange "New prescription", light "Doctor details".
2. **This month strip** (one white panel, three figures side by side, not three icon cards): "Prescriptions this month"
   with a usage meter against the plan limit (e.g. "205 of 250", bar turns orange at 80%), "Waiting for payment",
   "Collected this month" in pesos. Figures 28px Poppins, labels 14px slate. If the plan limit is not in the data yet,
   show the count without the meter rather than inventing a limit.
3. **Prescription history:** a real table on desktop: Date, Patient, Rx no., Fee, Status, actions ("Copy link",
   "Open"). Search by patient name and a status filter (All, Paid, Waiting) above it. On phones each row becomes a
   white card: patient name, date and fee, status line, the two actions as full-width buttons.
4. **Empty history:** Ody happy (120px) + "Nothing here yet. Write your first prescription." + orange
   "New prescription". This is one of the few portal places Ody belongs.
5. **Error:** plain sentence "We couldn't load your prescriptions." + "Try again". No Ody.

### 11.5 New prescription (`/doctor/new`)

- **Clinical screen: no Ody anywhere on the form.**
- Desktop 1280px+: form in columns 1 to 7, a **live preview** of the slip (`RxSlip`, extended to take real values)
  sticky in columns 8 to 12, updating as the doctor types. Below 1280px the preview is a "Preview" button that
  opens it in a sheet.
- Form in white panels, in this order, each with a 20px section title:
  1. **Patient:** full name, sex, date of birth (age shown beside it), contact number, address.
  2. **Diagnosis and notes.**
  3. **Medicines** (`MedicineFields`): one row per medicine: generic name first, brand in brackets (help text cites
     RA 6675), strength, form, Disp. quantity, Sig. "Add medicine" as a light pill; remove as a text button with
     confirmation only if the row has content.
  4. **Access fee and security:** fee in pesos (default from env), security PIN toggle with 4 to 6 digits, which
     payment QR the patient will see.
- Sticky bottom bar on phones with the orange "Create prescription" button; on desktop the button ends the form.
- Note under the button in 14px slate: "Prescriptions cannot be edited after they are created."
- **Success screen** (allowed Ody moment: "prescription sent"): Ody celebrate (140px), headline
  "Prescription created", the link in a field with "Copy link" (navy) and share buttons for Viber, Messenger and SMS
  where supported, the PIN shown once with "Tell your patient this PIN in person", then "Write another" (light) and
  "Back to dashboard" (text link). Voice: "Send the link to your patient. It opens once they pay."

### 11.6 Doctor and clinic details (`/doctor/profile`)

- Two white panels: **Professional identity and licenses** (full name and degree, specialty, PRC, PTR, PDEA S2) and
  **Clinic** (name, address, phone). Right column on desktop: a live preview of the letterhead as it prints on the
  slip (the top of `RxSlip`).
- Save with a navy "Save changes" in a sticky bar that appears only when something changed. Success is a toast
  "Details saved". No Ody (licence data is sensitive, keep it plain).

### 11.7 Payment QR codes (`/doctor/qr-codes`)

- Header with orange "Add payment QR". Grid of white panels, one per QR: provider (GCash, Maya, bank) as text,
  account name, masked number (`•••• 2210`), the QR image on a white square, an on/off **switch** labelled
  "Shown to patients", and "Remove" as a text button.
- Add/edit in a `Modal` (white, dialog shadow): provider select, account name, number, QR upload with a drop area
  (dashed border is allowed only here), preview before saving.
- Remove asks for confirmation in a small dialog, plain wording, no Ody.
- **Empty state:** Ody happy + "No payment QR yet. Add your GCash, Maya or bank QR so patients can pay you."

### 11.8 Waiting for approval (`/doctor/pending`)

- Warm page using the `AuthShell` look (navy side panel on desktop). Title "We're checking your PRC license".
- A **linked-steps** row (brand device: rounded shapes sharing one wall, the current step in orange):
  Registered → License uploaded → Admin review → Approved.
- If no licence file yet: an upload area for JPG, PNG or PDF with clear size limits.
- Ody thinking (100px) is allowed here as a waiting state, with the sentence "This usually takes one to two
  business days." Only state a turnaround if ODYSSEY confirms it; otherwise "We'll email you when you're approved."

### 11.9 Doctor registration (`/doctor/register`)

- Use `AuthShell` with a wider form column (560px). It is an account-creation form, so **no Ody**.
- Sections with 20px titles: Account (name, email, password, confirm), Professional (PRC, specialty, PTR, S2),
  Clinic (name, address, contact), License upload. Navy panel text: "What happens next: an administrator checks your
  PRC license, then you can send your first prescription."
- Orange "Create account" at the end; inline errors per field; plain server error box.

### 11.10 Admin dashboard (`/admin`)

Same shell with admin nav ("Doctor approvals"). Queue as a table: doctor, PRC no., specialty, submitted date, status,
"Review". Review opens the licence image and Approve (navy) / Reject (light, asks for a reason) in a dialog.
No Ody (security and verification screens).

## 12. Tasks

When the owner says "do Task N", do exactly that task, following every rule in this file. Do the tasks in order if
a later one depends on an earlier one, and say so if a dependency is missing.

### Task 1: Restyle the doctor portal

Apply section 11 to the shell and every doctor and admin page. Done when no portal page uses the old teal styles and
the checklist in section 13 passes.

### Task 2: Interactive setup guide ("Show me around")

Build a step-by-step, interactive guide that teaches a newly approved doctor to set up the clinic details, add a
payment QR and write a first prescription. It opens as a welcome modal, then walks through the real screens with a
highlighted spotlight and an **arrow pointing at the exact control**, and it has a **"Don't show this again"**
checkbox. Do Task 1 first, or at least style the guide to section 11; the guide must look like the portal.

**Where the code goes**

- New folder `client/src/features/onboarding/`: `TourProvider.jsx` (context, state, routing between steps),
  `steps.js` (the step list below, data only), `WelcomeModal.jsx`, `Coachmark.jsx` (spotlight, bubble, arrow),
  `onboarding.css` (scoped under `.ody-app`, brand tokens only).
- Wrap the doctor portal routes in `TourProvider` inside `AppShell`. No new npm packages: build it with React and
  CSS (no react-joyride or similar).
- Targets are found by attributes, never by class names: add `data-tour="…"` to the real elements, e.g.
  `data-tour="nav-profile"`, `"clinic-panel"`, `"license-fields"`, `"profile-save"`, `"nav-qr"`, `"qr-add"`,
  `"qr-switch"`, `"nav-new"`, `"rx-patient"`, `"rx-medicines"`, `"rx-fee"`, `"rx-create"`.

**When it shows**

- Automatically on the first visit to `/doctor` after approval, unless the doctor ticked "Don't show this again".
- Any time from a "Show me around" item in the top-bar user menu, and from a small "Setup guide" link under the
  sidebar nav. Opening it by hand ignores the "don't show" setting.
- Never on `/doctor/pending`, `/doctor/register`, sign-in pages, the patient view or the admin portal.

**"Don't show this again"**

- A real checkbox (`<input type="checkbox">` with a label) on the welcome modal and on the last step, unticked by
  default. When ticked and the guide is closed, it never opens automatically again for that doctor.
- Store it per doctor in `localStorage` under `eprx:setup-guide:v1:<userId>` as
  `{ "dismissed": true, "lastStep": "…", "updatedAt": "ISO date" }`, wrapped in try/catch (private mode can throw).
- Do **not** add a database column without asking. If the owner wants it to follow the doctor across devices,
  propose a `profiles.setup_guide_dismissed_at` column and RLS change first.

**The steps** (each bubble: step title, one or two short sentences, "Step N of 9", Back, Next, Skip guide)

1. **Welcome modal** (centred dialog, Ody happy at 120px is allowed here: it is onboarding). Title
   "Welcome, Dr. {last name}". Text: "Three things get you ready to send your first prescription." A checklist that
   reflects real data, each with a tick when done:
   - Clinic details complete (PRC, PTR, clinic name and address filled)
   - At least one payment QR switched on
   - First prescription sent
   Buttons: orange "Show me around", light "I'll explore on my own", plus the "Don't show this again" checkbox.
2. **Sidebar → Doctor and clinic details** (`nav-profile`). "Start with your details. They print on every
   prescription." Next navigates to `/doctor/profile`.
3. **Licences** (`license-fields`). "Add your PRC, PTR and, if you prescribe dangerous drugs, your S2 number."
4. **Clinic** (`clinic-panel`), then **Save** (`profile-save`). "Your clinic name and address form the letterhead.
   Save when you're done." The guide waits on this step until Next is pressed; it does not save for the doctor.
5. **Sidebar → Payment QR codes** (`nav-qr`), navigates to `/doctor/qr-codes`.
6. **Add payment QR** (`qr-add`), then **Shown to patients switch** (`qr-switch`, skip this sub-step if no QR exists
   yet). "Upload your GCash, Maya or bank QR. Patients pay the fee into it before the prescription opens."
7. **Sidebar → New prescription** (`nav-new`), navigates to `/doctor/new`.
8. **The prescription form**, three stops on one page: patient details (`rx-patient`), medicines with generic name
   first (`rx-medicines`, mention RA 6675), fee and security PIN (`rx-fee`). **No Ody on these stops** (clinical
   screen); bubbles only.
9. **Create and share** (`rx-create`). "Create the prescription, then copy the link into Viber, Messenger or SMS.
   It opens once your patient pays." Last bubble shows the "Don't show this again" checkbox and a navy "Finish".
   Finishing shows a short closing dialog with Ody celebrate: "You're set up. Your first prescription is one click
   away." with an orange "Write a prescription" and a light "Back to dashboard".

**How the interaction must work**

- **Spotlight:** a fixed full-screen scrim (navy at 55%) with a cut-out around the target (8px padding, 14px
  radius). The target stays clickable only if the step says so; otherwise clicks on the scrim do nothing.
- **Arrow:** an orange arrow (inline SVG, 3px stroke, rounded caps, arrowhead) from the bubble edge to the target's
  nearest edge, recalculated on scroll, resize and route change. A soft orange ring pulses around the target
  (translate and opacity or scale of the ring only, never of the target itself).
- **Bubble placement:** prefer below the target, then above, right, left. It must never cover the target or leave
  the viewport (16px margin). On phones (below 640px) the bubble docks as a bottom sheet, full width, and the arrow
  points up to the target.
- **Finding targets:** after navigating, wait for the target (poll up to 3 seconds), scroll it into view smoothly
  (instantly under reduced motion), then show the step. If it never appears, show the bubble centred with
  "Can't find this on the screen. You can skip this step." and keep Next working.
- **Keyboard and screen readers:** the bubble is a `role="dialog"` with `aria-labelledby` and `aria-describedby`,
  focus moves into it and is trapped while open, Esc closes the guide (asks nothing, remembers the step),
  Left/Right arrow keys go Back/Next, focus returns to where it was after closing. Announce "Step N of 9" politely.
- **Progress:** O dots (`.o-dot`) for the steps, current one orange. Remember `lastStep` so "Show me around" can
  offer "Continue where you left off".
- **Reduced motion:** no pulse, no slide; the bubble and arrow simply appear.
- **Never** block real work: the doctor can close the guide at any step, and nothing in the guide submits a form,
  saves data or creates a prescription.

**Look**

- Bubble: white panel, 20px radius, dialog shadow (allowed: it floats), 360px max width, 16px Inter body, 20px
  Poppins 600 title. Buttons: navy "Next" pill, light "Back", text link "Skip guide". Arrow and ring orange.
- Welcome and closing dialogs use the restyled `Modal` from Task 1.
- Copy follows section 8: short, plain, "you". No "Oops", no exclamation marks.

**Done when**

- A newly approved doctor sees the welcome modal once; ticking "Don't show this again" stops it permanently on that
  browser, and "Show me around" still opens it.
- Every step points at the right element at 1440, 1024 and 390 px, including after navigating between pages.
- Keyboard-only and screen-reader walkthrough works; reduced motion has no animation.
- No console errors, no layout shift on the underlying page, build passes, and the checklist in section 13 passes.
- Report which steps were checked on which widths and anything not verified.

## 13. Before you say a UI change is done

1. `npm --prefix client run build` passes.
2. Check the page at 1440, 1366, 1024 and 390 px wide: no horizontal scroll, headlines within two lines, nothing
   overlapping headings or buttons, Ody never standing on navy.
3. Check with reduced motion on: content visible, no animation.
4. Say plainly what you did not check.
