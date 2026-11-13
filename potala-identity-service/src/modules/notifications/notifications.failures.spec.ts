import { Logger } from '@nestjs/common';
import { NotificationsService } from './notifications.service';
describe('Brevo delivery diagnostics', () => {
  const oldFetch = global.fetch;
  const oldKey = process.env.BREVO_API_KEY,
    oldSender = process.env.BREVO_SENDER_EMAIL;
  afterEach(() => {
    global.fetch = oldFetch;
    process.env.BREVO_API_KEY = oldKey;
    process.env.BREVO_SENDER_EMAIL = oldSender;
    jest.restoreAllMocks();
  });
  it('records an IP restriction safely and retains the queued message for retry', async () => {
    process.env.BREVO_API_KEY = 'private-test-key';
    process.env.BREVO_SENDER_EMAIL = 'sender@example.invalid';
    const row = {
      id: 'notification',
      userId: 'user',
      template: 'ORDER_CREATED',
      title: 'Pedido',
      message: 'Teste',
      attempts: 0,
      encryptedPayload: null,
    };
    const db = {
      notification: {
        findMany: jest.fn().mockResolvedValue([row]),
        updateMany: jest.fn().mockResolvedValue({ count: 1 }),
        update: jest.fn(),
      },
      user: {
        findUniqueOrThrow: jest.fn().mockResolvedValue({
          email: 'private-recipient@example.invalid',
          status: 'ACTIVE',
        }),
      },
    };
    const error = jest
      .spyOn(Logger.prototype, 'error')
      .mockImplementation(() => undefined);
    global.fetch = jest.fn().mockResolvedValue({
      ok: false,
      status: 401,
      json: async () => ({
        code: 'unauthorized',
        message:
          'We have detected you are using an unrecognised IP address. private-test-key private-recipient@example.invalid https://secret/#token=secret',
      }),
    }) as never;
    await new NotificationsService(db as never).dispatch();
    const logged = error.mock.calls
      .map((call) => JSON.stringify(call))
      .join(' ');
    expect(logged).toContain('BREVO_IP_NOT_AUTHORIZED');
    expect(logged).toContain('401');
    for (const secret of [
      'private-test-key',
      'private-recipient',
      'token=secret',
    ])
      expect(logged).not.toContain(secret);
    expect(db.notification.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          status: 'QUEUED',
          nextAttemptAt: expect.any(Date),
        }),
      }),
    );
  });
});
