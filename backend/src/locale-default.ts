import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { gunzipSync } from 'node:zlib';
import ipaddr from 'ipaddr.js';
import { Reader, type CityResponse } from 'mmdb-lib';

type DefaultLanguage = 'ja' | 'en';
let reader: Reader<CityResponse> | null | undefined;

export function localeDefault(address: string | undefined): DefaultLanguage | null {
  if (!address || !ipaddr.isValid(address)) return null;
  const ip = ipaddr.process(address);
  if (ip.range() !== 'unicast') return null;

  if (reader === undefined) {
    try {
      const file = join(process.cwd(), 'data', 'dbip-country-lite.mmdb.gz');
      reader = new Reader<CityResponse>(gunzipSync(readFileSync(file)));
    } catch {
      reader = null;
    }
  }

  const country = reader?.get(ip.toString())?.country?.iso_code;
  if (!country || !/^[A-Z]{2}$/.test(country) || country === 'ZZ' || country === 'XX') return null;
  return country === 'JP' ? 'ja' : 'en';
}
