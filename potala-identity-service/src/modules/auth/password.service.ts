import { Injectable } from '@nestjs/common';
import * as argon2 from 'argon2';

@Injectable()
export class PasswordService {
  async hash(plainPassword: string): Promise<string> {
    return argon2.hash(plainPassword, {
      type: argon2.argon2id,
      memoryCost: process.env.NODE_ENV === 'test' ? 4096 : 65536,
      timeCost: process.env.NODE_ENV === 'test' ? 1 : 3,
      parallelism: 1,
    });
  }

  async verify(passwordHash: string, plainPassword: string): Promise<boolean> {
    return argon2.verify(passwordHash, plainPassword);
  }
}
