import assert from 'node:assert/strict';
import test from 'node:test';
import { buildGraphMessagePath, getReplyToId } from '../src/app/core/graph-message-path.ts';

const teamId = 'f73f9c33-1330-4ce1-afa0-0c963b6067b1';
const channelId = '19:x1Y2YI_Dsse2XmZukdUOjlncjVITFofD169jyNp8xvU1@thread.tacv2';

test('builds a root channel-message path', () => {
  assert.equal(
    buildGraphMessagePath({ teamId, channelId, messageId: '1672430562414' }),
    `/teams/${teamId}/channels/${encodeURIComponent(channelId)}/messages/1672430562414`
  );
});

test('builds a channel-reply path from the Teams web URL parent', () => {
  const webUrl = `https://teams.microsoft.com/l/message/${encodeURIComponent(channelId)}/1672430562414?groupId=${teamId}&parentMessageId=1672430000000`;
  assert.equal(getReplyToId({ teamId, channelId, messageId: '1672430562414', webUrl }), '1672430000000');
  assert.equal(
    buildGraphMessagePath({ teamId, channelId, messageId: '1672430562414', webUrl }),
    `/teams/${teamId}/channels/${encodeURIComponent(channelId)}/messages/1672430000000/replies/1672430562414`
  );
});

test('prefers an explicit replyToId when Graph supplies one', () => {
  assert.equal(
    buildGraphMessagePath({ teamId, channelId, messageId: 'reply', replyToId: 'root', webUrl: 'not a URL' }),
    `/teams/${teamId}/channels/${encodeURIComponent(channelId)}/messages/root/replies/reply`
  );
});

test('builds a chat-message path', () => {
  assert.equal(
    buildGraphMessagePath({ chatId: '19:chat@thread.v2', messageId: 'message' }),
    `/chats/${encodeURIComponent('19:chat@thread.v2')}/messages/message`
  );
});

test('ignores malformed Teams web URLs', () => {
  assert.equal(getReplyToId({ teamId, channelId, messageId: 'message', webUrl: 'not a URL' }), undefined);
});
