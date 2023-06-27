import { GardenaAccessToken } from './GardenaAccessToken';

export type GardenaAuthConfig = {
  clientId: string;
  clientSecret: string;
};

export class GardenaWrongCredentialsError extends Error {}
export class GardenaAuthError extends Error {}

export class GardenaAuth {
  public readonly clientId: string;
  private clientSecret: string;
  private accessToken: GardenaAccessToken;

  public constructor(config: GardenaAuthConfig) {
    this.clientId = config.clientId;
    this.clientSecret = config.clientSecret;
  }

  public async getValidAccessToken(): Promise<GardenaAccessToken> {
    if (!this.accessToken || this.accessToken.isExpired()) {
      // Retieve new accessToken
      this.accessToken = await GardenaAccessToken.retrieveNew(this.clientId, this.clientSecret);
    }

    return this.accessToken;
  }
}
