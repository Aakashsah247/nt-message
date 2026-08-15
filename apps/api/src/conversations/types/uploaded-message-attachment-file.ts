export interface UploadedMessageAttachmentFile {
  /**
   * Full bytes for legacy/small in-memory uploads, or only the first 8 KiB for
   * streamed message/announcement uploads where path contains the full file.
   */
  buffer: Buffer;
  /** Full temporary file path for streamed attachment uploads. */
  path?: string;
  originalname: string;
  mimetype: string;
  size: number;
}
