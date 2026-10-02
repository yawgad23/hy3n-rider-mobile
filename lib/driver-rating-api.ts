export type FirebaseRatingUser = {
  getIdToken(forceRefresh?: boolean): Promise<string>;
};

export type DriverRatingInput = {
  rideId: string;
  rating: number;
  feedback?: string;
  tags?: string[];
};

export type DriverRatingResult = {
  success: true;
  rating: number;
  driverRating: number;
  ratingCount: number;
  warnings?: string[];
};

export class DriverRatingRequestError extends Error {
  code?: string;

  constructor(message: string, code?: string) {
    super(message);
    this.name = 'DriverRatingRequestError';
    this.code = code;
  }
}

export async function submitAuthenticatedDriverRating(
  user: FirebaseRatingUser,
  input: DriverRatingInput,
  apiBaseUrl: string,
  request: typeof fetch = fetch,
): Promise<DriverRatingResult> {
  const token = await user.getIdToken(true);
  if (!token) throw new Error('Your sign-in session has expired. Please sign in again before rating your Driver.');

  const response = await request(`${apiBaseUrl.replace(/\/$/, '')}/api/rides/${encodeURIComponent(input.rideId)}/rate-driver`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      rating: input.rating,
      feedback: input.feedback || '',
      tags: input.tags || [],
    }),
  });
  const payload = await response.json().catch(() => null) as Partial<DriverRatingResult> & { code?: string; message?: string } | null;
  if (!response.ok || payload?.success !== true) {
    throw new DriverRatingRequestError(
      payload?.message || 'Your rating could not be submitted. Please try again.',
      payload?.code,
    );
  }
  return payload as DriverRatingResult;
}
