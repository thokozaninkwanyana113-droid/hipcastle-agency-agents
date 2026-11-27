# Hipcastle Agency — Client Communications Plan

How Hipcastle communicates with prospects and clients, from first enquiry to aftercare. The system enforces this plan:
- **Touchpoints:** every automated message is listed in [`server/src/communications.js`](server/src/communications.js).
- **Controls:** Command Centre → **Communications plan** shows 30-day volumes and switches off optional messages.

## 1. Principles

| | Principle | In practice |
|---|---|---|
| 1 | **One clear next step** | Every message ends with a single button or action: pay, approve, book, reply. |
| 2 | **Speed** | We reply to enquiries within **1 business day**. Support first-response targets are urgent 4 h, high 1 business day, normal 2, and low 3. Care-plan clients get their plan's faster target. |
| 3 | **No surprises** | Every invoice, payment, approval request, status change and signed agreement is confirmed in writing and visible in the client portal. |
| 4 | **Respect people's time** | Nudges and digests only go out in SA business hours: Mon–Fri 08:00–17:00 SAST, excluding public holidays. That includes Good Friday and Family Day, and Sunday holidays move to Monday. Limits: at most **two** payment reminders, **one** enquiry follow-up, approval reminders every 3 days, and never a drip sequence. |
| 5 | **A person behind every email** | The reply-to is a monitored inbox: `hello@`, or `accounts@` for billing. Replies reach a person, not a bot. |
| 6 | **Plain South African English** | Rand amounts, SAST times, local payment methods (PayFast, Ozow, EFT, SnapScan, Zapper), no jargon. |
| 7 | **POPIA** | Marketing (the newsletter) needs double opt-in and has one-click unsubscribe. Service messages are only about the client's own engagement. Passwords, card and ID numbers are removed from anything people type, and guidance on sharing access safely is given. |

## 2. Channels

| Channel | Used for | Owner |
|---|---|---|
| **Email** (automated) | Every touchpoint below | System; reply-to goes to the team |
| **Client portal** | Milestones, approvals, invoices, messages, support tickets, agreements, care-plan hours | Client and team |
| **WhatsApp** | Quick questions and the prospect's preferred contact: the "WhatsApp us" button, plus calls from the CRM | Sales and the project lead (manual) |
| **Phone / Google Meet / Teams** | Strategy session, kick-off, monthly review calls | Project lead |
| **Website assistant** | 24/7 answers from the published knowledge, with a handoff to a person | System, then the team |
| **Newsletter** | Monthly growth tips (opt-in only) | Marketing |

## 3. Journey touchpoints

*BH* = held for business hours. *Optional* = can be switched off in the Command Centre. Everything else is essential.

### Enquiry
| Message | To | Trigger | Timing |
|---|---|---|---|
| `lead.autoreply` | Prospect | Contact form or chat handoff | Immediately, with the booking link if one is set |
| `lead.notify` / `chat.handoff` | Team | New enquiry | Immediately. **Reply within 1 business day** |
| `lead.stale` | Team | Enquiry still "new" after 1 business day | Daily digest, BH, optional |
| `lead.followup` | Prospect | No order 3 days after enquiring | **Once**, BH, optional |

### Order
| Message | To | Trigger | Timing |
|---|---|---|---|
| `order.confirmation` / `order.notify` | Client / team | Order placed | Immediately |
| `agreement.signed` | Client and team | Agreement signed | Immediately, with the full text |
| `order.unpaid` | Client | First invoice or agreement outstanding | 24 h and 3 days after ordering (max 2), BH, optional |

### Onboarding and delivery
| Message | To | Trigger | Timing |
|---|---|---|---|
| `onboarding.start` | Client | Deposit received | Immediately |
| `onboarding.reminder` | Client | Onboarding incomplete | Every 3 days, BH, optional |
| `onboarding.complete` | Team | Onboarding finished | Immediately. Book the kick-off call |
| `project.weekly` | Client | Active project | **Mondays**, BH, optional: progress %, what was done, what's next, what's waiting on the client |
| `deliverable.ready` / `deliverable.response` | Client / team | Approval requested or given | Immediately |
| `approval.reminder` | Client | Approval waiting 3+ days | Every 3 days, BH, optional |
| `message.new` | Client / team | Portal message | Immediately |
| `order.status` | Client | Started, in review or completed | Immediately |

