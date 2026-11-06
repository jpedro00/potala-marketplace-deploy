import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';

export class InvalidStockQuantityException extends BadRequestException {
  constructor() {
    super('Quantity must be a positive integer');
  }
}

export class InsufficientStockException extends ConflictException {
  constructor() {
    super('Insufficient stock');
  }
}

export class CannotReleaseReservationException extends ConflictException {
  constructor() {
    super('Cannot release reservation');
  }
}

export class CannotCommitReservedStockException extends ConflictException {
  constructor() {
    super('Cannot commit reserved stock');
  }
}

export class InvalidVariantIdException extends BadRequestException {
  constructor() {
    super('variantId must be a UUID v4');
  }
}

export class InvalidStockLevelException extends BadRequestException {
  constructor() {
    super('Quantity must be a non-negative integer');
  }
}

export class CannotSetQuantityBelowReservedException extends ConflictException {
  constructor() {
    super('Cannot set quantity below the currently reserved amount');
  }
}

export function assertInventoryExists(
  variant: { inventory: { id: string } | null } | null,
): void {
  if (!variant) {
    throw new NotFoundException('Variant not found');
  }
  if (!variant.inventory) {
    throw new NotFoundException('Inventory not found');
  }
}
