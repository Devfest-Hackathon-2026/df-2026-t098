import config from '../../../capacitor.config';

describe('Native accessibility and bridge logging policy', () => {
  it('enables reading zoom and disables token-bearing plugin logs', () => {
    expect(config.zoomEnabled).toBe(true);
    expect(config.loggingBehavior).toBe('none');
  });
});
