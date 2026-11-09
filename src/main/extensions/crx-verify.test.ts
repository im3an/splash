import {
  createHash,
  generateKeyPairSync,
  sign,
  type KeyObject,
} from 'node:crypto';
import { readFileSync } from 'node:fs';
import {
  CRX_SEAM,
  onCrxRejected,
  verifiedCrx,
  verifyCrx,
  WEB_STORE_KEY_HASH,
} from './crx-verify';

interface Key {
  publicDer: Buffer;
  privateKey: KeyObject;
}

function rsaKey(): Key {
  const { publicKey, privateKey } = generateKeyPairSync('rsa', {
    modulusLength: 2048,
  });
  return {
    publicDer: publicKey.export({ type: 'spki', format: 'der' }),
    privateKey,
  };
}

function ecKey(): Key {
  const { publicKey, privateKey } = generateKeyPairSync('ec', {
    namedCurve: 'P-256',
  });
  return {
    publicDer: publicKey.export({ type: 'spki', format: 'der' }),
    privateKey,
  };
}

// Generated once: RSA keys are slow to make.
const developer = rsaKey();
const publisher = rsaKey();
const stranger = rsaKey();
const publisherHash = (key: Key) =>
  createHash('sha256').update(key.publicDer).digest('hex');
const testPublisher = publisherHash(publisher);

const crxIdOf = (key: Key) =>
  createHash('sha256').update(key.publicDer).digest().subarray(0, 16);
const extensionIdOf = (crxId: Buffer) =>
  crxId
    .toString('hex')
    .replace(/./g, (digit) =>
      String.fromCharCode(97 + Number.parseInt(digit, 16)),
    );

function varint(value: number): Buffer {
  const bytes: number[] = [];
  while (value > 127) {
    bytes.push((value % 128) | 128);
    value = Math.floor(value / 128);
  }
  bytes.push(value);
  return Buffer.from(bytes);
}

/** A length-delimited protobuf field. */
const field = (number: number, data: Buffer) =>
  Buffer.concat([varint(number * 8 + 2), varint(data.length), data]);

function uint32(value: number): Buffer {
  const bytes = Buffer.alloc(4);
  bytes.writeUInt32LE(value);
  return bytes;
}

const signedMessage = (signedData: Buffer, archive: Buffer) =>
  Buffer.concat([
    Buffer.from('CRX3 SignedData\0'),
    uint32(signedData.length),
    signedData,
    archive,
  ]);

const proof = (key: Key, message: Buffer) =>
  Buffer.concat([
    field(1, key.publicDer),
    field(2, sign('sha256', message, key.privateKey)),
  ]);

function assemble(header: Buffer, archive: Buffer): Buffer {
  return Buffer.concat([
    Buffer.from('Cr24'),
    uint32(3),
    uint32(header.length),
    header,
    archive,
  ]);
}

const ARCHIVE = Buffer.from('PK\x03\x04 the extension itself');

interface Options {
  rsa?: Key[];
  ecdsa?: Key[];
  crxId?: Buffer;
  archive?: Buffer;
}

/** A well-formed CRX3; by default what the Web Store itself would serve. */
function crx({
  rsa = [developer, publisher],
  ecdsa = [],
  crxId = crxIdOf(developer),
  archive = ARCHIVE,
}: Options = {}): Buffer {
  const signedData = field(1, crxId);
  const message = signedMessage(signedData, archive);
  return assemble(
    Buffer.concat([
      ...rsa.map((key) => field(2, proof(key, message))),
      ...ecdsa.map((key) => field(3, proof(key, message))),
      field(10000, signedData),
    ]),
    archive,
  );
}

const verify = (file: Buffer) => verifyCrx(file, testPublisher);

