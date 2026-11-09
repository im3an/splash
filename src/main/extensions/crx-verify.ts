import {
  createHash,
  createPublicKey,
  verify,
  type KeyObject,
} from 'node:crypto';

/**
 * Checks a Chrome Web Store download the way Chrome does (see
 * components/crx_file/crx_verifier.cc, CRX3_WITH_PUBLISHER_PROOF).
 * electron-chrome-web-store reads the id from a package and never checks a
 * signature, so without this a package is trusted because it came over TLS.
 * The build adds this to the library's one reading of a download, which covers
 * both first installs and updates.
 */

/** SHA-256 of Google's key, which signs everything the store publishes. */
export const WEB_STORE_KEY_HASH =
  '61f7f2a6bfcf74cd0bc1fe2497cc9b04254c658f79f2145392867ea8366367cf';

/** The line of the library that vite.main.config.mts rewrites. */
export const CRX_SEAM = 'return parseCrx(crxBuffer);';

const SIGNATURE_CONTEXT = Buffer.from('CRX3 SignedData\0');
const PREAMBLE_BYTES = 12;
const CRX_ID_BYTES = 16;

// Field numbers from Chromium's crx3.proto.
const RSA_PROOFS = 2;
const ECDSA_PROOFS = 3;
const SIGNED_HEADER_DATA = 10000;
const PUBLIC_KEY = 1;
const SIGNATURE = 2;
const CRX_ID = 1;

const VARINT = 0;
const FIXED_64 = 1;
const LENGTH_DELIMITED = 2;
const FIXED_32 = 5;

function badHeader(): Error {
  return new Error('The extension’s package has a damaged CRX header.');
}

/** The length-delimited fields of a protobuf message, in order. */
function fieldsOf(
  message: Buffer,
  known: readonly number[],
): [number, Buffer][] {
  const fields: [number, Buffer][] = [];
  let at = 0;

  const varint = (): number => {
    let value = 0;
    for (let shift = 1; shift <= 2 ** 49; shift *= 128) {
      const byte = message[at];
      if (byte === undefined) throw badHeader();
      at += 1;
      value += (byte & 127) * shift;
      if (byte < 128) return value;
    }
    throw badHeader();
  };

  while (at < message.length) {
    const tag = varint();
    const number = Math.floor(tag / 8);
    const wire = tag % 8;
    // The library's reader ignores this mark, so a known field marked as
    // anything else could mean one thing here and another there.
    if (known.includes(number) && wire !== LENGTH_DELIMITED) throw badHeader();
    if (wire === VARINT) {
      varint();
    } else if (wire === FIXED_64 || wire === FIXED_32) {
      at += wire === FIXED_64 ? 8 : 4;
    } else if (wire === LENGTH_DELIMITED) {
      const length = varint();
      if (length > message.length - at) throw badHeader();
      fields.push([number, message.subarray(at, at + length)]);
      at += length;
    } else {
      throw badHeader();
    }
    if (at > message.length) throw badHeader();
  }
  return fields;
}

const named = (fields: [number, Buffer][], number: number): Buffer[] =>
  fields.filter(([field]) => field === number).map(([, data]) => data);

function onlyOne(fields: [number, Buffer][], number: number): Buffer {
  const found = named(fields, number);
  if (found.length !== 1) throw badHeader();
  return found[0]!;
}

function publicKeyOf(der: Buffer, type: 'rsa' | 'ec'): KeyObject {
  let key: KeyObject;
  try {
    key = createPublicKey({ key: der, format: 'der', type: 'spki' });
  } catch {
    throw new Error('The extension’s package has an unreadable public key.');
  }
  if (key.asymmetricKeyType !== type) {
    throw new Error('The extension’s package has the wrong kind of key.');
  }
  return key;
}

/**
 * The extension id a package is signed for, if every proof in it holds, one is
 * from the key its id comes from, and one is from the store. Throws otherwise.
 */
