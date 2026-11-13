import { NotificationDispatcher } from './notification-dispatcher.service';
import { NotificationsService } from './notifications.service';

describe('notification dispatcher activation', () => {
  const env = { ...process.env };
  let service: NotificationDispatcher;
  let dispatch: jest.Mock;
  beforeEach(() => {
    jest.useFakeTimers();
    dispatch = jest.fn().mockResolvedValue({ processed: 0 });
    service = new NotificationDispatcher({
      dispatch,
    } as unknown as NotificationsService);
  });
  afterEach(() => {
    service.onModuleDestroy();
    jest.useRealTimers();
    process.env = { ...env };
  });

  it('does not contact transport without explicit enable and sender credentials', async () => {
    delete process.env.NOTIFICATION_DISPATCH_ENABLED;
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(30000);
    expect(dispatch).not.toHaveBeenCalled();
    process.env.NOTIFICATION_DISPATCH_ENABLED = 'true';
    delete process.env.BREVO_API_KEY;
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(30000);
    expect(dispatch).not.toHaveBeenCalled();
  });

  it('runs periodically without overlapping dispatch and stops at shutdown', async () => {
    process.env.NOTIFICATION_DISPATCH_ENABLED = 'true';
    process.env.BREVO_API_KEY = 'mock';
    process.env.BREVO_SENDER_EMAIL = 'sender@example.invalid';
    let release!: () => void;
    dispatch.mockImplementationOnce(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    service.onModuleInit();
    await jest.advanceTimersByTimeAsync(30000);
    expect(dispatch).toHaveBeenCalledTimes(1);
    release();
    await Promise.resolve();
    await jest.advanceTimersByTimeAsync(10000);
    expect(dispatch).toHaveBeenCalledTimes(2);
    service.onModuleDestroy();
    await jest.advanceTimersByTimeAsync(30000);
    expect(dispatch).toHaveBeenCalledTimes(2);
  });
});