describe('verifyCrx', () => {
  it('accepts what the store serves, and says whose it is', () => {
    expect(verify(crx())).toBe(extensionIdOf(crxIdOf(developer)));
  });

  it('accepts an elliptic curve key too', () => {
    const curve = ecKey();
    expect(
      verifyCrx(
        crx({
          ecdsa: [curve],
          crxId: crxIdOf(curve),
          rsa: [publisher],
        }),
        testPublisher,
      ),
    ).toBe(extensionIdOf(crxIdOf(curve)));
  });

  it('rejects a package its author signed but the store did not', () => {
    expect(() => verify(crx({ rsa: [developer] }))).toThrow(/Chrome Web Store/);
  });

  it('checks for Google’s own key unless told otherwise', () => {
    expect(() => verifyCrx(crx())).toThrow(/Chrome Web Store/);
    expect(WEB_STORE_KEY_HASH).toHaveLength(64);
  });

  it('rejects a publisher proof from any other key', () => {
    expect(() => verify(crx({ rsa: [developer, stranger] }))).toThrow(
      /Chrome Web Store/,
    );
  });

  it('rejects a changed archive', () => {
    const file = crx();
    file[file.length - 1]! ^= 1;
    expect(() => verify(file)).toThrow(/signature/);
  });

  it('rejects extra bytes after the archive', () => {
    expect(() => verify(Buffer.concat([crx(), Buffer.from('more')]))).toThrow(
      /signature/,
    );
  });

  it('rejects a package claiming another extension’s id', () => {
    expect(() => verify(crx({ crxId: crxIdOf(stranger) }))).toThrow(/author/);
  });

  it('rejects a bad proof even when the required ones are good', () => {
    const signedData = field(1, crxIdOf(developer));
    const message = signedMessage(signedData, ARCHIVE);
    const forged = Buffer.concat([
      field(1, stranger.publicDer),
      field(2, Buffer.alloc(256, 7)),
    ]);
    const file = assemble(
      Buffer.concat([
        field(2, proof(developer, message)),
        field(2, proof(publisher, message)),
        field(2, forged),
        field(10000, signedData),
      ]),
      ARCHIVE,
    );
    expect(() => verify(file)).toThrow(/signature/);
  });

  it('rejects a key filed under the wrong algorithm', () => {
    const signedData = field(1, crxIdOf(developer));
    const message = signedMessage(signedData, ARCHIVE);
    const file = assemble(
      Buffer.concat([
        field(2, proof(developer, message)),
        field(3, proof(publisher, message)),
        field(10000, signedData),
      ]),
      ARCHIVE,
    );
    expect(() => verify(file)).toThrow(/key/);
  });

  it('rejects a proof with a part missing', () => {
    const signedData = field(1, crxIdOf(developer));
    const message = signedMessage(signedData, ARCHIVE);
    const file = assemble(
      Buffer.concat([
        field(2, proof(developer, message)),
        field(2, proof(publisher, message)),
        field(2, field(1, stranger.publicDer)),
        field(10000, signedData),
      ]),
      ARCHIVE,
    );
    expect(() => verify(file)).toThrow(/proof/);
  });

  it('rejects two answers to the same question', () => {
    const signedData = field(1, crxIdOf(developer));
    const message = signedMessage(signedData, ARCHIVE);
    const twice = Buffer.concat([
      field(2, proof(developer, message)),
      field(2, proof(publisher, message)),
      field(10000, signedData),
      field(10000, field(1, crxIdOf(stranger))),
    ]);
    expect(() => verify(assemble(twice, ARCHIVE))).toThrow(/header/);
  });

  it('rejects a known field sent as the wrong kind of value', () => {
    const signedData = field(1, crxIdOf(developer));
    const message = signedMessage(signedData, ARCHIVE);
    const sneaky = Buffer.concat([
      field(2, proof(developer, message)),
      field(2, proof(publisher, message)),
      field(10000, signedData),
      // Field 10000 again, marked as a number: readers that ignore the mark
      // would take what follows as the signed data.
      varint(10000 * 8),
      varint(4),
    ]);
    expect(() => verify(assemble(sneaky, ARCHIVE))).toThrow(/header/);
  });

  it('rejects an end-of-archive marker hidden in the header', () => {
    const signedData = field(1, crxIdOf(developer));
    const message = signedMessage(signedData, ARCHIVE);
    const file = assemble(
      Buffer.concat([
        field(2, proof(developer, message)),
        field(2, proof(publisher, message)),
        field(10000, signedData),
        field(4, Buffer.from('PK\x05\x06')),
      ]),
      ARCHIVE,
    );
    expect(() => verify(file)).toThrow(/header/);
  });

  it('rejects anything that isn’t a CRX3', () => {
    expect(() => verify(Buffer.from('nope'))).toThrow(/CRX/);
    expect(() => verify(Buffer.alloc(0))).toThrow(/CRX/);
    const old = crx();
    old.writeUInt32LE(2, 4);
    expect(() => verify(old)).toThrow(/CRX/);
    const notOne = crx();
    notOne[0] = 0;
    expect(() => verify(notOne)).toThrow(/CRX/);
  });

  it('rejects a header that runs off the end', () => {
    const file = crx();
    file.writeUInt32LE(file.length, 8);
    expect(() => verify(file)).toThrow(/header/);
  });

  it('rejects damaged protobuf rather than crashing', () => {
    expect(() => verify(assemble(Buffer.from([0xff, 0xff]), ARCHIVE))).toThrow(
      /header/,
    );
    expect(() =>
      verify(
        assemble(Buffer.concat([varint(2 * 8 + 2), varint(9999)]), ARCHIVE),
      ),
    ).toThrow(/header/);
    expect(() => verify(assemble(Buffer.alloc(0), ARCHIVE))).toThrow(/header/);
  });

  it('rejects an id of the wrong length', () => {
    expect(() => verify(crx({ crxId: Buffer.alloc(8, 1) }))).toThrow(/header/);
  });

  it('accepts a part of a larger buffer', () => {
    const file = crx();
    const padded = Buffer.concat([Buffer.alloc(7), file]).subarray(7);
    expect(verify(padded)).toBe(extensionIdOf(crxIdOf(developer)));
  });
});

