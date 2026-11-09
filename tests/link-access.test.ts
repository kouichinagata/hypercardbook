import test from 'node:test';
import assert from 'node:assert/strict';
import { canShareByLink, shareModeOf } from '../src/lib/link-access.ts';
import { parseBookFrontmatter } from '../src/lib/book-frontmatter.ts';

test('share mode: public wins, then link, then private', () => {
    assert.equal(shareModeOf(true, false), 'public');
    assert.equal(shareModeOf(true, true), 'public');
    assert.equal(shareModeOf(false, true), 'link');
    assert.equal(shareModeOf(false, false), 'private');
});

test('contracts and certificates cannot be shared by link', () => {
    assert.ok(canShareByLink('---\nid: c\nplay_mode: card\n---\n# Card'));
    assert.ok(!canShareByLink('---\nid: c\ncontract_source_id: abc\nplay_mode: card\n---\n# Contract'));
    assert.ok(!canShareByLink('---\nid: c\ncertificate_issuance_id: abc\n---\n# Certificate'));
    assert.ok(canShareByLink('# No front matter'));
});

test('link_access is read from the front matter', () => {
    assert.equal(parseBookFrontmatter('---\nid: a\nplay_mode: card\nlink_access: true\n---\nx').linkAccess, true);
    assert.equal(parseBookFrontmatter('---\nid: a\nplay_mode: card\nlink_access: false\n---\nx').linkAccess, false);
    assert.equal(parseBookFrontmatter('---\nid: a\nplay_mode: card\n---\nx').linkAccess, undefined);
});
