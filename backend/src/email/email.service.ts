import {
  Injectable,
  Logger,
  ServiceUnavailableException,
} from '@nestjs/common';
import axios from 'axios';

export interface OutgoingEmail {
  to: string;
  subject: string;
  text: string;
  html: string;
}

/**
 * Sends transactional email through Resend (https://resend.com).
 *
 * Configuration: RESEND_API_KEY and MAIL_FROM (an address on a domain verified in Resend, for
 * example `WhyLint <noreply@whylint.com>`). Without a key, development and test builds write the
 * message to the server log instead so the flows can be exercised locally; production refuses,
 * because silently dropping a password-reset email is worse than an error.
 */
@Injectable()
export class EmailService {
  private readonly logger = new Logger('Email');

  get configured(): boolean {
    return Boolean(process.env.RESEND_API_KEY?.trim());
  }

  async send(message: OutgoingEmail): Promise<void> {
    const key = process.env.RESEND_API_KEY?.trim();
    if (!key) {
      if (process.env.NODE_ENV === 'production') {
        throw new ServiceUnavailableException({
          code: 'EMAIL_NOT_CONFIGURED',
          message: 'Email is not configured',
        });
      }
      this.logger.log(
        `[dev email] to=${message.to} subject="${message.subject}"\n${message.text}`,
      );
      return;
    }
    try {
      await axios.post(
        'https://api.resend.com/emails',
        {
          from:
            process.env.MAIL_FROM?.trim() || 'WhyLint <noreply@whylint.com>',
          to: [message.to],
          subject: message.subject,
          text: message.text,
          html: message.html,
        },
        { headers: { Authorization: `Bearer ${key}` }, timeout: 5_000 },
      );
    } catch (error) {
      const status = axios.isAxiosError(error)
        ? error.response?.status
        : undefined;
      // Never log the message body (it carries a one-time link) or the key.
      this.logger.error(
        `Resend delivery failed${status ? ` (HTTP ${status})` : ''}`,
      );
      throw new ServiceUnavailableException({
        code: 'EMAIL_UNAVAILABLE',
        message: 'Email could not be sent',
      });
    }
  }
}
