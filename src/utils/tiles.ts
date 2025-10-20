// Tile-related lookup tables and parsing utilities

// Fast string lookups to avoid repeated concatenations
const F_LOOKUP = [
  ['F00', 'F01'],
  ['F10', 'F11'],
  ['F20', 'F21'],
  ['F30', 'F31'],
] as const;

const NUM_OPEN_LOOKUP = ['O', '1', '2', '3', '4', '5', '6', '7'] as const;

// Byte → string LUTs to minimize per-tile branching
export const OPEN_LUT: (string | null)[] = new Array(256);
export const CLOSED0_LUT: string[] = new Array(256);
export const CLOSED1_LUT: string[] = new Array(256);

// Fast hex charCode -> nibble (0-15) lookup to avoid branching per tile
export const HEX_NIBBLE = new Int8Array(128);
(() => {
  for (let i = 0; i < HEX_NIBBLE.length; i++) HEX_NIBBLE[i] = -1;
  for (let c = 48; c <= 57; c++) HEX_NIBBLE[c] = c - 48; // '0'-'9'
  for (let c = 65; c <= 70; c++) HEX_NIBBLE[c] = c - 55; // 'A'-'F'
  for (let c = 97; c <= 102; c++) HEX_NIBBLE[c] = c - 87; // 'a'-'f'
})();

// Vectorized LUT: 16비트 조합으로 모든 경우의 수를 미리 계산 (64KB)
export const VECTORIZED_TILE_LUT = new Uint8Array(65536); // 16비트 = 2^16 = 65536

// 벡터화 LUT 초기화 - 모든 16비트 조합을 미리 계산
(() => {
  for (let i = 0; i < 65536; i++) {
    const byte1 = (i >> 8) & 0xff; // 상위 8비트 (첫 번째 hex 문자)
    const byte2 = i & 0xff; // 하위 8비트 (두 번째 hex 문자)

    // hex 문자를 바이트로 변환
    const n0 = byte1 < 128 ? HEX_NIBBLE[byte1] : -1;
    const n1 = byte2 < 128 ? HEX_NIBBLE[byte2] : -1;

    if (n0 < 0 || n1 < 0) {
      VECTORIZED_TILE_LUT[i] = 255; // 잘못된 hex
      continue;
    }

    const byte = (n0 << 4) | n1;

    // 비트 연산으로 타일 타입 계산
    const isOpened = (byte & 0b10000000) !== 0;
    const isMine = (byte & 0b01000000) !== 0;
    const isFlag = (byte & 0b00100000) !== 0;
    const color = (byte & 0b00011000) >> 3;
    const number = byte & 0b00000111;

    // 타일 타입을 숫자로 인코딩 (0-31 범위)
    if (isOpened) {
      VECTORIZED_TILE_LUT[i] = isMine ? 8 : number; // 8 = 'B', 0-7 = 숫자
    } else if (isFlag) {
      VECTORIZED_TILE_LUT[i] = 16 + color * 2; // 16-23 = F00-F31 (체커보드는 별도 처리)
    } else {
      VECTORIZED_TILE_LUT[i] = 24; // 24 = C0 (체커보드는 별도 처리)
    }
  }
})();

// initialize LUTs with SIMD-style bit optimization
(() => {
  for (let b = 0; b < 256; b++) {
    // SIMD-style: Calculate all bit flags at once for better performance
    const flags = b >> 5; // Extract upper 3 bits (isOpened, isMine, isFlag)
    const isOpened = (flags & 4) !== 0; // 0b100
    const isMine = (flags & 2) !== 0; // 0b010
    const isFlag = (flags & 1) !== 0; // 0b001
    const color = (b & 0b00011000) >> 3;
    const number = b & 0b00000111;

    if (isOpened) {
      OPEN_LUT[b] = isMine ? 'B' : NUM_OPEN_LOOKUP[number];
      CLOSED0_LUT[b] = 'C0';
      CLOSED1_LUT[b] = 'C1';
    } else if (isFlag) {
      OPEN_LUT[b] = null;
      const pair = F_LOOKUP[color];
      CLOSED0_LUT[b] = pair[0];
      CLOSED1_LUT[b] = pair[1];
    } else {
      OPEN_LUT[b] = null;
      CLOSED0_LUT[b] = 'C0';
      CLOSED1_LUT[b] = 'C1';
    }
  }
})();

/**
 * Parse Hex using direct byte operations (optimized)
 * @param hex {string} - Hex string
 * @param x {number} - Optional X coordinate for checkerboard pattern
 * @param y {number} - Optional Y coordinate for checkerboard pattern
 */
export const parseHex = (hex: string, x: number, y: number) => {
  if (hex.length < 2) return '';

  // Direct hex to integer conversion (much faster than string operations)
  const byte = parseInt(hex.slice(0, 2), 16);

  // Bit operations instead of string manipulation
  const isTileOpened = (byte & 0b10000000) !== 0; // bit 7 (MSB)
  const isMine = (byte & 0b01000000) !== 0; // bit 6
  const isFlag = (byte & 0b00100000) !== 0; // bit 5
  const color = (byte & 0b00011000) >> 3; // bits 4-3
  const number = byte & 0b00000111; // bits 2-0

  if (isTileOpened) return isMine ? 'B' : number === 0 ? 'O' : `${number}`;
  const checkerboard = (x + y) & 1;
  if (isFlag) return 'F' + color + checkerboard;
  return 'C' + checkerboard;
};
