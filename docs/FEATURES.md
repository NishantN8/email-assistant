# Features Guide

A walkthrough of every user-facing feature in the AI Email Copilot.

---

## Smart Inbox

The main inbox is AI-sorted by importance — not by date. Every email receives a **priority score from 0–100** before you see it.

### Priority sections

Emails are grouped into four sections automatically:

| Section | Criteria |
|---|---|
| **Priority** | Score ≥ 70, or requires a reply |
| **Work on it** | Score 40–69, action recommended |
| **FYI** | Transactions, social, promotions — no action needed |
| **Low Priority** | Score < 40, everything else |

The Low Priority section is collapsed by default. Click to expand.

### Reading indicators

- Blue dot on the left = **unread**
- Bold subject = unread
- `TASK` badge = an action item has been created for this email
- Priority score badge (e.g. `100`) — hover for the AI's reasoning

### Sender grouping

When multiple emails arrive from the same sender, they are automatically collapsed into a group. Click "+N more from [sender]" to expand.

---

## Filter Chips

The stats bar at the top of the inbox shows quick filters. Click any chip to activate it — click again to clear.

| Chip | What it shows |
|---|---|
| **Need Action** | Emails where AI recommends a reply or specific action |
| **Critical** | Priority score ≥ 80 |
| **Payments** | Transaction category only |
| **Unread** | All unread emails |

When a filter is active, a small badge appears next to the inbox title showing the filter name. Click the badge's × to clear.

---

## Search

The search bar (below the inbox title) searches across **sender name, sender email, subject, and snippet** in real-time with a 300ms debounce.

- Press **Escape** to clear the search
- The result count updates live as you type
- Search and a filter chip can be active simultaneously — both are applied together

---

## AI Decision Panel

Click any email to open it in the right panel. The panel shows:

- **Full email body** (rendered HTML or plain text)
- **AI reasoning** — why this email was scored the way it was
- **Recommended action** — Reply, Track, Archive, or Ignore
- **Confidence** — how certain the AI is (0–100%)
- **Model used** — local (Ollama) or cloud and which provider
- **Swarm Analysis** (for high-priority emails) — collapsible panel showing each specialist agent's finding and confidence score

---

## AI Reply Strategist

Press **R** on any email, or click the reply button, to open the AI Reply Box.

The reply opens in **AI mode by default** — a draft is generated immediately. You get:

- **4 tone variants** — Direct / Diplomatic / Brief / Detailed
- **Switch to manual mode** — click "Write myself" in the reply header
- **Model badge** — shows which model generated the reply
- **Regenerate** — get a new draft with the same tone

Click **X** to close without sending.

---

## Keyboard Shortcuts

| Key | Action |
|---|---|
| `j` | Next email |
| `k` | Previous email |
| `r` | Reply (opens AI reply box) |
| `e` | Archive selected email |
| `Escape` | Close reply box / clear search / deselect email |

---

## Smart Cleanup

Click **Clean Inbox** in the top-right of the inbox header to open the cleanup panel.

The cleanup engine scores every email across 12+ heuristic signals without AI (fast, no API calls):

- Gmail category labels (PROMOTIONS, FORUMS, SOCIAL)
- Promotional keyword density
- Unsubscribe link presence
- Link-to-text ratio
- Sender domain patterns
- Your interaction history with the sender

### Categories

| Category | Description |
|---|---|
| **Spam** | Likely unwanted or malicious |
| **Newsletters** | Mass-sent content you subscribed to |
| **Promotions** | Marketing and sales emails |
| **Low Priority** | Low-signal emails unlikely to need action |

### Actions

Select individual emails or use **Select All** within a category, then choose:

- **Archive** — moves to archive, out of inbox
- **Mark as Spam** — marks as spam and moves to spam folder
- **Trash** — moves to trash

Unsubscribe links are shown directly in the panel — click to unsubscribe without opening the email.

---

## Action Feed

Navigate to **Action Feed** in the sidebar to see your task queue.

Tasks are auto-generated from inbox emails with priority score ≥ 50. Each task includes:

- Email subject and sender
- Task type (Reply, Pay, Track, Review, Follow-up)
- Priority score
- Status (Needs Action / In Progress / Done)

### Task statuses

Filter tasks using the sidebar links: **Needs Action**, **In Progress**, **Done**.

### Generating tasks

Click **Generate Tasks from Inbox** to scan your inbox and create new tasks. Click **Re-scan** to refresh when new emails arrive.

---

## Sidebar

The left sidebar can be collapsed to icon-only mode by clicking the **‹** toggle at the top right of the sidebar. The sidebar animates between 256px (full) and 56px (collapsed).

Navigation items:
- **Smart Inbox** — main inbox
- **Sent** — sent mail
- **Archive** — archived emails
- **Trash** — deleted emails
- **Action Feed** — task queue
- **Settings** — preferences

The bottom of the sidebar shows **Sync Status** — whether Gmail is idle or actively syncing, and the timestamp of the last successful sync.

---

## Gmail Sync

Connect your Gmail account using the **Connect Gmail** button in the sidebar.

After connecting:
- The inbox syncs immediately with your real Gmail
- Background sync runs every 5 minutes automatically
- New emails are AI-scored as they arrive
- The sync status indicator in the sidebar shows live state

To disconnect, go to **Settings → Disconnect Gmail**.

---

## Settings

Configure your preferences in the Settings page:

| Setting | Description |
|---|---|
| **Default reply tone** | Pre-select the tone for AI replies (Direct / Diplomatic / Brief / Detailed) |
| **Sync interval** | How often Gmail polls for new mail (default: 5 minutes) |
| **Notifications** | Enable/disable desktop notifications for new emails |

---

## GPU / AI Status

The **GPU Widget** (visible in the bottom of the AI panel) shows:

- Whether Ollama is running locally
- Active model name
- GPU name and VRAM usage
- Whether CUDA is available
- Current AI routing (local vs. cloud)

This is a live view — it updates in real time as emails are processed.
