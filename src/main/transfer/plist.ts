/*
 * Reads Apple's binary property lists, which is what Safari keeps its bookmarks
 * in. Everything in the file is distrusted: offsets are bounds-checked, and a
 * reference back to an object already being read is refused rather than
 * followed forever.
 */

export type PlistValue =
  | string
  | number
  | boolean
  | null
  | Date
  | Uint8Array
  | PlistValue[]
  | { [key: string]: PlistValue };

const MAGIC = 'bplist00';
/** Seconds between the Unix epoch and Apple's, 1 January 2001. */
const APPLE_EPOCH_SECONDS = 978_307_200;

export function appleTimeToMs(seconds: number): number {
  return Math.round((seconds + APPLE_EPOCH_SECONDS) * 1000);
}

export function parseBinaryPlist(bytes: Uint8Array): PlistValue {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (
    bytes.length < 40 ||
    new TextDecoder().decode(bytes.subarray(0, 8)) !== MAGIC
  ) {
    throw new Error('Not a binary property list');
  }
  const trailer = bytes.length - 32;
  const offsetSize = view.getUint8(trailer + 6);
  const refSize = view.getUint8(trailer + 7);
  const objectCount = Number(view.getBigUint64(trailer + 8));
  const topObject = Number(view.getBigUint64(trailer + 16));
  const tableStart = Number(view.getBigUint64(trailer + 24));
  if (
    offsetSize < 1 ||
    offsetSize > 8 ||
    refSize < 1 ||
    refSize > 8 ||
    tableStart + objectCount * offsetSize > trailer
  ) {
    throw new Error('Damaged property list');
  }

  const uint = (at: number, size: number): number => {
    if (at < 0 || at + size > bytes.length) {
      throw new Error('Damaged property list');
    }
    let value = 0;
    for (let index = 0; index < size; index++) {
      value = value * 256 + bytes[at + index]!;
    }
    return value;
  };

  const reading = new Set<number>();

  const object = (index: number): PlistValue => {
    if (index >= objectCount || reading.has(index)) {
      throw new Error('Damaged property list');
    }
    reading.add(index);
    try {
      return read(uint(tableStart + index * offsetSize, offsetSize));
    } finally {
      reading.delete(index);
    }
  };

  const read = (at: number): PlistValue => {
    const marker = uint(at, 1);
    const kind = marker >> 4;
    const low = marker & 0x0f;
    let length = low;
    let body = at + 1;
    if (kind !== 0 && kind !== 1 && kind !== 2 && kind !== 3 && low === 0x0f) {
      const sizeMarker = uint(body, 1);
      const size = 1 << (sizeMarker & 0x0f);
      length = uint(body + 1, size);
      body += 1 + size;
    }
    switch (kind) {
      case 0x0:
        if (low === 8) return false;
        if (low === 9) return true;
        return null;
      case 0x1: {
        const size = 1 << low;
        if (size === 8) {
          uint(body, 8);
          return Number(view.getBigInt64(body));
        }
        return uint(body, size);
      }
      case 0x2: {
        uint(body, 1 << low);
        return low === 2 ? view.getFloat32(body) : view.getFloat64(body);
      }
      case 0x3:
        uint(body, 8);
        return new Date(appleTimeToMs(view.getFloat64(body)));
      case 0x4:
        uint(body, length);
        return bytes.subarray(body, body + length);
      case 0x5:
        uint(body, length);
        return new TextDecoder('latin1').decode(
          bytes.subarray(body, body + length),
        );
      case 0x6: {
        uint(body, length * 2);
        let text = '';
        for (let index = 0; index < length; index++) {
          text += String.fromCharCode(view.getUint16(body + index * 2));
        }
        return text;
      }
      case 0x8:
        return uint(body, low + 1);
      case 0xa:
      case 0xc:
        return Array.from({ length }, (_, index) =>
          object(uint(body + index * refSize, refSize)),
        );
      case 0xd: {
        const result: { [key: string]: PlistValue } = Object.create(null) as {
          [key: string]: PlistValue;
        };
        for (let index = 0; index < length; index++) {
          const key = object(uint(body + index * refSize, refSize));
          if (typeof key !== 'string') throw new Error('Damaged property list');
          result[key] = object(
            uint(body + (length + index) * refSize, refSize),
          );
        }
        return result;
      }
      default:
        throw new Error('Damaged property list');
    }
  };

  return object(topObject);
}
