export interface GraphMessageLocation {
  teamId?: string;
  channelId?: string;
  chatId?: string;
  messageId: string;
  replyToId?: string;
  webUrl?: string;
}

export function getReplyToId(location: GraphMessageLocation): string | undefined {
  if (location.replyToId) return location.replyToId;
  if (!location.webUrl) return undefined;

  try {
    return new URL(location.webUrl).searchParams.get('parentMessageId') || undefined;
  } catch {
    return undefined;
  }
}

export function buildGraphMessagePath(
  location: GraphMessageLocation,
  encodePathSegment: (value: string) => string = encodeURIComponent
): string {
  if (location.teamId && location.channelId) {
    const base = `/teams/${encodePathSegment(location.teamId)}/channels/${encodePathSegment(location.channelId)}/messages`;
    const replyToId = getReplyToId(location);
    return replyToId && replyToId !== location.messageId
      ? `${base}/${encodePathSegment(replyToId)}/replies/${encodePathSegment(location.messageId)}`
      : `${base}/${encodePathSegment(location.messageId)}`;
  }

  return `/chats/${encodePathSegment(location.chatId ?? '')}/messages/${encodePathSegment(location.messageId)}`;
}
