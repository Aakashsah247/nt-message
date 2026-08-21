import {
  Controller,
  Get,
  Headers,
  HttpException,
  HttpStatus,
  Query,
  Res,
  StreamableFile,
} from '@nestjs/common';
import { createReadStream } from 'node:fs';
import type { Response } from 'express';

import { ConversationsService } from './conversations.service';
import {
  MessageAttachmentStreamService,
  parseSingleByteRange,
} from './message-attachment-stream.service';

@Controller('message-media')
export class MessageAttachmentStreamController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly streamService: MessageAttachmentStreamService,
  ) {}

  @Get('stream')
  async streamMessageAttachment(
    @Query('token') token: string | undefined,
    @Headers('range') rangeHeader: string | undefined,
    @Res({ passthrough: true }) response: Response,
  ): Promise<StreamableFile> {
    if (!token) {
      throw new HttpException(
        'Media access token is required.',
        HttpStatus.UNAUTHORIZED,
      );
    }

    const access = await this.streamService.verifyAccessToken(token);
    const attachment = await this.conversationsService.getAttachmentDownload(
      access.user,
      access.conversationId,
      access.messageId,
      access.attachmentId,
    );

    const safeFileName = attachment.originalFileName.replace(/[\r\n"]/g, '_');
    const encodedFileName = encodeURIComponent(attachment.originalFileName);

    response.setHeader('Content-Type', attachment.mimeType);
    response.setHeader('Accept-Ranges', 'bytes');
    response.setHeader('Cache-Control', 'private, no-store');
    response.setHeader('Referrer-Policy', 'no-referrer');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
    response.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
    response.setHeader(
      'Content-Disposition',
      `inline; filename="${safeFileName}"; filename*=UTF-8''${encodedFileName}`,
    );

    if (!rangeHeader) {
      response.setHeader('Content-Length', String(attachment.fileSizeBytes));
      return new StreamableFile(createReadStream(attachment.absolutePath));
    }

    const range = parseSingleByteRange(
      rangeHeader,
      attachment.fileSizeBytes,
    );

    if (!range) {
      response.setHeader(
        'Content-Range',
        `bytes */${attachment.fileSizeBytes}`,
      );
      throw new HttpException(
        'Requested media range is not available.',
        HttpStatus.REQUESTED_RANGE_NOT_SATISFIABLE,
      );
    }

    const contentLength = range.end - range.start + 1;

    response.status(HttpStatus.PARTIAL_CONTENT);
    response.setHeader(
      'Content-Range',
      `bytes ${range.start}-${range.end}/${attachment.fileSizeBytes}`,
    );
    response.setHeader('Content-Length', String(contentLength));

    return new StreamableFile(
      createReadStream(attachment.absolutePath, {
        start: range.start,
        end: range.end,
      }),
    );
  }
}
