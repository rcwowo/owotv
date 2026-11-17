export class NotFoundError extends Error {}

export class ConflictError extends Error {
  constructor(
    message: string,
    readonly slug?: string,
  ) {
    super(message)
  }
}

export class ChannelNotEmptyError extends ConflictError {
  constructor(
    slug: string,
    readonly vodCount: number,
    readonly showCount: number,
  ) {
    super(
      `Channel "${slug}" still has ${vodCount} VOD${vodCount === 1 ? '' : 's'} and ${showCount} show${showCount === 1 ? '' : 's'}. Delete or move them first.`,
      slug,
    )
  }
}
