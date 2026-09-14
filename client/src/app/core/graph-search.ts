const FILE_SEARCH_FIELDS = [
  'id',
  'name',
  'webUrl',
  'size',
  'createdDateTime',
  'lastModifiedDateTime',
  'createdBy',
  'lastModifiedBy'
];

export function buildFileSearchRequest(query: string) {
  return {
    requests: [{
      entityTypes: ['driveItem'],
      query: { queryString: `${query} AND isDocument=true` },
      from: 0,
      size: 25,
      fields: FILE_SEARCH_FIELDS
    }]
  };
}

function graphStatus(error: unknown): number | undefined {
  if (!error || typeof error !== 'object') return undefined;
  const candidate = error as { statusCode?: unknown; status?: unknown };
  const status = candidate.statusCode ?? candidate.status;
  return typeof status === 'number' ? status : undefined;
}

export async function withTransientGraphRetry<T>(operation: () => Promise<T>): Promise<T> {
  try {
    return await operation();
  } catch (error) {
    const status = graphStatus(error);
    // The Graph SDK already owns retries for 429, 503, and 504.
    // Add one application retry only for transient statuses it does not handle.
    if (status !== 500 && status !== 502) throw error;
    return operation();
  }
}
