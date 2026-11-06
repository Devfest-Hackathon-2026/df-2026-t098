export interface GoogleTokenPayload {
  sub: string;
  email: string;
  email_verified: string;
  aud: string;
  picture?: string;
}

export interface GoogleAccountDto {
  email: string;
  googleId: string;
  name?: string;
  picture?: string;
}