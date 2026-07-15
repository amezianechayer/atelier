import { describe, expect, it, vi } from 'vitest';
import { createEmailSender, type EmailEnv } from './email';

const devEnv: EmailEnv = {
  NODE_ENV: 'development',
  RESEND_API_KEY: '',
  EMAIL_FROM: 'Atelier <atelier@localhost>',
  MAILPIT_URL: 'http://localhost:8025',
};

function fetchMock(status = 200) {
  return vi.fn(async () => new Response(status < 400 ? 'ok' : 'nope', { status }));
}

describe('createEmailSender', () => {
  it('en dev sans clé Resend, envoie via l’API Mailpit', async () => {
    const f = fetchMock();
    await createEmailSender(devEnv, f).send({ to: 'x@y.z', subject: 'Sujet', text: 'Corps' });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('http://localhost:8025/api/v1/send');
    const body = JSON.parse(String(init.body));
    expect(body).toMatchObject({
      From: { Email: 'atelier@localhost', Name: 'Atelier' },
      To: [{ Email: 'x@y.z' }],
      Subject: 'Sujet',
      Text: 'Corps',
    });
  });

  it('avec une clé Resend, envoie via api.resend.com avec le Bearer', async () => {
    const f = fetchMock();
    const env = { ...devEnv, RESEND_API_KEY: 're_test_123' };
    await createEmailSender(env, f).send({
      to: 'x@y.z',
      subject: 'S',
      text: 'T',
      html: '<b>T</b>',
    });
    const [url, init] = f.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://api.resend.com/emails');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer re_test_123');
    expect(JSON.parse(String(init.body))).toMatchObject({
      from: 'Atelier <atelier@localhost>',
      to: ['x@y.z'],
      html: '<b>T</b>',
    });
  });

  it('refuse la production sans RESEND_API_KEY avec un message actionnable', () => {
    expect(() => createEmailSender({ ...devEnv, NODE_ENV: 'production' })).toThrowError(
      /RESEND_API_KEY/,
    );
  });

  it('remonte une erreur actionnable sur réponse non-2xx', async () => {
    const f = fetchMock(422);
    await expect(
      createEmailSender(devEnv, f).send({ to: 'x@y.z', subject: 'S', text: 'T' }),
    ).rejects.toThrowError(/HTTP 422/);
  });
});
