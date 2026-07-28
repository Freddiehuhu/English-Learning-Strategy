import type { TypingShooterHandle, TypingShooterOptions } from './game/TypingShooter';

declare global {
  interface Window {
    TypingShooter: {
      mount: (options: TypingShooterOptions) => Promise<TypingShooterHandle>;
    };
  }
}

window.TypingShooter = {
  mount: async (options) => {
    const { mountTypingShooter } = await import('./game/TypingShooter');
    return mountTypingShooter(options);
  },
};

window.dispatchEvent(new Event('typing-shooter-ready'));
