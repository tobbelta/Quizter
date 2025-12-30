import { getEmailSettingsSnapshot } from './emailSettings.js';

const encodeBase64 = (value) => {
  if (typeof btoa === 'function') {
    return btoa(value);
  }
  return Buffer.from(value).toString('base64');
};

const parseHeaders = (value) => {
  if (!value) return {};
  if (typeof value === 'object') return value;
  try {
    const parsed = JSON.parse(value);
    if (parsed && typeof parsed === 'object') {
      return parsed;
    }
  } catch (error) {
    console.warn('[emailSender] Kunde inte tolka extraHeaders:', error.message);
  }
  return {};
};

const buildFrom = (fromEmail, fromName) => {
  if (!fromName) return fromEmail;
  return `${fromName} <${fromEmail}>`;
};

const replaceTemplate = (template, values) => {
  let output = template;
  Object.entries(values).forEach(([key, value]) => {
    const token = new RegExp(`{{\s*${key}\s*}}`, 'g');
    output = output.replace(token, value ?? '');
  });
  return output;
};

export const sendEmail = async (env, { to, subject, html, text, replyTo }) => {
  const { settings } = await getEmailSettingsSnapshot(env, { includeSecrets: true });
  const activeProvider = settings.providers.find((provider) => provider.id === settings.activeProviderId && provider.isEnabled);

  if (!activeProvider || !activeProvider.secretKey) {
    throw new Error('Ingen aktiv e-postprovider är konfigurerad.');
  }

  const fromEmail = settings.fromEmail?.trim();
  if (!fromEmail) {
    throw new Error('Avsändaradress saknas i e-postinställningar.');
  }

  const fromName = settings.fromName?.trim() || '';
  const replyToValue = replyTo || settings.replyTo || undefined;

  const payload = {
    to,
    subject,
    html: html || '',
    text: text || '',
    fromEmail,
    fromName
  };

  switch (activeProvider.type) {
    case 'resend': {
      const body = {
        from: buildFrom(fromEmail, fromName),
        to: [to],
        subject,
        html: html || undefined,
        text: text || undefined,
        reply_to: replyToValue || undefined
      };
      const response = await fetch('https://api.resend.com/emails', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeProvider.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Resend fel: ${response.status} ${errorText}`);
      }
      return;
    }
    case 'sendgrid': {
      const body = {
        personalizations: [{ to: [{ email: to }] }],
        from: { email: fromEmail, name: fromName || undefined },
        subject,
        content: [
          { type: 'text/plain', value: text || html || '' },
          { type: 'text/html', value: html || text || '' }
        ]
      };
      if (replyToValue) {
        body.reply_to = { email: replyToValue };
      }
      const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeProvider.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`SendGrid fel: ${response.status} ${errorText}`);
      }
      return;
    }
    case 'mailgun': {
      const domain = activeProvider.domain || '';
      if (!domain) {
        throw new Error('Mailgun kräver en domän i inställningarna.');
      }
      const form = new URLSearchParams();
      form.set('from', buildFrom(fromEmail, fromName));
      form.set('to', to);
      form.set('subject', subject);
      if (text) form.set('text', text);
      if (html) form.set('html', html);
      if (replyToValue) form.set('h:Reply-To', replyToValue);

      const response = await fetch(`https://api.mailgun.net/v3/${domain}/messages`, {
        method: 'POST',
        headers: {
          Authorization: `Basic ${encodeBase64(`api:${activeProvider.secretKey}`)}`
        },
        body: form
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Mailgun fel: ${response.status} ${errorText}`);
      }
      return;
    }
    case 'postmark': {
      const body = {
        From: buildFrom(fromEmail, fromName),
        To: to,
        Subject: subject,
        HtmlBody: html || undefined,
        TextBody: text || undefined,
        ReplyTo: replyToValue || undefined
      };
      const response = await fetch('https://api.postmarkapp.com/email', {
        method: 'POST',
        headers: {
          'X-Postmark-Server-Token': activeProvider.secretKey,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Postmark fel: ${response.status} ${errorText}`);
      }
      return;
    }
    case 'mailersend': {
      const body = {
        from: { email: fromEmail, name: fromName || undefined },
        to: [{ email: to }],
        subject,
        text: text || undefined,
        html: html || undefined,
        reply_to: replyToValue ? { email: replyToValue } : undefined
      };
      const response = await fetch('https://api.mailersend.com/v1/email', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${activeProvider.secretKey}`,
          'Content-Type': 'application/json'
        },
        body: JSON.stringify(body)
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`MailerSend fel: ${response.status} ${errorText}`);
      }
      return;
    }
    case 'custom': {
      const endpoint = activeProvider.endpoint || activeProvider.baseUrl;
      if (!endpoint) {
        throw new Error('Custom-provider saknar endpoint.');
      }
      const headers = {
        'Content-Type': 'application/json',
        ...parseHeaders(activeProvider.extraHeaders)
      };
      if (activeProvider.secretKey) {
        headers.Authorization = `Bearer ${activeProvider.secretKey}`;
      }
      const template = activeProvider.payloadTemplate || JSON.stringify({
        to,
        from: buildFrom(fromEmail, fromName),
        subject,
        html,
        text,
        replyTo: replyToValue
      });
      const body = replaceTemplate(template, payload);
      const response = await fetch(endpoint, {
        method: activeProvider.method || 'POST',
        headers,
        body
      });
      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Custom email fel: ${response.status} ${errorText}`);
      }
      return;
    }
    default:
      throw new Error(`Okänd e-postprovider: ${activeProvider.type}`);
  }
};