export function verifyCrx(
  crx: Buffer,
  publisherKeyHash: string = WEB_STORE_KEY_HASH,
): string {
  if (
    crx.length < PREAMBLE_BYTES ||
    crx.toString('latin1', 0, 4) !== 'Cr24' ||
    crx.readUInt32LE(4) !== 3
  ) {
    throw new Error('This isn’t a CRX3 package.');
  }
  const headerBytes = crx.readUInt32LE(8);
  if (headerBytes > crx.length - PREAMBLE_BYTES) throw badHeader();
  const header = crx.subarray(PREAMBLE_BYTES, PREAMBLE_BYTES + headerBytes);
  const archive = crx.subarray(PREAMBLE_BYTES + headerBytes);
  // An end-of-archive marker here could make a zip reader start in the header,
  // which no signature would then cover.
  if (header.includes('PK\x05\x06') || header.includes('PK\x06\x07')) {
    throw badHeader();
  }

  const fields = fieldsOf(header, [
    RSA_PROOFS,
    ECDSA_PROOFS,
    SIGNED_HEADER_DATA,
  ]);
  const signedData = onlyOne(fields, SIGNED_HEADER_DATA);
  const crxId = onlyOne(fieldsOf(signedData, [CRX_ID]), CRX_ID);
  if (crxId.length !== CRX_ID_BYTES) throw badHeader();

  const size = Buffer.alloc(4);
  size.writeUInt32LE(signedData.length);
  const message = Buffer.concat([SIGNATURE_CONTEXT, size, signedData, archive]);

  const proofs = [
    ...named(fields, RSA_PROOFS).map((data) => ({
      data,
      type: 'rsa' as const,
    })),
    ...named(fields, ECDSA_PROOFS).map((data) => ({
      data,
      type: 'ec' as const,
    })),
  ];
  let signedByAuthor = false;
  let signedByStore = false;
  for (const { data, type } of proofs) {
    const proof = fieldsOf(data, [PUBLIC_KEY, SIGNATURE]);
    const der = named(proof, PUBLIC_KEY)[0];
    const signature = named(proof, SIGNATURE)[0];
    if (!der || !signature) {
      throw new Error('The extension’s package has an incomplete proof.');
    }
    const key = publicKeyOf(der, type);
    // Every proof has to hold, not only the ones that are needed: Chrome's
    // rule, and it leaves nothing unchecked for another reader to lean on.
    if (!verify('sha256', message, key, signature)) {
      throw new Error('The extension’s package fails a signature check.');
    }
    const hash = createHash('sha256').update(der).digest();
    signedByAuthor ||= hash.subarray(0, CRX_ID_BYTES).equals(crxId);
    signedByStore ||= hash.toString('hex') === publisherKeyHash;
  }
  if (!signedByAuthor) {
    throw new Error('The extension’s package isn’t signed by its author.');
  }
  if (!signedByStore) {
    throw new Error(
      'The extension’s package isn’t signed by the Chrome Web Store.',
    );
  }
  return crxId
    .toString('hex')
    .replace(/./g, (digit) =>
      String.fromCharCode(97 + Number.parseInt(digit, 16)),
    );
}

type RejectionListener = (reason: string) => void;
const listeners = new Set<RejectionListener>();

/** Hears each package refused; returns how to stop. */
export function onCrxRejected(listener: RejectionListener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/**
 * What the library's `readCrx` becomes: nothing is parsed, let alone unpacked,
 * until the signatures hold, and the id it then reads has to be the one signed.
 */
export function verifiedCrx<Crx extends { extensionId: string }>(
  crx: Buffer,
  parse: (crx: Buffer) => Crx,
  publisherKeyHash?: string,
): Crx {
  try {
    const signedId = verifyCrx(crx, publisherKeyHash);
    const parsed = parse(crx);
    if (parsed.extensionId !== signedId) {
      throw new Error('The extension’s package names two different ids.');
    }
    return parsed;
  } catch (error) {
    const reason = error instanceof Error ? error.message : String(error);
    for (const listener of listeners) listener(reason);
    throw error;
  }
}
