import test from 'node:test';
import assert from 'node:assert/strict';
import { albumTrackMetadata, buildAlbumQueue } from '../lib/audioAlbum.ts';

test('parses common album track filename conventions', () => {
  assert.deepEqual(albumTrackMetadata('album/01 - Night Drive.mp3'), { artist: '', title: 'Night Drive' });
  assert.deepEqual(albumTrackMetadata('album/Artist - Night Drive.wav'), { artist: 'Artist', title: 'Night Drive' });
  assert.deepEqual(albumTrackMetadata('album/02_Artist - Long Title.flac'), { artist: 'Artist', title: 'Long Title' });
});

test('naturally sorts tracks and matches same-stem or album cover art flexibly', () => {
  const files = [
    new File(['3'], 'album/03 - Last Song.mp3'),
    new File(['1'], 'album/01 - First Song.mp3'),
    new File(['2'], 'album/02 - Middle Song.mp3'),
  ];
  const covers = [
    new File(['same'], 'album/01 - First Song.jpg'),
    new File(['album'], 'album/cover.png'),
  ];
  const queue = buildAlbumQueue(files, covers);
  assert.deepEqual(queue.map((track) => track.title), ['First Song', 'Middle Song', 'Last Song']);
  assert.equal(queue[0].cover?.name, 'album/01 - First Song.jpg');
  assert.equal(queue[1].cover?.name, 'album/cover.png');
  assert.equal(queue[2].cover?.name, 'album/cover.png');
});
