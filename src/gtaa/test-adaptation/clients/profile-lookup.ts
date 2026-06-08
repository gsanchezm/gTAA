/**
 * Test Adaptation layer — profile lookup.
 *
 * The mobile profile card renders the user's `full_name`, which is shared and
 * mutable on the demo backend (profile-update scenarios change it). So the card
 * assertion compares against the FRESH backend value rather than the static
 * login alias — mirroring the reference, whose route reads the card and checks
 * it against a just-fetched `full_name`. Uses the shared httpRequest (transient
 * retry); pure relative to the supplied bearer token.
 */
import { appConfig } from '../../configuration/environments/env';
import { httpRequest } from './http-client';

const PROFILE_PATH = '/api/users/me/profile';

/** The authenticated user's current full name, or undefined if unavailable. */
export async function fetchProfileFullName(token: string | undefined): Promise<string | undefined> {
  if (!token) return undefined;
  const baseUrl = appConfig().apiBaseUrl.replace(/\/+$/, '');
  const res = await httpRequest({
    method: 'GET',
    url: baseUrl + PROFILE_PATH,
    headers: { Accept: 'application/json', Authorization: `Bearer ${token}` },
  });
  const body = res.json as { full_name?: string } | null;
  const name = body?.full_name;
  return typeof name === 'string' && name.length > 0 ? name : undefined;
}
