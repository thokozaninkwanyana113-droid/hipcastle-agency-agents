// Every email the system sends. Each template returns { subject, preheader, heading, blocks, ... }
// and is rendered by layout.js. `sample` data powers the previews in the Command Centre.
import { getSettings } from '../settings.js';
import { canonicalUrl } from '../urls.js';

const zar = new Intl.NumberFormat('en-ZA', { style: 'currency', currency: 'ZAR', minimumFractionDigits: 2 });
const rand = (c) => zar.format((c || 0) / 100).replace(/ /g, ' ');
const first = (name = '') => name.trim().split(/\s+/)[0] || 'there';
const wa = (s, text) => (s.whatsapp ? `https://wa.me/${s.whatsapp}?text=${encodeURIComponent(text)}` : null);

const invoiceTable = (inv) => [
  ['Invoice', inv.number],
  ...(inv.description ? [['Description', inv.description]] : []),
  ...(inv.vat_cents ? [['Subtotal', rand(inv.subtotal_cents)], ['VAT', rand(inv.vat_cents)]] : []),
  ['Amount due', rand(inv.amount_cents)],
  ['Due date', inv.due_at],
];

export const TEMPLATES = {
  // ------------------------------------------------------------------ Leads
  'lead.autoreply': {
    audience: 'Lead', description: 'Auto-reply when someone requests a strategy session',
    build: ({ lead, service }) => {
      const s = getSettings();
      const chat = wa(s, `Hi ${s.business_name}, I just sent an enquiry (${lead.name}).`);
      return {
        subject: `We’ve received your enquiry, ${first(lead.name)} 👋`,
        preheader: 'A strategist will be in touch within one business day.',
        heading: `Thanks for reaching out, ${first(lead.name)}!`,
        blocks: [
          `We’ve received your request for a free strategy session${service ? ` about ${service}` : ''}. A Hipcastle strategist will contact you by ${lead.preferred_contact === 'whatsapp' ? 'WhatsApp' : lead.preferred_contact || 'email'} within one business day.`,
          'Here’s what happens next:',
          { list: ['We review your goals and business', 'A 30-minute discovery call (Google Meet, Teams, phone or WhatsApp)', 'A tailored recommendation with a fixed rand price', 'You pay the deposit securely online and we kick off'] },
          ...(chat ? [{ p: 'In a hurry? Chat to us on WhatsApp:' }, { button: 'Chat on WhatsApp', href: chat }] : []),
          { p: 'While you wait, our free guides may help:' },
          { button: 'Read our guides for SA entrepreneurs', href: '/blog' },
        ],
        reason: 'You’re receiving this because you submitted the contact form on our website.',
      };
    },
    sample: { lead: { name: 'Thandi Mokoena', preferred_contact: 'whatsapp' }, service: 'Digital Marketing & SEO' },
  },
  'lead.notify': {
    audience: 'Team', description: 'New lead alert for the sales inbox',
    build: ({ lead, service }) => ({
      subject: `🎯 New lead: ${lead.name}${lead.company ? ` (${lead.company})` : ''}${service ? ` — ${service}` : ''}`,
      preheader: lead.message.slice(0, 90),
      heading: 'New strategy-session request',
      blocks: [
        { table: [['Name', lead.name], ['Email', lead.email], ['Phone', lead.phone || '—'], ['Business', lead.company || '—'], ['Province', lead.province || '—'],
          ['Service', service || 'Not sure'], ['Budget', lead.budget || '—'], ['Prefers', lead.preferred_contact || 'email']] },
        { quote: lead.message },
        { note: 'Aim to respond within one business day — speed to lead wins deals.' },
        { button: 'Open in Command Centre', href: '/admin/leads' },
      ],
      signoff: false,
      replyTo: lead.email,
    }),
    sample: { lead: { name: 'Thandi Mokoena', email: 'thandi@example.com', phone: '082 123 4567', company: 'Sweet Treats Bakery', province: 'KwaZulu-Natal', budget: 'R10 000 – R30 000', preferred_contact: 'whatsapp', message: 'We run a bakery in Durban and want more online orders.' }, service: 'Digital Marketing & SEO' },
  },

  // ------------------------------------------------------------------ Accounts
  'user.welcome': {
    audience: 'Client', description: 'Welcome email after creating an account',
    build: ({ user }) => ({
      subject: `Welcome to Hipcastle Agency, ${first(user.name)}`,
      preheader: 'Your client portal is ready.',
      heading: `Welcome aboard, ${first(user.name)}!`,
      blocks: [
        'Your Hipcastle client portal is ready. It’s where you’ll track milestones, pay invoices securely and message your team.',
        { list: ['Choose an Essential, Growth or Enterprise package', 'Pay deposits by card or instant EFT via PayFast or Ozow', 'Follow progress and approve deliverables in one place'] },
        { button: 'Go to my portal', href: '/portal' },
        'Not sure which package fits? Reply to this email or book a free strategy session — we’re happy to help.',
      ],
      reason: 'You’re receiving this because you created an account on our website.',
    }),
    sample: { user: { name: 'Sizwe Dlamini' } },
  },
  'auth.reset': {
    audience: 'Client', description: 'Password reset link (valid for 1 hour)',
    build: ({ user, url }) => ({
      subject: 'Reset your Hipcastle password',
      preheader: 'This link expires in 1 hour.',
      heading: 'Reset your password',
      blocks: [
        `Hi ${first(user.name)}, we received a request to reset the password for your account.`,
        { button: 'Choose a new password', href: url },
        { note: 'This link expires in 1 hour and can only be used once. If you didn’t request it, you can safely ignore this email — your password won’t change.' },
      ],
      reason: 'Security notification for your Hipcastle account.',
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, url: '/reset-password?token=sample' },
  },

  // ------------------------------------------------------------------ Orders & invoices
  'order.confirmation': {
    audience: 'Client', description: 'Order placed — summary and first invoice',
    build: ({ user, order, invoice }) => ({
      subject: `Order confirmed: ${order.service_name} — ${order.tier_name} (${order.reference})`,
      preheader: `Pay ${rand(invoice.amount_cents)} to get started.`,
      heading: 'Your order is confirmed 🎉',
      blocks: [
        `Thanks ${first(user.name)}! We’ve received your order for ${order.service_name} (${order.tier_name}). Your dedicated lead will confirm scope at kick-off.`,
        { table: [['Order reference', order.reference], ['Package', `${order.service_name} — ${order.tier_name}`], ['Package price', `${rand(order.price_cents)} ${order.billing === 'monthly' ? 'per month' : 'once-off'}`]] },
        'To start work, please pay your first invoice:',
        { table: invoiceTable(invoice) },
        { button: `Pay ${rand(invoice.amount_cents)} securely`, href: `/portal/orders/${order.id}` },
        'Pay by card, instant EFT, SnapScan or Zapper (PayFast) or instant EFT (Ozow). We never see your card or banking details.',
      ],
      reason: 'You’re receiving this because you placed an order on our website.',
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, reference: 'HC-1E1AC5', service_name: 'Design & Brand', tier_name: 'Growth', price_cents: 2400000, billing: 'once' },
      invoice: { number: 'INV-EE3612', description: 'Deposit (50%)', subtotal_cents: 1200000, vat_cents: 0, amount_cents: 1200000, due_at: '2026-11-22' } },
  },
  'order.notify': {
    audience: 'Team', description: 'New order alert for the team',
    build: ({ user, order }) => ({
      subject: `📁 New order ${order.reference}: ${order.service_name} — ${order.tier_name}`,
      preheader: `${user.name} placed an order.`,
      heading: 'New order received',
      blocks: [
        { table: [['Client', `${user.name}${user.company ? ` (${user.company})` : ''}`], ['Email', user.email], ['Package', `${order.service_name} — ${order.tier_name}`], ['Value', rand(order.price_cents)], ['Reference', order.reference]] },
        { quote: order.brief },
        { button: 'Open engagement', href: `/portal/orders/${order.id}` },
      ],
      signoff: false,
      replyTo: user.email,
    }),
    sample: { user: { name: 'Sizwe Dlamini', email: 'sizwe@example.com', company: 'Kasi Coffee' }, order: { id: 1, reference: 'HC-1E1AC5', service_name: 'Design & Brand', tier_name: 'Growth', price_cents: 2400000, brief: 'Rebrand for our Soweto coffee shop.' } },
  },
  'order.status': {
    audience: 'Client', description: 'Engagement status changed (started, in review, completed)',
    build: ({ user, order, status }) => {
      const copy = {
        active: ['Work has started 🚀', 'Your team has started work. You can follow every milestone in your portal.'],
        in_review: ['Ready for your review 👀', 'Your deliverables are ready for review. Please check them and send any feedback through your portal.'],
        completed: ['Your project is complete ✅', 'Your engagement is complete. Thank you for trusting Hipcastle! If you’re happy with the result, we’d love a short review.'],
        cancelled: ['Engagement cancelled', 'Your engagement has been cancelled. If this is unexpected, please reply to this email.'],
      }[status] || ['Engagement update', `Your engagement status is now: ${status}.`];
      return {
        subject: `${copy[0]} — ${order.reference}`,
        preheader: copy[1],
        heading: copy[0],
        blocks: [
          `Hi ${first(user.name)},`, copy[1],
          { table: [['Engagement', `${order.service_name} — ${order.tier_name}`], ['Reference', order.reference], ['Progress', `${order.progress}%`]] },
          { button: 'View in my portal', href: `/portal/orders/${order.id}` },
          ...(status === 'completed' ? [{ button: 'Leave a review', href: '/testimonials' }] : []),
        ],
        reason: 'Project update for your Hipcastle engagement.',
      };
    },
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, reference: 'HC-1E1AC5', service_name: 'Design & Brand', tier_name: 'Growth', progress: 60 }, status: 'in_review' },
  },
  'invoice.issued': {
    audience: 'Client', description: 'New invoice issued by staff',
    build: ({ user, order, invoice }) => ({
      subject: `Invoice ${invoice.number} — ${rand(invoice.amount_cents)} due ${invoice.due_at}`,
      preheader: `${order.service_name} — ${order.reference}`,
      heading: 'You have a new invoice',
      blocks: [
        `Hi ${first(user.name)}, a new invoice has been issued for ${order.service_name} (${order.reference}).`,
        { table: invoiceTable(invoice) },
        { button: 'Pay securely online', href: `/portal/orders/${order.id}` },
        'Questions about this invoice? Simply reply to this email.',
      ],
      reason: 'Billing notification for your Hipcastle engagement.',
      billing: true,
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, reference: 'HC-1E1AC5', service_name: 'Design & Brand' },
      invoice: { number: 'INV-7A21C0', description: 'Balance on delivery', subtotal_cents: 1200000, vat_cents: 180000, amount_cents: 1380000, due_at: '2026-12-01' } },
  },
  'invoice.reminder': {
    audience: 'Client', description: 'Friendly reminder when an invoice becomes overdue',
    build: ({ user, order, invoice }) => ({
      subject: `Reminder: invoice ${invoice.number} is overdue`,
      preheader: `${rand(invoice.amount_cents)} was due on ${invoice.due_at}.`,
      heading: 'Friendly payment reminder',
      blocks: [
        `Hi ${first(user.name)}, just a friendly reminder that invoice ${invoice.number} for ${order.service_name} was due on ${invoice.due_at}.`,
        { table: invoiceTable(invoice) },
        { button: 'Pay now', href: `/portal/orders/${order.id}` },
        'If you’ve already paid by EFT, please reply with your proof of payment and we’ll update our records. Thank you!',
      ],
      reason: 'Billing reminder for your Hipcastle engagement.',
      billing: true,
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, service_name: 'Design & Brand' }, invoice: { number: 'INV-7A21C0', subtotal_cents: 1380000, amount_cents: 1380000, due_at: '2026-11-01' } },
  },

  // ------------------------------------------------------------------ Payments
  'payment.receipt': {
    audience: 'Client', description: 'Payment receipt after PayFast/Ozow confirmation',
    build: ({ user, order, invoice, payment }) => ({
      subject: `Payment received — ${rand(payment.amount_cents)} (${invoice.number})`,
      preheader: 'Thank you! Your payment has been confirmed.',
      heading: 'Payment received — thank you!',
      blocks: [
        `Hi ${first(user.name)}, we’ve received your payment. Here’s your receipt:`,
        { table: [['Amount paid', rand(payment.amount_cents)], ['Invoice', invoice.number], ...(invoice.vat_cents ? [['Of which VAT', rand(invoice.vat_cents)]] : []),
          ['Engagement', `${order.service_name} (${order.reference})`], ['Paid via', payment.gateway === 'payfast' ? 'PayFast' : payment.gateway === 'ozow' ? 'Ozow' : payment.gateway],
          ['Payment reference', payment.reference], ...(payment.gateway_txn_id ? [['Gateway transaction', payment.gateway_txn_id]] : [])] },
        ...(order.status === 'active' ? ['Your engagement is now active — your team will be in touch to kick off.'] : []),
        { button: 'View my engagement', href: `/portal/orders/${order.id}` },
      ],
      reason: 'Payment receipt — please keep it for your records.',
      billing: true,
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, reference: 'HC-1E1AC5', service_name: 'Design & Brand', status: 'active' },
      invoice: { number: 'INV-EE3612', vat_cents: 0 }, payment: { amount_cents: 1200000, gateway: 'payfast', reference: 'HCP-MWIB-163BB9', gateway_txn_id: '1089250' } },
  },
  'payment.failed': {
    audience: 'Client', description: 'Payment was declined or failed',
    build: ({ user, order, invoice, payment }) => ({
      subject: `Your payment for ${invoice.number} didn’t go through`,
      preheader: 'No money was taken — you can try again.',
      heading: 'Payment unsuccessful',
      blocks: [
        `Hi ${first(user.name)}, your ${payment.gateway === 'ozow' ? 'Ozow' : 'PayFast'} payment of ${rand(payment.amount_cents)} for invoice ${invoice.number} was not completed. No money was taken.`,
        'You can try again, or choose a different payment method (card or instant EFT).',
        { button: 'Try again', href: `/portal/orders/${order.id}` },
        'Need help? Reply to this email and we’ll sort it out.',
      ],
      reason: 'Billing notification for your Hipcastle engagement.',
      billing: true,
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1 }, invoice: { number: 'INV-EE3612' }, payment: { amount_cents: 1200000, gateway: 'ozow' } },
  },
  'payment.duplicate': {
    audience: 'Team', description: 'Duplicate payment on an already-paid invoice — refund needed',
    build: ({ user, order, invoice, payment }) => ({
      subject: `⚠️ Refund needed: duplicate payment of ${rand(payment.amount_cents)} on ${invoice.number}`,
      preheader: `${user.name} paid ${invoice.number} twice.`,
      heading: 'Duplicate payment — refund needed',
      blocks: [
        { table: [['Client', `${user.name} (${user.email})`], ['Invoice', invoice.number], ['Duplicate payment', payment.reference], ['Gateway', payment.gateway], ['Gateway transaction', payment.gateway_txn_id || '—'], ['Amount', rand(payment.amount_cents)]] },
        { note: 'Refund this payment in the gateway dashboard, then mark it refunded in Command Centre → Payments. Let the client know.' },
        { button: 'Open Payments', href: '/admin/payments?status=complete' },
      ],
      signoff: false,
    }),
    sample: { user: { name: 'Sizwe Dlamini', email: 'sizwe@example.com' }, order: { reference: 'HC-1E1AC5' }, invoice: { number: 'INV-EE3612' }, payment: { amount_cents: 1200000, reference: 'HCP-MWIB-163BB9', gateway: 'ozow', gateway_txn_id: 'abc-123' } },
  },
  'payment.notify': {
    audience: 'Team', description: 'Payment received alert for the team',
    build: ({ user, order, invoice, payment }) => ({
      subject: `💳 ${rand(payment.amount_cents)} received from ${user.name} (${invoice.number})`,
      preheader: `${payment.gateway} · ${order.reference}`,
      heading: 'Payment received',
      blocks: [
        { table: [['Client', user.name], ['Amount', rand(payment.amount_cents)], ['Invoice', invoice.number], ['Engagement', `${order.service_name} (${order.reference})`], ['Gateway', payment.gateway], ['Reference', payment.reference]] },
        { button: 'View payments', href: '/admin/payments' },
      ],
      signoff: false,
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { reference: 'HC-1E1AC5', service_name: 'Design & Brand' }, invoice: { number: 'INV-EE3612' }, payment: { amount_cents: 1200000, gateway: 'payfast', reference: 'HCP-MWIB-163BB9' } },
  },

  // ------------------------------------------------------------------ Messages
  'message.new': {
    audience: 'Client / Team', description: 'New message on an engagement',
    build: ({ recipient, author, order, body, toTeam }) => ({
      subject: `New message on ${order.reference} from ${author.name}`,
      preheader: body.slice(0, 90),
      heading: toTeam ? `${author.name} sent a message` : 'You have a new message from your team',
      blocks: [
        ...(toTeam ? [] : [`Hi ${first(recipient.name)}, ${author.name} from Hipcastle sent you a message about ${order.service_name}:`]),
        { quote: body },
        { button: 'Reply in the portal', href: `/portal/orders/${order.id}` },
      ],
      signoff: !toTeam,
      reason: toTeam ? null : 'Message notification for your Hipcastle engagement.',
    }),
    sample: { recipient: { name: 'Sizwe Dlamini' }, author: { name: 'Hipcastle Admin' }, order: { id: 1, reference: 'HC-1E1AC5', service_name: 'Design & Brand' }, body: 'Hi Sizwe! The first logo concepts are ready for your feedback.', toTeam: false },
  },

  // ------------------------------------------------------------------ Reviews & newsletter
  'testimonial.notify': {
    audience: 'Team', description: 'New review waiting for moderation',
    build: ({ t }) => ({
      subject: `⭐ New ${t.rating}★ review from ${t.author} — please moderate`,
      preheader: t.quote.slice(0, 90),
      heading: 'New review awaiting approval',
      blocks: [{ table: [['From', `${t.author}, ${t.role}${t.company ? ` (${t.company})` : ''}`], ['Rating', `${t.rating} / 5`], ['Email', t.email]] }, { quote: t.quote }, { button: 'Moderate reviews', href: '/admin/testimonials' }],
      signoff: false,
    }),
    sample: { t: { author: 'Nomsa K.', role: 'Owner', company: 'Nomsa’s Boutique', rating: 5, email: 'nomsa@example.com', quote: 'Our new online store is converting brilliantly!' } },
  },
  'testimonial.thanks': {
    audience: 'Reviewer', description: 'Thank-you when a review is published',
    build: ({ t }) => ({
      subject: 'Thank you — your review is live!',
      preheader: 'We really appreciate your feedback.',
      heading: `Thank you, ${first(t.author)}!`,
      blocks: ['Your review has been published on our website. Feedback like yours helps other South African entrepreneurs choose with confidence.', { button: 'See your review', href: '/testimonials' }],
      reason: 'You’re receiving this because you submitted a review on our website.',
    }),
    sample: { t: { author: 'Nomsa K.' } },
  },
  'newsletter.confirm': {
    audience: 'Subscriber', description: 'Confirm newsletter subscription (double opt-in)',
    build: ({ url }) => ({
      subject: 'Please confirm your Hipcastle newsletter subscription',
      preheader: 'One click to confirm — ignore this email if it wasn’t you.',
      heading: 'Confirm your subscription',
      blocks: ['Someone (hopefully you) asked to receive Hipcastle’s monthly growth guides for South African entrepreneurs at this address.',
        { button: 'Yes, subscribe me', href: url }, 'If you didn’t ask for this, simply ignore this email — you won’t be subscribed.'],
      reason: 'You’re receiving this one-off email because this address was entered in our newsletter form.',
    }),
    sample: { url: '/api/newsletter/confirm?email=reader%40example.com&token=sample' },
  },
  'newsletter.welcome': {
    audience: 'Subscriber', description: 'Confirmation after subscribing to the newsletter',
    build: () => ({
      subject: 'You’re subscribed to Hipcastle growth tips 🇿🇦',
      preheader: 'Practical guides for SA entrepreneurs, once a month.',
      heading: 'Welcome to the Hipcastle newsletter',
      blocks: [
        'Thanks for subscribing! Once a month we’ll send practical, no-fluff guides on websites, payments, marketing, AI search and compliance for South African businesses.',
        'Start with our most popular guides:',
        { button: 'Read the latest guides', href: '/blog' },
      ],
      newsletter: true,
      reason: 'You’re receiving this because you subscribed on our website.',
    }),
    sample: {},
  },
  // ------------------------------------------------------------------ Delivery pipeline
  'onboarding.start': {
    audience: 'Client', description: 'Deposit received — complete onboarding to start',
    build: ({ user, order, items }) => ({
      subject: `Next step: complete your onboarding for ${order.service_name} (${order.reference})`,
      preheader: 'It takes about 10 minutes and lets your team start straight away.',
      heading: `Let’s get started, ${first(user.name)}!`,
      blocks: [
        `Thanks for your deposit — your ${order.service_name} (${order.tier_name}) engagement is now active. Before kick-off we need a few details from you:`,
        { list: items.slice(0, 8).map((i) => i.label) },
        { button: 'Complete onboarding (10 min)', href: `/portal/orders/${order.id}#onboarding` },
        { note: 'Please share access by inviting us as a user or partner — never send passwords by email.' },
        'Once we have your answers, your project lead will book the kick-off call and confirm your timeline.',
      ],
      reason: 'Project update for your Hipcastle engagement.',
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, reference: 'HC-1E1AC5', service_name: 'Design & Brand', tier_name: 'Growth' },
      items: [{ label: 'Describe your business' }, { label: 'What does success look like in 3 months?' }, { label: 'Share your logo and brand material' }, { label: 'Suggest two times for the kick-off call' }] },
  },
  'onboarding.reminder': {
    audience: 'Client', description: 'Reminder when onboarding is still incomplete',
    build: ({ user, order, open }) => ({
      subject: `Reminder: we need a few details to start ${order.service_name}`,
      preheader: `${open} onboarding item(s) left.`,
      heading: 'Your team is ready when you are',
      blocks: [`Hi ${first(user.name)}, there are still ${open} onboarding item(s) to complete before we can kick off ${order.service_name} (${order.reference}).`,
        { button: 'Finish onboarding', href: `/portal/orders/${order.id}#onboarding` }, 'Stuck on anything? Just reply — we’re happy to help.'],
      reason: 'Project update for your Hipcastle engagement.',
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, reference: 'HC-1E1AC5', service_name: 'Design & Brand' }, open: 3 },
  },
  'onboarding.complete': {
    audience: 'Team', description: 'Client finished onboarding — book the kick-off',
    build: ({ user, order, answers }) => ({
      subject: `✅ Onboarding complete: ${order.reference} (${user.name}) — book the kick-off`,
      preheader: `${order.service_name} — ${order.tier_name}`,
      heading: 'Client onboarding complete',
      blocks: [{ table: answers.slice(0, 12).map((a) => [a.label.slice(0, 60), (a.response || '—').slice(0, 300)]) }, { button: 'Open engagement', href: `/portal/orders/${order.id}` }],
      signoff: false,
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, reference: 'HC-1E1AC5', service_name: 'Design & Brand', tier_name: 'Growth' },
      answers: [{ label: 'Describe your business', response: 'A Soweto coffee shop with two branches.' }, { label: 'Kick-off times', response: 'Tue 10:00 or Wed 14:00' }] },
  },
  'deliverable.ready': {
    audience: 'Client', description: 'A deliverable is ready for the client’s approval',
    build: ({ user, order, milestone, revisionsLeft }) => ({
      subject: `Ready for your review: ${milestone.title} (${order.reference})`,
      preheader: milestone.deliverable || 'Please review and approve or request changes.',
      heading: 'Ready for your review 👀',
      blocks: [
        `Hi ${first(user.name)}, “${milestone.title}” is ready for you to review.`,
        ...(milestone.deliverable ? [{ table: [['Deliverable', milestone.deliverable], ...(milestone.deliverable_url ? [['Link', milestone.deliverable_url]] : [])] }] : []),
        ...(milestone.deliverable_note ? [{ quote: milestone.deliverable_note }] : []),
        { button: 'Review & approve', href: `/portal/orders/${order.id}#milestone-${milestone.id}` },
        revisionsLeft === null ? 'Your package includes unlimited revision rounds.' : `You have ${revisionsLeft} revision round(s) left for this deliverable.`,
      ],
      reason: 'Project update for your Hipcastle engagement.',
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, reference: 'HC-1E1AC5' }, revisionsLeft: 3,
      milestone: { id: 5, title: 'Design concepts', deliverable: '2–3 concept directions', deliverable_url: 'https://www.figma.com/file/example', deliverable_note: 'Concept B leans into your township heritage — our favourite!' } },
  },
  'approval.reminder': {
    audience: 'Client', description: 'Reminder when an approval has waited 3+ days',
    build: ({ user, order, milestone }) => ({
      subject: `Waiting on your approval: ${milestone.title}`,
      preheader: 'Your timeline is paused until we hear from you.',
      heading: 'We’re waiting on your feedback',
      blocks: [`Hi ${first(user.name)}, “${milestone.title}” for ${order.reference} is waiting for your approval. The next steps are on hold until then.`,
        { button: 'Review now', href: `/portal/orders/${order.id}#milestone-${milestone.id}` }],
      reason: 'Project update for your Hipcastle engagement.',
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, reference: 'HC-1E1AC5' }, milestone: { id: 5, title: 'Design concepts' } },
  },
  'deliverable.response': {
    audience: 'Team', description: 'Client approved or requested changes',
    build: ({ user, order, milestone, outcome }) => ({
      subject: outcome === 'approved' ? `👍 ${user.name} approved “${milestone.title}” (${order.reference})` : `✏️ Changes requested on “${milestone.title}” (${order.reference})`,
      preheader: milestone.client_feedback || '',
      heading: outcome === 'approved' ? 'Deliverable approved' : 'Client requested changes',
      blocks: [
        { table: [['Client', user.name], ['Milestone', milestone.title], ['Revision rounds used', String(milestone.revisions_used)]] },
        ...(outcome === 'changes' && milestone.client_feedback ? [{ quote: milestone.client_feedback }] : []),
        { button: 'Open engagement', href: `/portal/orders/${order.id}` },
      ],
      signoff: false,
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, reference: 'HC-1E1AC5' }, outcome: 'changes', milestone: { title: 'Design concepts', revisions_used: 1, client_feedback: 'Love B — can we try a warmer orange?' } },
  },
  'pipeline.digest': {
    audience: 'Team', description: 'Daily digest of overdue milestones',
    build: ({ items }) => ({
      subject: `⏰ ${items.length} overdue milestone(s) across engagements`,
      preheader: items.slice(0, 3).map((i) => i.title).join(' · '),
      heading: 'Overdue work today',
      blocks: [{ table: items.slice(0, 20).map((i) => [`${i.reference} · due ${i.due_date}`, `${i.title}${i.agent_name ? ` — ${i.agent_name}` : ''}`]) }, { button: 'Open pipeline board', href: '/admin/pipeline' }],
      signoff: false,
    }),
    sample: { items: [{ reference: 'HC-1E1AC5', due_date: '2026-11-14', title: 'Design concepts', agent_name: 'Brand Guardian' }] },
  },
  'retainer.cycle': {
    audience: 'Client', description: 'New retainer month started (with invoice)',
    build: ({ user, order, cycle, invoice, milestones }) => ({
      subject: `Month ${cycle} of your ${order.service_name} retainer has started`,
      preheader: `Invoice ${invoice.number}: ${rand(invoice.amount_cents)}.`,
      heading: `Month ${cycle} is under way`,
      blocks: [
        `Hi ${first(user.name)}, here’s what your team is working on this month:`,
        { list: milestones.map((m) => m.title.replace(/ \(month \d+\)$/, '')) },
        { table: invoiceTable(invoice) },
        { button: 'View plan & pay invoice', href: `/portal/orders/${order.id}` },
      ],
      reason: 'Billing and project update for your Hipcastle retainer.',
      billing: true,
    }),
    sample: { user: { name: 'Thandi Mokoena' }, order: { id: 2, service_name: 'Digital Marketing & SEO' }, cycle: 2,
      invoice: { number: 'INV-9F21AA', description: 'Month 2 retainer', subtotal_cents: 1450000, amount_cents: 1450000, due_at: '2026-12-23' },
      milestones: [{ title: 'Monthly plan agreed' }, { title: 'Content creation & approval' }, { title: 'Monthly performance report' }] },
  },
  'feedback.request': {
    audience: 'Client', description: 'Project delivered — ask for a rating and review',
    build: ({ user, order }) => ({
      subject: `How did we do on ${order.service_name}? (1 question)`,
      preheader: 'Your feedback helps us improve — it takes 30 seconds.',
      heading: 'Your project is complete 🎉',
      blocks: [
        `Thank you for trusting Hipcastle with ${order.service_name}, ${first(user.name)}. How likely are you to recommend us to a friend or colleague?`,
        { button: 'Rate your experience', href: `/portal/orders/${order.id}#feedback` },
        'Happy with the result? A short public review helps other South African entrepreneurs find us.',
        { button: 'Leave a review', href: '/testimonials' },
      ],
      reason: 'Project update for your Hipcastle engagement.',
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { id: 1, service_name: 'Design & Brand' } },
  },
  'feedback.received': {
    audience: 'Team', description: 'Client submitted a project rating',
    build: ({ user, order }) => ({
      subject: `${order.nps_score >= 9 ? '🌟' : order.nps_score <= 6 ? '⚠️' : '🙂'} ${user.name} rated ${order.reference} ${order.nps_score}/10`,
      preheader: order.nps_comment || '',
      heading: 'New client rating',
      blocks: [{ table: [['Client', user.name], ['Engagement', `${order.service_name} — ${order.tier_name}`], ['Score', `${order.nps_score} / 10`]] },
        ...(order.nps_comment ? [{ quote: order.nps_comment }] : []),
        ...(order.nps_score <= 6 ? [{ note: 'Detractor — call the client within 24 hours to understand what went wrong.' }] : order.nps_score >= 9 ? [{ note: 'Promoter — ask for a public review and a referral.' }] : [])],
      signoff: false,
    }),
    sample: { user: { name: 'Sizwe Dlamini' }, order: { reference: 'HC-1E1AC5', service_name: 'Design & Brand', tier_name: 'Growth', nps_score: 9, nps_comment: 'Brilliant team.' } },
  },
  // ------------------------------------------------------------------ Support desk
  'ticket.created': {
    audience: 'Client', description: 'Support ticket acknowledgement with the response target',
    build: ({ user, ticket, hours }) => ({
      subject: `We’ve got your request [${ticket.reference}] — ${ticket.subject}`,
      preheader: `A Hipcastle team member will respond within ${hours} hours.`,
      heading: 'Your support request is in',
      blocks: [
        `Thanks, ${first(user.name)}. We’ve logged your request and a team member will respond within ${hours} hours (business hours, ${ticket.priority} priority).`,
        { table: [['Reference', ticket.reference], ['Subject', ticket.subject], ['Category', ticket.category], ['Priority', ticket.priority]] },
        { button: 'View your ticket', href: `/portal/support/${ticket.id}` },
        { note: 'Never send passwords, card numbers or banking details in a ticket.' },
      ],
      reason: 'You’re receiving this because you opened a support ticket in the Hipcastle client portal.',
    }),
    sample: { user: { name: 'Thandi Mokoena' }, ticket: { id: 1, reference: 'TCK-4F2A9C', subject: 'Checkout button not working on mobile', category: 'technical', priority: 'high' }, hours: 24 },
  },
  'ticket.notify': {
    audience: 'Team', description: 'New support ticket alert',
    build: ({ user, ticket, body, hours }) => ({
      subject: `${ticket.priority === 'urgent' ? '🚨' : '🎫'} [${ticket.reference}] ${ticket.subject} — ${user.name}`,
      preheader: body.slice(0, 90),
      heading: `New ${ticket.priority} support ticket`,
      blocks: [
        { table: [['Client', `${user.name} (${user.email})`], ['Category', ticket.category], ['Priority', ticket.priority], ['First response due', `within ${hours} hours`]] },
        { quote: body },
        { button: 'Open the support desk', href: '/admin/support' },
      ],
      signoff: false,
    }),
    sample: { user: { name: 'Thandi Mokoena', email: 'thandi@example.com' }, ticket: { reference: 'TCK-4F2A9C', subject: 'Checkout button not working on mobile', category: 'technical', priority: 'high' }, body: 'Customers say the checkout button does nothing on iPhone.', hours: 24 },
  },
  'ticket.reply': {
    audience: 'Client / Team', description: 'New reply on a support ticket',
    build: ({ to, author, ticket, body, staffView }) => ({
      subject: `Re: [${ticket.reference}] ${ticket.subject}`,
      preheader: body.slice(0, 90),
      heading: `${author.name} replied`,
      blocks: [
        `Hi ${first(to.name)}, there’s a new reply on ticket ${ticket.reference}.`,
        { quote: body },
        { button: 'Reply in the portal', href: staffView ? '/admin/support' : `/portal/support/${ticket.id}` },
      ],
      signoff: !staffView,
      reason: 'Support update for your Hipcastle account.',
    }),
    sample: { to: { name: 'Thandi Mokoena' }, author: { name: 'Lerato (Hipcastle)' }, ticket: { id: 1, reference: 'TCK-4F2A9C', subject: 'Checkout button not working on mobile' }, body: 'We found the issue — a script conflict on Safari. A fix is live; please try again.' },
  },
  'ticket.resolved': {
    audience: 'Client', description: 'Ticket resolved — ask the client to rate the help (CSAT)',
    build: ({ user, ticket }) => ({
      subject: `Resolved: [${ticket.reference}] ${ticket.subject}`,
      preheader: 'How did we do? Rate the help in one click.',
      heading: 'Your request has been resolved',
      blocks: [
        `Hi ${first(user.name)}, we’ve marked ticket ${ticket.reference} as resolved. If anything is still not right, just reply in the portal and it reopens automatically.`,
        'How happy were you with the help you received?',
        { button: 'Rate the help (1–5)', href: `/portal/support/${ticket.id}#rate` },
      ],
      reason: 'Support update for your Hipcastle account.',
    }),
    sample: { user: { name: 'Thandi Mokoena' }, ticket: { id: 1, reference: 'TCK-4F2A9C', subject: 'Checkout button not working on mobile' } },
  },
  'ticket.sla': {
    audience: 'Team', description: 'Support tickets past their first-response target',
    build: ({ tickets }) => ({
      subject: `⏰ ${tickets.length} support ticket${tickets.length === 1 ? '' : 's'} past the response target`,
      preheader: tickets.map((t) => t.reference).join(', '),
      heading: 'Response targets missed',
      blocks: [
        { table: tickets.map((t) => [`${t.reference} (${t.priority})`, `${t.subject} — ${t.client_name}, due ${t.sla_due_at}`]) },
        { button: 'Open the support desk', href: '/admin/support' },
      ],
      signoff: false,
    }),
    sample: { tickets: [{ reference: 'TCK-4F2A9C', priority: 'high', subject: 'Checkout button not working', client_name: 'Thandi Mokoena', sla_due_at: '2026-11-16 09:00' }] },
  },
  'chat.handoff': {
    audience: 'Team', description: 'Website chat visitor asked to talk to a person',
    build: ({ lead, transcript }) => ({
      subject: `💬 Chat handoff: ${lead.name} wants to talk to a person`,
      preheader: lead.message.slice(0, 90),
      heading: 'A chat visitor asked for a person',
      blocks: [
        { table: [['Name', lead.name], ['Email', lead.email], ['Phone', lead.phone || '—'], ['Prefers', lead.preferred_contact || 'email']] },
        { quote: lead.message },
        ...(transcript.length ? [{ p: 'Recent conversation:' }, { list: transcript.map((m) => `${m.role === 'user' ? 'Visitor' : 'Assistant'}: ${m.content.slice(0, 300)}`) }] : []),
        { button: 'Open in Command Centre', href: '/admin/leads' },
      ],
      signoff: false,
      replyTo: lead.email,
    }),
    sample: { lead: { name: 'Sipho Ndlovu', email: 'sipho@example.com', phone: '', preferred_contact: 'email', message: 'Can you build a booking system for my salon?' },
      transcript: [{ role: 'user', content: 'Do you build booking systems?' }, { role: 'assistant', content: 'Yes — our Web & App Development packages…' }] },
  },
  'system.test': {
    audience: 'Admin', description: 'Test email from the Command Centre',
    build: () => ({
      subject: 'Hipcastle email test ✔',
      preheader: 'Your email settings are working.',
      heading: 'Your email settings are working',
      blocks: [`This test was sent from the Command Centre at ${new Date().toLocaleString('en-ZA', { timeZone: 'Africa/Johannesburg' })} SAST.`, { button: 'Open Command Centre', href: '/admin/emails' }],
      signoff: false,
    }),
    sample: {},
  },
};

export const siteBase = canonicalUrl;
