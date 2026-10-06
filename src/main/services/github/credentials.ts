/** What GitHub returns for a signed-in user. Expiry fields are null for non-expiring tokens. */
export interface GitHubCredentials {
  readonly accessToken: string
  readonly refreshToken: string | null
  /** Epoch ms when the access token stops working, or null if it never expires. */
  readonly accessTokenExpiresAt: number | null
  /** Epoch ms when the refresh token stops working. */
  readonly refreshTokenExpiresAt: number | null
}
