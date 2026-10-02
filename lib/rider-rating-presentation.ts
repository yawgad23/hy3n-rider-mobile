export type RatingSubmissionFailure = {
  code?: string;
  message?: string;
};

export type RatingSubmissionPresentation =
  | { kind: 'submitted'; title: string; message: string }
  | { kind: 'failed'; title: string; message: string };

/**
 * A network response may be lost after the server has already committed the
 * one allowed rating. Treat that idempotent retry as success, never as a false
 * failure. Other server messages are safe, actionable Rider-facing copy.
 */
export function presentDriverRatingSubmissionError(error: unknown): RatingSubmissionPresentation {
  const failure = error && typeof error === 'object'
    ? error as RatingSubmissionFailure
    : {};
  const message = typeof failure.message === 'string' ? failure.message.trim() : '';

  if (failure.code === 'rating_already_submitted') {
    return {
      kind: 'submitted',
      title: 'Thank you!',
      message: 'Your rating has been received. We appreciate your feedback.',
    };
  }

  return {
    kind: 'failed',
    title: 'Rating not submitted',
    message: message || 'Your rating could not be submitted. Please try again.',
  };
}
