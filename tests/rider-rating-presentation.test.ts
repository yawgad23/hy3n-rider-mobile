import { describe, expect, it } from 'vitest';
import { presentDriverRatingSubmissionError } from '../lib/rider-rating-presentation';

describe('Rider driver-rating submission presentation', () => {
  it('treats a retry after a committed rating as success', () => {
    expect(presentDriverRatingSubmissionError({
      code: 'rating_already_submitted',
      message: 'You have already rated this Driver for this ride.',
    })).toEqual({
      kind: 'submitted',
      title: 'Rating saved',
      message: 'Your rating for this Driver was already received.',
    });
  });

  it('keeps the server reason visible for a genuine failure', () => {
    expect(presentDriverRatingSubmissionError(new Error('Complete the ride before rating your Driver.'))).toEqual({
      kind: 'failed',
      title: 'Rating not submitted',
      message: 'Complete the ride before rating your Driver.',
    });
  });
});
