export class NotFoundError extends Error {}

export class ConflictError extends Error {
  constructor(
    message: string,
    readonly slug?: string,
  ) {
    super(message)
  }
}
