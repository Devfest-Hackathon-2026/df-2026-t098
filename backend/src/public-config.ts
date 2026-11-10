import { Controller, Get, Header, Req } from '@nestjs/common';
import type { Request } from 'express';
import { localeDefault } from './locale-default';

export interface PublicConfig {
  /** Base URL of the published legal pages; clients append `/privacy` and `/terms`. */
  legalBaseUrl: string | null;
  /** How learners reach support (an email address, URL or short text). */
  supportContact: string | null;
}

/**
 * The legal documents are published by the owner, so their location is configuration
 * (LEGAL_BASE_URL), never text in the application. An unset or malformed value is null.
 */
export function legalBaseUrl(value: string | undefined): string | null {
  try {
    const url = new URL(value?.trim() ?? '');
    const local = ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname);
    const secure = url.protocol === 'https:' || (url.protocol === 'http:' && local);
    if (!secure || url.username || url.password || url.search || url.hash) return null;
    return (url.origin + url.pathname).replace(/\/+$/, '');
  } catch {
    return null;
  }
}

export function supportContact(value: string | undefined): string | null {
  const contact = value?.trim() ?? '';
  // eslint-disable-next-line no-control-regex
  return contact && contact.length <= 120 && !/[\u0000-\u001f\u007f]/.test(contact)
    ? contact
    : null;
}

export function publicConfig(env: NodeJS.ProcessEnv = process.env): PublicConfig {
  return {
    legalBaseUrl: legalBaseUrl(env.LEGAL_BASE_URL),
    supportContact: supportContact(env.SUPPORT_CONTACT),
  };
}

@Controller('config')
export class PublicConfigController {
  @Get()
  @Header('Cache-Control', 'public, max-age=300')
  get(): PublicConfig {
    return publicConfig();
  }

  @Get('locale')
  @Header('Cache-Control', 'private, no-store')
  locale(@Req() request: Request) {
    return { defaultLanguage: localeDefault(request.ip) };
  }
}