### Billing
| Message | To | Trigger | Timing |
|---|---|---|---|
| `invoice.issued`, `retainer.cycle` | Client | Invoice or new month | Immediately. Autopay clients are told no action is needed |
| `invoice.reminder` | Client | Invoice overdue | Once, BH |
| `payment.receipt` / `payment.failed` | Client | Gateway confirmation | Immediately |
| `payment.notify`, `payment.duplicate` | Team | Payment events | Immediately |

### Support
| Message | To | Trigger | Timing |
|---|---|---|---|
| `ticket.created` / `ticket.notify` | Client / team | Ticket opened | Immediately, with the response target |
| `ticket.reply` | Client / team | Reply | Immediately |
| `ticket.resolved` | Client | Resolved | Immediately, with a 1–5 rating link |
| `ticket.sla` | Team | Target missed | Once per ticket |

### Aftercare and loyalty
| Message | To | Trigger | Timing |
|---|---|---|---|
| `feedback.request` | Client | Project delivered | Immediately: rating, then a review request for promoters |
| `care.offer` | Client | Free support ends in 7 days | Once, BH |
| `care.hours` | Client and team | Care allowance used up | Once a month. Extra work is quoted first |

### Operator (internal agent)
| Message | To | Trigger | Timing |
|---|---|---|---|
| `operator.email` | Prospect or client | An email the Operator drafted, **approved by a person** | When approved |
| `operator.brief` | Team | Daily Operator review | Weekdays from 07:30 SAST, optional |

### Monitoring & tenders (team)
| Message | To | Trigger | Timing |
|---|---|---|---|
| `site.down` / `site.recovered` | Team | A monitored client site fails two checks in a row / comes back | Immediately |
| `site.ssl` | Team | A client's TLS certificate expires in 14, 7 or 2 days | Immediately |
| `tenders.digest` | Team | New government tenders match a Sales & Tenders client's keywords | Daily, business hours |

**WhatsApp:** clients who opt in on their account page also get `deliverable.ready`, `invoice.issued` and `ticket.reply` on WhatsApp, using pre-approved templates. Email is always sent too.

### Account security
| Message | To | Trigger | Timing |
|---|---|---|---|
| `auth.security` | Account owner | Two-step sign-in turned on/off, reset by an admin, locked after wrong codes, or a recovery code used | Immediately (essential) |

## 4. Human touchpoints (not automated)

| When | Who | What |
|---|---|---|
| Within 1 business day of an enquiry | Sales | Reply on the prospect's preferred channel. Mark the lead *contacted* in the CRM. |
| Strategy session | Sales lead | 30 minutes: goals, budget, a package recommendation. Follow up the same day with the link to order. |
| Kick-off (within 5 working days of the deposit) | Project lead | Confirm scope, timeline, approvers and access. Re-plan the timeline in the portal. |
| Monthly (retainers and care plans) | Project lead | Review call and report. Agree next month's plan in the portal. |
| A detractor score (0–6) or CSAT of 1–2 | Founder or lead | Call within 1 business day to understand and fix the problem. |
| A promoter score (9–10) | Account lead | Ask for a Google or Hellopeter review and a referral. |
| 7 days before free support ends | Account lead | Personal call to recommend a care plan; the automatic email goes too. |

## 5. Escalation

1. **Missed response targets** trigger team alerts (`ticket.sla`, `lead.stale`, `pipeline.digest`).
2. **System failures** alert by email, and to chat if `ALERT_WEBHOOK_URL` is set (`system.alert`).
3. **Unhappy clients** (CSAT ≤ 2 or score ≤ 6) appear in the activity log as warnings. The account lead calls them.

## 6. Measuring it

Command Centre → **Communications plan** shows the 30-day volume and failures for every message. The other places to check are:
- **Growth:** the enquiry → paid funnel.
- **Support desk:** response targets met and CSAT.
- **Assistant chats:** helpful rate and handoffs.

Review the plan quarterly. Switch off any optional message that isn't helping, and edit copy in `server/src/email/templates.js`.