describe('verifiedCrx', () => {
  const parsed = (extensionId: string) => () => ({ extensionId, contents: 1 });
  const id = extensionIdOf(crxIdOf(developer));

  it('hands back what the library parsed', () => {
    expect(verifiedCrx(crx(), parsed(id), testPublisher)).toEqual({
      extensionId: id,
      contents: 1,
    });
  });

  it('doesn’t parse a file that fails', () => {
    const parse = vi.fn(parsed(id));
    expect(() =>
      verifiedCrx(crx({ rsa: [developer] }), parse, testPublisher),
    ).toThrow();
    expect(parse).not.toHaveBeenCalled();
  });

  it('refuses when the library reads a different id', () => {
    expect(() =>
      verifiedCrx(crx(), parsed('a'.repeat(32)), testPublisher),
    ).toThrow(/different/);
  });

  it('tells whoever is listening, once per rejection', () => {
    const listener = vi.fn();
    const stop = onCrxRejected(listener);
    expect(() => verifiedCrx(Buffer.from('nope'), parsed(id))).toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
    expect(listener.mock.calls[0]![0]).toMatch(/CRX/);
    stop();
    expect(() => verifiedCrx(Buffer.from('nope'), parsed(id))).toThrow();
    expect(listener).toHaveBeenCalledTimes(1);
  });
});

describe('the library', () => {
  // The build rewrites this line (see vite.main.config.mts) and fails if it's
  // gone; this says so sooner, and makes an upgrade look at the check again.
  it('still reads downloads in the one place the check is added', () => {
    const source = readFileSync(
      'node_modules/electron-chrome-web-store/dist/cjs/browser/index.js',
      'utf8',
    );
    expect(source.split(CRX_SEAM)).toHaveLength(2);
    expect(source.match(/parseCrx\(/g)).toHaveLength(2);
  });
});
