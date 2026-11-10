import express from 'express';
import request from 'supertest';
import { localeDefault } from './locale-default';
import { PublicConfigController } from './public-config';

describe('default language by country', () => {
  it.each([
    ['133.242.0.1', 'ja'],
    ['8.8.8.8', 'en'],
    ['2001:4860:4860::8888', 'en'],
    ['::ffff:133.242.0.1', 'ja'],
    ['127.0.0.1', null],
    ['192.168.1.10', null],
    ['::1', null],
    ['2001:db8::1', null],
    [undefined, null],
  ])('resolves %s to %s', (address, expected) => {
    expect(localeDefault(address)).toBe(expected);
  });

  it('uses the IP resolved by the configured proxy and ignores country headers', async () => {
    const app = express();
    const controller = new PublicConfigController();
    app.get('/locale', (req, res) => res.json(controller.locale(req)));
    const call = () => request(app).get('/locale')
      .set('X-Forwarded-For', '133.242.0.1, 8.8.8.8')
      .set('CF-IPCountry', 'JP');

    await call().expect(200, { defaultLanguage: null });
    app.set('trust proxy', 1);
    await call().expect(200, { defaultLanguage: 'en' });
  });
});
