import { useState, type FormEvent } from 'react';

type FormStatus = 'idle' | 'sending' | 'success' | 'error';

export default function ContactForm() {
  const [status, setStatus] = useState<FormStatus>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    const form = e.currentTarget;

    const formData = new FormData(form);
    if (formData.get('_gotcha')) return;

    const name = String(formData.get('name') ?? '').trim();
    const email = String(formData.get('email') ?? '').trim();
    const message = String(formData.get('message') ?? '').trim();

    setStatus('sending');
    setErrorMsg('');

    try {
      // Field mapping: only the message textarea goes in messages_attributes[0].body.
      // All other fields (dropdowns, radios, checkboxes) must be added to conversation.data as { "Label": value } pairs.
      const res = await fetch('/api/contact/contact', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          conversation: {
            messages_attributes: [{ body: message || 'New contact form submission' }],
            data: {
              __gd_contact_form_title: 'Contact Us',
            },
          },
          user: { email, name },
        }),
      });

      const json = await res.json();
      if (json.success) {
        setStatus('success');
        form.reset();
      } else {
        throw new Error(json.error || 'Something went wrong.');
      }
    } catch (err) {
      setStatus('error');
      setErrorMsg(err instanceof Error ? err.message : 'Something went wrong. Please try again.');
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {/* Honeypot — positioned off-screen, never included in POST body */}
      <input
        type="text"
        name="_gotcha"
        tabIndex={-1}
        autoComplete="off"
        style={{ position: 'absolute', left: '-9999px' }}
        aria-hidden="true"
      />

      <div>
        <label htmlFor="cf-name" className="block text-sm font-medium text-foreground mb-1.5">
          Name
        </label>
        <input
          id="cf-name"
          name="name"
          type="text"
          className="w-full rounded-lg border border-border bg-muted px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition"
          placeholder="Your name"
        />
      </div>

      <div>
        <label htmlFor="cf-email" className="block text-sm font-medium text-foreground mb-1.5">
          Email <span className="text-accent">*</span>
        </label>
        <input
          id="cf-email"
          name="email"
          type="email"
          required
          className="w-full rounded-lg border border-border bg-muted px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition"
          placeholder="your@email.com"
        />
      </div>

      <div>
        <label htmlFor="cf-message" className="block text-sm font-medium text-foreground mb-1.5">
          Message
        </label>
        <textarea
          id="cf-message"
          name="message"
          rows={5}
          className="w-full rounded-lg border border-border bg-muted px-4 py-3 text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-primary transition resize-none"
          placeholder="Your message..."
        />
      </div>

      <div>
        <label htmlFor="cf-file" className="block text-sm font-medium text-foreground mb-1.5">
          Attach Files
        </label>
        <input
          id="cf-file"
          name="attachment"
          type="file"
          className="w-full text-sm text-muted-foreground file:mr-4 file:py-2 file:px-4 file:rounded-full file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:opacity-90 cursor-pointer"
        />
      </div>

      {status === 'error' && (
        <p role="alert" className="text-destructive text-sm">
          {errorMsg}
        </p>
      )}

      {status === 'success' && (
        <p role="status" className="text-primary text-sm font-medium">
          Thanks! We'll be in touch soon.
        </p>
      )}

      <button
        type="submit"
        disabled={status === 'sending'}
        className="w-full rounded-full bg-primary text-primary-foreground font-semibold py-3 px-8 hover:opacity-90 transition disabled:opacity-60 text-base"
      >
        {status === 'sending' ? 'Sending…' : 'Send'}
      </button>
    </form>
  );
}
