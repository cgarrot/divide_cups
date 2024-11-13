import { Injectable, Logger } from '@nestjs/common';
import axios from 'axios';

@Injectable()
export class TournamentImageService {
  private readonly logger = new Logger(TournamentImageService.name);

  async generateBracketImage(bracket: any): Promise<Buffer | null> {
    try {
      this.logger.debug(
        `Generating bracket image with data: ${JSON.stringify(bracket)}`,
      );
      const response = await axios.post(
        'http://srv528328.hstgr.cloud:3000/export-bracket',
        bracket,
        {
          responseType: 'arraybuffer',
          timeout: 10000, // 10 seconds timeout
          headers: {
            'Content-Type': 'application/json',
          },
        },
      );

      if (
        response.headers['content-type'] !== 'application/json; charset=utf-8'
      ) {
        this.logger.warn(
          `Unexpected content type: ${response.headers['content-type']}`,
        );
      }

      return Buffer.from(response.data, 'binary');
    } catch (error) {
      this.logger.error(`Error generating bracket image: ${error.message}`);
      if (axios.isAxiosError(error) && error.response) {
        this.logger.error(`Response status: ${error.response.status}`);
        this.logger.error(`Response data: ${error.response.data.toString()}`);
      }
      return null;
    }
  }
}
