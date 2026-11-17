import assert from 'node:assert/strict';
import { test } from 'node:test';
import { eventImageFit, eventImageUrl, meetupPhotoUrl, safeImageUrl } from '../eventImage';

test('image URLs: https on the feed hosts only', () => {
  assert.equal(safeImageUrl('https://secure.meetupstatic.com/photos/event/b/3/e/8/highres_537166056.jpeg'), 'https://secure.meetupstatic.com/photos/event/b/3/e/8/highres_537166056.jpeg');
  assert.ok(safeImageUrl('https://d112y698adiu2z.cloudfront.net/photos/production/challenge_thumbnails/005/585/149/datas/medium_square.png'));
  assert.equal(safeImageUrl('http://secure.meetupstatic.com/a.jpg'), undefined);
  assert.equal(safeImageUrl('https://evil.example.com/a.jpg'), undefined);
  assert.equal(safeImageUrl('https://meetupstatic.com.evil.io/a.jpg'), undefined);
  assert.equal(safeImageUrl('https://user:pw@secure.meetupstatic.com/a.jpg'), undefined);
  assert.equal(safeImageUrl('javascript:alert(1)'), undefined);
  assert.equal(safeImageUrl('//d112y698adiu2z.cloudfront.net/a.png'), undefined);
  assert.equal(safeImageUrl(''), undefined);
  assert.equal(safeImageUrl(undefined), undefined);
});

test('Meetup: the sized rendition when the API gives id + baseUrl, else highres', () => {
  assert.equal(
    meetupPhotoUrl({ id: '537166056', baseUrl: 'https://secure-content.meetupstatic.com/images/classic-events/', highResUrl: 'https://secure.meetupstatic.com/h.jpeg' }),
    'https://secure-content.meetupstatic.com/images/classic-events/537166056/1080x608.webp',
  );
  assert.equal(meetupPhotoUrl({ highResUrl: 'https://secure.meetupstatic.com/h.jpeg' }), 'https://secure.meetupstatic.com/h.jpeg');
  assert.equal(meetupPhotoUrl({ id: '1', baseUrl: 'https://elsewhere.example/', highResUrl: 'https://elsewhere.example/h.jpeg' }), undefined);
  assert.equal(meetupPhotoUrl(null), undefined);
});

test('fallback: demo events and bad URLs get the tile; Devpost logos are contained', () => {
  assert.equal(eventImageUrl({ isDemo: true, image: 'https://secure.meetupstatic.com/a.jpg' }), undefined);
  assert.equal(eventImageUrl({ isDemo: false, image: undefined }), undefined);
  assert.equal(eventImageUrl({ isDemo: false, image: 'https://secure.meetupstatic.com/a.jpg' }), 'https://secure.meetupstatic.com/a.jpg');
  assert.equal(eventImageFit({ source: 'Devpost' }), 'contain');
  assert.equal(eventImageFit({ source: 'Meetup' }), 'cover');
  assert.equal(eventImageFit({ source: undefined }), 'cover');
});
